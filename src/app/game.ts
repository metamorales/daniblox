/**
 * Where the pieces meet: a command becomes actions, actions become work, and
 * work becomes something Luciana says.
 *
 * This layer exists because src/world, src/render, src/folk and src/brain are
 * forbidden from importing src/ui. They raise events and expose state; this
 * puts it on the screen.
 */

import { LlmBrain, type LlmSettings } from '../brain/llm';
import { ScriptedBrain } from '../brain/scripted';
import type { ChatTurn } from '../brain/brain';
import { validate } from '../brain/schema';
import { ActionQueue, type ActionWorld } from '../folk/actions';
import type { Kit } from '../folk/kit';
import { blockById } from '../world/blocks';
import type { Situation } from '../chat/dialogue';
import type { WorldView } from '../render/scene';
import {
  addLine,
  announce,
  brainMode,
  brainStatus,
  kitStatus,
  modelSettings,
  onApplyModel,
  onCommand,
  onForgetKey,
  showToast,
  thinking,
} from '../ui/state';
import { forgetKey, getKey, restoreKey, setKey } from './keyStore';
import { blockById as lookupBlock } from '../world/blocks';
import type { PromptSituation } from '../brain/prompt';
import type { FixedLoop } from './loop';

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
    case 'time-changed':
      return `There you go: ${String(detail?.phase ?? 'a new hour')}.`;
    case 'nothing-happened':
      return 'That did not change anything.';
    default:
      return null;
  }
}

export interface Game {
  tick(): void;
  /** Send a line of text to Luciana, as if typed. */
  send(text: string): void;
  dispose(): void;
}

export function createGame(view: WorldView, loop: FixedLoop): Game {
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
    seed: view.world.seed,
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

  // A key the player chose to keep for this tab survives a reload.
  const restored = restoreKey();
  if (restored) {
    const saved = modelSettings.value;
    useModel({
      provider: saved.provider,
      baseUrl: saved.baseUrl,
      model: saved.model,
      apiKey: restored,
    });
  }

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
    },
    send,
    dispose(): void {
      onCommand.value = () => undefined;
      queues.clear();
    },
  };
}
