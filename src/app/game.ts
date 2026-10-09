/**
 * Where the pieces meet: a command becomes actions, actions become work, and
 * work becomes something Luciana says.
 *
 * This layer exists because src/world, src/render, src/folk and src/brain are
 * forbidden from importing src/ui. They raise events and expose state; this
 * puts it on the screen.
 */

import { effect } from '@preact/signals';
import { LlmBrain, type LlmSettings } from '../brain/llm';
import { ScriptedBrain } from '../brain/scripted';
import type { ChatTurn } from '../brain/brain';
import { validate, type Action } from '../brain/schema';
import { ActionQueue, type ActionWorld } from '../folk/actions';
import type { Kit } from '../folk/kit';
import { AIR, blockById, blockByName } from '../world/blocks';
import { AmbientChatter } from '../chat/ambient';
import { acknowledge, type Situation } from '../chat/dialogue';
import type { WorldView } from '../render/scene';
import {
  addLine,
  announce,
  blockMenu,
  brainMode,
  brainStatus,
  chat,
  clearChat,
  cycleTheme,
  kitStatus,
  modelSettings,
  onApplyModel,
  onBlockMenuChoice,
  onCommand,
  onForgetKey,
  onOnboardingDone,
  onPlayerAction,
  onReplayOnboarding,
  onResetWorld,
  onShareLink,
  onboarding,
  paletteOpen,
  perfView,
  preferences,
  restoreChat,
  settingsOpen,
  showToast,
  thinking,
} from '../ui/state';
import { isFirstRun, markWelcomeSeen } from './firstRun';
import { forgetKey, getKey, restoreKey, setKey } from './keyStore';
import { encodeVoxels, measure, serialize, type SaveFile } from './persistence';
import type { Session } from './session';
import { applyEdits, encodeShare } from './share';
import { blockById as lookupBlock } from '../world/blocks';
import type { PromptSituation } from '../brain/prompt';
import { TICK_MS, type FixedLoop } from './loop';

/** How many turns of back-and-forth the model brain will be shown in M5. */
const HISTORY_LENGTH = 6;

/** What Luciana says about each thing that can happen to a job. */
function voice(note: string, detail: Record<string, unknown> | undefined): string | null {
  const label = (id: unknown): string =>
    typeof id === 'number' ? (blockById(id)?.label ?? 'that') : 'that';

  switch (note) {
    case 'mined':
      return `Got the ${label(detail?.block)}.`;
    case 'gathered': {
      const got = typeof detail?.count === 'number' ? detail.count : 0;
      return got === 1
        ? `One ${label(detail?.block)}, as asked.`
        : `That is ${String(got)} ${label(detail?.block)}.`;
    }
    case 'gathered-some':
      return `I only found ${String(detail?.count ?? '')} of the ${String(detail?.wanted ?? '')}.`;
    case 'none-nearby':
      return `There is no ${label(detail?.block)} near here.`;
    case 'none-reachable':
      return `I can see ${label(detail?.block)}, but I cannot get to any of it.`;
    case 'nothing-there':
      return 'There is nothing there to dig.';
    case 'cannot-reach':
      return 'I cannot get there from here.';
    case 'blocked':
      return 'Someone is in my way.';
    case 'placed':
      return 'Down it goes.';
    case 'nothing-to-place':
      return `I am not carrying any ${label(detail?.block)}.`;
    case 'already-something-there':
      return 'Something is already there.';
    case 'nothing-to-build-on':
      return 'That spot is floating in mid-air.';
    case 'standing-there':
      return 'I would have to build on my own head.';
    case 'someone-in-the-way':
      return 'Someone is standing where that goes.';
    case 'no-such-kit':
      return 'I do not know anyone by that name.';
    case 'nowhere-to-wander':
      return 'There is nowhere to wander to.';
    case 'sculpted':
      return 'There. Better?';
    case 'painted':
      return 'A fresh coat.';
    case 'planted': {
      const grown = typeof detail?.changed === 'number' ? detail.changed : 0;
      return grown === 1 ? 'One tree, coming up.' : `${String(grown)} trees, coming up.`;
    }
    case 'nowhere-to-plant':
      return 'Nothing will take root there.';
    case 'scattered':
      return 'Scattered about.';
    case 'cleared':
      return 'All tidy.';
    case 'lifted':
      return 'Up we go.';
    case 'time-changed':
      return `There you go: ${String(detail?.phase ?? 'a new hour')}.`;
    case 'nothing-happened':
      return 'That did not change anything.';
    default:
      return null;
  }
}

