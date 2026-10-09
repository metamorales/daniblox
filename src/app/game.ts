/**
 * Where the pieces meet: a command becomes actions, actions become work, and
 * work becomes something Luciana says.
 *
 * This layer exists because src/world, src/render, src/folk and src/brain are
 * forbidden from importing src/ui. They raise events and expose state; this
 * puts it on the screen.
 */

import { ScriptedBrain } from '../brain/scripted';
import type { Brain, ChatTurn } from '../brain/brain';
import { validate } from '../brain/schema';
import { ActionQueue, type ActionWorld } from '../folk/actions';
import type { Kit } from '../folk/kit';
import { blockById } from '../world/blocks';
import type { Situation } from '../chat/dialogue';
import type { WorldView } from '../render/scene';
import { addLine, announce, kitStatus, onCommand, showToast, thinking } from '../ui/state';
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
  const brain: Brain & { reply?: unknown } = new ScriptedBrain();
  const scripted = brain as ScriptedBrain;
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

  function send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const kit = view.kits[0];
    if (!kit) return;

    addLine('player', trimmed);
    remember('player', trimmed);
    thinking.value = true;

    const output = scripted.reply({
      text: trimmed,
      source: 'user',
      folk: kit,
      world: {
        reticle: view.orbit.targetCell(),
        focus: view.pointedAt(),
        dayPhase: loop.dayPhase,
        kitNames: view.kits.map((k) => k.name),
      },
      history,
      situation: situationOf(kit),
    });

    // Everything a brain says goes through the schema, including this one.
    const checked = validate(output);
    thinking.value = false;
    if (!checked.ok) {
      showToast('Luciana said something I could not make sense of.');
      return;
    }

    addLine('kit', checked.value.say);
    remember('kit', checked.value.say);

    if (checked.value.actions.length > 0) {
      const queue = queues.get(kit.id);
      // A new order replaces the old one rather than queueing behind it.
      queue?.clear();
      queue?.push(checked.value.actions);
      announce(`${kit.name} is starting: ${checked.value.actions[0]?.type ?? 'something'}`);
    }
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