/** Blocks from the orbit point that the near render distance keeps. */
export const NEAR_DISTANCE = 24;
/** Ticks between looks at whether anything needs saving: two seconds. */
const SAVE_EVERY_TICKS = 40;
/** Frames between perf readouts, and the window they summarise. */
const PERF_EVERY = 30;
const PERF_WINDOW = 120;

export interface Game {
  tick(): void;
  /** Once per drawn frame, for the perf readout. */
  frame(frameMs: number): void;
  /** Send a line of text to Luciana, as if typed. */
  send(text: string): void;
  dispose(): void;
}

export function createGame(view: WorldView, loop: FixedLoop, session: Session): Game {
  const scripted = new ScriptedBrain();
  let model: LlmBrain | null = null;
  const history: ChatTurn[] = [];
  const queues = new Map<string, ActionQueue>();

  const context: ActionWorld = {
    world: view.world,
    kits: view.kits,
    reticle: () => view.orbit.targetCell(),
    setDayPhase: (phase) => {
      loop.dayPhase = phase;
    },
    get seed() {
      return view.world.seed;
    },
    report: (kit, note, detail) => {
      const line = voice(note, detail);
      if (!line) return;
      addLine('kit', line);
      remember('kit', line);
      void kit;
    },
  };

  for (const kit of view.kits) queues.set(kit.id, new ActionQueue(kit, context));

  function remember(who: ChatTurn['who'], text: string): void {
    history.push({ who: who === 'kit' ? 'kit' : 'player', text });
    if (history.length > HISTORY_LENGTH) history.splice(0, history.length - HISTORY_LENGTH);
  }

  function refreshStatus(kit: Kit): void {
    const carrying = [...kit.inventory.entries()]
      .map(([id, count]) => ({ label: blockById(id)?.label ?? 'something', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    kitStatus.value = { name: kit.name, activity: kit.activity, carrying };
  }

  function situationOf(kit: Kit): Situation {
    const cell = kit.cell;
    const under = view.world.get(cell.x, cell.y - 1, cell.z);
    return {
      activity: kit.activity,
      cell,
      standingOn: blockById(under)?.label ?? null,
      carrying: [...kit.inventory.entries()]
        .map(([id, count]) => ({ label: blockById(id)?.label ?? 'something', count }))
        .sort((a, b) => b.count - a.count),
      dayPhase: loop.dayPhase,
    };
  }

  /** What the model is told it can see. Costs nothing when no model is set. */
  function promptSituation(kit: Kit): PromptSituation {
    const cell = kit.cell;
    const counts = new Map<number, number>();
    for (let dx = -8; dx <= 8; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dz = -8; dz <= 8; dz++) {
          const id = view.world.get(cell.x + dx, cell.y + dy, cell.z + dz);
          if (id !== 0) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
    const under = view.world.get(cell.x, cell.y - 1, cell.z);
    return {
      cell,
      standingOn: lookupBlock(under)?.label ?? null,
      dayPhase: loop.dayPhase,
      activity: kit.activity,
      queued: [],
      carrying: [...kit.inventory.entries()]
        .map(([id, count]) => ({ label: lookupBlock(id)?.label ?? 'something', count }))
        .sort((a, b) => b.count - a.count),
      nearby: [...counts.entries()]
        .map(([id, count]) => ({ label: lookupBlock(id)?.label ?? 'something', count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4),
      otherKits: view.kits
        .filter((other) => other.id !== kit.id)
        .map((other) => ({ name: other.name, doing: other.activity ?? 'nothing' })),
      reticle: view.orbit.targetCell(),
      pointingAt: view.pointedAt(),
    };
  }

  function useModel(settings: LlmSettings): void {
    model = new LlmBrain(settings, scripted, {
      onStatus: (status) => {
        brainMode.value = status.mode === 'model' ? 'model' : 'scripted';
        brainStatus.value = { used: status.used, limit: status.limit, error: status.error };
      },
    });
    brainMode.value = 'model';
    brainStatus.value = { used: 0, limit: 10, error: null };
  }

  onApplyModel.value = (request) => {
    setKey(request.apiKey, request.remember);
    modelSettings.value = {
      provider: request.provider,
      baseUrl: request.baseUrl,
      model: request.model,
      remember: request.remember,
    };
    useModel({
      provider: request.provider,
      baseUrl: request.baseUrl,
      model: request.model,
      apiKey: getKey(),
    });
    showToast(`Luciana is thinking with ${request.model}.`);
  };

  onForgetKey.value = () => {
    forgetKey();
    model = null;
    brainMode.value = 'scripted';
    brainStatus.value = null;
    showToast('Back to her own words.');
  };

  // --- what this visit starts from ---

  function applySave(save: SaveFile): void {
    for (const saved of save.kits) {
      const kit = view.kits.find((k) => k.id === saved.id);
      if (!kit) continue;
      kit.teleport(saved.at);
      kit.inventory.clear();
      for (const [id, count] of saved.inventory) if (count > 0) kit.inventory.set(id, count);
    }
    restoreChat(save.chat);
    for (const line of save.chat.slice(-HISTORY_LENGTH)) remember(line.who, line.text);
    preferences.value = { ...save.settings.preferences };
    const saved = save.settings.model;
    modelSettings.value = {
      provider: saved.provider,
      baseUrl: saved.baseUrl,
      model: saved.model,
      remember: saved.remember,
    };
  }

  if (session.voxels) view.loadWorld(session.voxels);
  if (session.edits) view.loadWorld(applyEdits(view.baseWorld(), session.edits));
  if (session.save) applySave(session.save);
  for (const kit of view.kits) refreshStatus(kit);

  // A key kept for this tab survives a reload; a local model needs none and
  // comes back by itself when it was in use.
  const restored = restoreKey();
  const savedModel = session.save?.settings.model;
  if (restored || (savedModel?.active && savedModel.provider === 'openai')) {
    const current = modelSettings.value;
    useModel({
      provider: current.provider,
      baseUrl: current.baseUrl,
      model: current.model,
      apiKey: restored,
    });
  }

  // --- saving ---

  let sharedUntilEdit = session.sharedUntilEdit;
  let revisionAtLoad = view.world.revision;
  let lastPrint = '';
  let sinceSaveCheck = 0;
  let quotaWarned = false;
  let sizeWarned = false;

  function snapshot(): SaveFile {
    const current = modelSettings.value;
    return {
      version: 1,
      seed: view.world.seed,
      voxels: encodeVoxels(view.world.toBytes()),
      kits: view.kits.map((kit) => ({
        id: kit.id,
        name: kit.name,
        at: kit.cell,
        inventory: [...kit.inventory.entries()].filter(([, count]) => count > 0),
      })),
      chat: chat.value.map(({ who, text }) => ({ who, text })),
      settings: {
        preferences: { ...preferences.value },
        model: {
          provider: current.provider,
          baseUrl: current.baseUrl,
          model: current.model,
          remember: current.remember,
          active: model !== null,
        },
      },
    };
  }

  /** Cheap to compute and changes whenever anything worth saving does. */
  function fingerprint(): string {
    const kit = view.kits[0];
    const pocket = kit ? [...kit.inventory.entries()].flat().join(',') : '';
    const cell = kit ? `${String(kit.cell.x)},${String(kit.cell.y)},${String(kit.cell.z)}` : '';
    const last = chat.value[chat.value.length - 1];
    return [
      view.world.revision,
      chat.value.length,
      last?.id ?? 0,
      cell,
      pocket,
      JSON.stringify(preferences.value),
      JSON.stringify(modelSettings.value),
      model !== null,
    ].join('|');
  }

  function writeSave(): void {
    if (session.protectSave || sharedUntilEdit) return;
    const text = serialize(snapshot());
    if (measure(text).warn && !sizeWarned) {
      sizeWarned = true;
      showToast('The save is past four megabytes. It still works, but that is a lot.');
    }
    const result = session.store.set(text);
    if (result !== 'ok' && !quotaWarned) {
      quotaWarned = true;
      showToast(
        result === 'quota'
          ? 'Storage is full, so progress is not being saved.'
          : 'The save could not be written, so progress is not being saved.',
      );
    }
  }

  /** Save if anything changed since the last look. */
  function saveIfChanged(): void {
    const print = fingerprint();
    if (print === lastPrint) return;
    lastPrint = print;
    writeSave();
  }

  const onPageHide = (): void => {
    saveIfChanged();
  };
  const onVisibility = (): void => {
    if (document.hidden) saveIfChanged();
  };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);

  let noteIndex = 0;
  for (const note of session.notes) {
    setTimeout(() => showToast(note, 4000), noteIndex++ * 4200);
  }

  onResetWorld.value = () => {
    session.store.remove();
    const seed = (Math.random() * 0xffffffff) >>> 0;
    for (const queue of queues.values()) queue.clear();
    view.resetWorld(seed);
    clearChat();
    history.length = 0;
    sharedUntilEdit = false;
    revisionAtLoad = view.world.revision;
    lastPrint = '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    for (const kit of view.kits) refreshStatus(kit);
    showToast('A new meadow. Your settings are as they were.');
  };

  onShareLink.value = () => {
    const link = encodeShare(view.world.seed, view.baseWorld(), view.world.toBytes());
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search + link.hash,
    );
    const url = window.location.href;
    const tail = link.complete
      ? ''
      : ' It carries the seed only: there were too many edits to fit in a link.';
    const say = (copied: boolean): void => {
      showToast((copied ? 'Link copied.' : 'The link is in the address bar.') + tail, 5000);
    };
    navigator.clipboard
      .writeText(url)
      .then(() => {
        say(true);
      })
      .catch(() => {
        say(false);
      });
  };

  function run(
    output: { say: string; actions: readonly import('../brain/schema').Action[] },
    kit: Kit,
  ): void {
    addLine('kit', output.say);
    remember('kit', output.say);

    if (output.actions.length > 0) {
      const queue = queues.get(kit.id);
      // A new order replaces the old one rather than queueing behind it.
      queue?.clear();
      queue?.push(output.actions);
      announce(`${kit.name} is starting: ${output.actions[0]?.type ?? 'something'}`);
    }
  }

  function send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const kit = view.kits[0];
    if (!kit) return;

    addLine('player', trimmed);
    remember('player', trimmed);
    ambient.noteSpeech(loop.ticks * TICK_MS);
    thinking.value = true;

    const payload = {
      text: trimmed,
      source: 'user' as const,
      folk: kit,
      world: {
        reticle: view.orbit.targetCell(),
        focus: view.pointedAt(),
        dayPhase: loop.dayPhase,
        kitNames: view.kits.map((k) => k.name),
      },
      history: [...history],
      situation: situationOf(kit),
    };

    if (model) {
      // The model answers when it can. Everything degrades to her own words.
      void model
        .respond({ ...payload, situation: promptSituation(kit) })
        .then((output) => {
          thinking.value = false;
          const checked = validate(output);
          if (!checked.ok) {
            showToast('Luciana said something I could not make sense of.');
            return;
          }
          run(checked.value, kit);
        })
        .catch(() => {
          thinking.value = false;
          run(scripted.reply(payload), kit);
        });
      return;
    }

    // Everything a brain says goes through the schema, including this one.
    const checked = validate(scripted.reply(payload));
    thinking.value = false;
    if (!checked.ok) {
      showToast('Luciana said something I could not make sense of.');
      return;
    }
    run(checked.value, kit);
  }

  onCommand.value = send;
  for (const kit of view.kits) refreshStatus(kit);

  /** An order that came from a click rather than from typing. */
  function order(kit: Kit, kind: string, actions: Action[], seed: string): void {
    const checked = validate({ say: acknowledge(kind, seed), actions });
    if (!checked.ok) return;
    const asked: Record<string, string> = {
      goto: 'go here',
      mine: 'mine this',
      place: 'place a tile here',
    };
    const said = asked[kind] ?? kind;
    addLine('player', said);
    remember('player', said);
    run(checked.value, kit);
  }

  /** The player's own edit. Refused, with a word, when Luciana is in the cell. */
  function playerEdit(x: number, y: number, z: number, id: number): void {
    const occupied = view.kits.some((kit) => {
      const cell = kit.cell;
      return cell.x === x && cell.z === z && (cell.y === y || cell.y + 1 === y);
    });
    if (occupied && id !== AIR) {
      showToast('Luciana is standing there.');
      return;
    }
    if (!view.editBlock(x, y, z, id)) showToast('Nothing changed there.');
  }

  const tileId = (): number => blockByName('tile')?.id ?? 7;

  onBlockMenuChoice.value = (choice, pick) => {
    const kit = view.kits[0];
    if (!kit) return;
    const { cell, normal } = pick;
    const facing = { x: cell.x + normal.x, y: cell.y + normal.y, z: cell.z + normal.z };
    const seed = `${String(cell.x)},${String(cell.y)},${String(cell.z)}`;
    switch (choice) {
      case 'go':
        order(kit, 'goto', [{ type: 'goto', at: { x: cell.x, y: cell.y + 1, z: cell.z } }], seed);
        break;
      case 'mine':
        order(kit, 'mine', [{ type: 'mine', at: { ...cell } }], seed);
        break;
      case 'place':
        order(kit, 'place', [{ type: 'place', block: tileId(), at: facing }], seed);
        break;
      case 'break-you':
        playerEdit(cell.x, cell.y, cell.z, AIR);
        break;
      case 'place-you':
        playerEdit(facing.x, facing.y, facing.z, tileId());
        break;
    }
  };

  onPlayerAction.value = (action) => {
    const kit = view.kits[0];
    const reticle = view.orbit.targetCell();
    const ground = view.world.surfaceHeight(reticle.x, reticle.z);
    switch (action) {
      case 'break-here':
        if (ground >= 0) playerEdit(reticle.x, ground, reticle.z, AIR);
        break;
      case 'place-here':
        playerEdit(reticle.x, ground + 1, reticle.z, tileId());
        break;
      case 'focus-kit':
        if (kit) view.orbit.setTarget(kit.position.x, kit.position.y, kit.position.z);
        break;
      case 'open-settings':
        settingsOpen.value = true;
        break;
      case 'cycle-theme':
        showToast(`Theme: ${cycleTheme()}.`);
        break;
    }
  };

  // Keys that work anywhere outside a text box.
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable]')) {
      return;
    }
    if (paletteOpen.value || blockMenu.value) return;
    if (event.key === 'f' || event.key === 'F') {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      onPlayerAction.value('focus-kit');
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // The theme is a document attribute the tokens file already understands.
  const stopTheme = effect(() => {
    const { theme } = preferences.value;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });

  const stopMotion = effect(() => {
    view.setReducedMotion(preferences.value.motion === 'reduced');
  });

  // Phones get the near distance unless the player says otherwise.
  const smallScreen = (): boolean =>
    window.innerWidth < 720 || window.matchMedia('(pointer: coarse)').matches;
  const applyDistance = (): void => {
    const choice = preferences.value.renderDistance;
    const near = choice === 'near' || (choice === 'auto' && smallScreen());
    view.setRenderDistance(near ? NEAR_DISTANCE : null);
  };
  const stopDistance = effect(applyDistance);
  window.addEventListener('resize', applyDistance);

  const frameTimes: number[] = [];
  let sinceReadout = 0;
  let nodesSeen = 0;

  // Idle remarks: scripted unless the player lets the model do them.
  const ambient = new AmbientChatter();
  function muse(kit: Kit): void {
    const now = loop.ticks * TICK_MS;
    ambient.noteSpeech(now);
    if (preferences.value.ambientModel && model) {
      void model
        .respond({
          text: 'You have been standing about for a while. Say one short thing to yourself about what is around you, and do nothing.',
          source: 'folk',
          folk: kit,
          world: {
            reticle: view.orbit.targetCell(),
            focus: view.pointedAt(),
            dayPhase: loop.dayPhase,
            kitNames: view.kits.map((k) => k.name),
          },
          history: [...history],
          situation: promptSituation(kit),
        })
        .then((output) => {
          const checked = validate(output);
          if (checked.ok) run({ say: checked.value.say, actions: [] }, kit);
        })
        .catch(() => undefined);
      return;
    }
    const line = scripted.idle(situationOf(kit), String(loop.ticks));
    addLine('kit', line);
    remember('kit', line);
  }

  // The welcome: first visit only, skippable, and back on request.
  onOnboardingDone.value = markWelcomeSeen;
  onReplayOnboarding.value = () => {
    settingsOpen.value = false;
    onboarding.value = 1;
  };
  if (isFirstRun()) onboarding.value = 1;

  let sinceStatus = 0;

  return {
    tick(): void {
      for (const kit of view.kits) queues.get(kit.id)?.tick();
      // The panel does not need refreshing twenty times a second.
      if (++sinceStatus >= 5) {
        sinceStatus = 0;
        const kit = view.kits[0];
        if (kit) refreshStatus(kit);
      }
      const first = view.kits[0];
      const idle = first ? (queues.get(first.id)?.idle ?? true) && first.state === 'idle' : false;
      if (first && ambient.tick(idle, loop.ticks * TICK_MS)) muse(first);
      // A guest world becomes the player's own the moment they change it, and
      // the link comes off the address bar so a reload opens the save.
      if (sharedUntilEdit && view.world.revision !== revisionAtLoad) {
        sharedUntilEdit = false;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        showToast('Your save now holds this world.');
      }
      if (++sinceSaveCheck >= SAVE_EVERY_TICKS) {
        sinceSaveCheck = 0;
        saveIfChanged();
      }
    },
    frame(frameMs: number): void {
      frameTimes.push(frameMs);
      if (frameTimes.length > PERF_WINDOW) frameTimes.shift();
      if (++sinceReadout < PERF_EVERY) return;
      sinceReadout = 0;
      // Nobody is looking unless the panel is open, so do nothing until then.
      if (!settingsOpen.value) return;

      const sorted = [...frameTimes].sort((a, b) => a - b);
      const at = (q: number): number =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
      const nodes = view.kits.reduce((sum, kit) => sum + kit.pathNodes, 0);
      const perFrame = (nodes - nodesSeen) / PERF_EVERY;
      nodesSeen = nodes;
      perfView.value = {
        frameP50: at(0.5),
        frameP95: at(0.95),
        frameMax: sorted[sorted.length - 1] ?? 0,
        drawCalls: view.perf.drawCalls,
        visibleChunks: view.perf.visibleChunks,
        pathNodesPerFrame: perFrame,
      };
    },
    send,
    dispose(): void {
      onCommand.value = () => undefined;
      onBlockMenuChoice.value = () => undefined;
      onPlayerAction.value = () => undefined;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', applyDistance);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      onResetWorld.value = () => undefined;
      onShareLink.value = () => undefined;
      stopTheme();
      stopMotion();
      stopDistance();
      queues.clear();
    },
  };
}
