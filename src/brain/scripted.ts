/**
 * The scripted brain: the one that always works.
 *
 * No network, no key, no setup. It reads the command grammar, turns it into
 * actions, and answers in Luciana's voice. The model brain in M5 is an upgrade
 * on this, never a replacement, and every fallback lands here.
 *
 * The player's text is data. It is matched against patterns and never
 * evaluated, and the output still goes through the schema like any other.
 */

import {
  CARD,
  acknowledge,
  answerAbout,
  idleRemark,
  puzzled,
  type Situation,
} from '../chat/dialogue';
import { blockById } from '../world/blocks';
import type { Brain, BrainRequest } from './brain';
import { parseCommand } from './parser';
import { MAX_SAY, type Action, type BrainOutput, validate } from './schema';

function describe(action: Action): string {
  switch (action.type) {
    case 'mine':
      return 'at' in action
        ? 'that block'
        : `${String(action.count)} ${blockById(action.block)?.label ?? 'block'}`;
    case 'place':
      return blockById(action.block)?.label ?? 'a block';
    case 'settime':
      return action.phase;
    default:
      return action.type;
  }
}

function clip(text: string): string {
  return text.length <= MAX_SAY ? text : `${text.slice(0, MAX_SAY - 1)}…`;
}

export class ScriptedBrain implements Brain {
  readonly name = 'scripted';
  readonly card = CARD;

  respond(request: BrainRequest): Promise<BrainOutput> {
    return Promise.resolve(this.reply(request));
  }

  /** Synchronous, because nothing here waits on anything. */
  reply(request: BrainRequest & { situation?: Situation }): BrainOutput {
    const { text, world } = request;
    const situation: Situation = request.situation ?? {
      activity: request.folk.activity,
      cell: request.folk.cell,
      standingOn: null,
      carrying: [],
      dayPhase: world.dayPhase,
    };

    const parsed = parseCommand(text, {
      reticle: world.reticle,
      focus: world.focus ?? null,
      kitNames: world.kitNames,
    });

    if (parsed.ok && parsed.actions.length > 0) {
      const first = parsed.actions[0];
      let say = acknowledge(first?.type ?? 'goto', text);
      const second = parsed.actions[1];
      if (second) say += ` Then ${describe(second)}.`;
      return this.checked({ say: clip(say), actions: parsed.actions });
    }

    // Not a command, so it is conversation. She can speak about her own
    // situation, which is most of what anyone asks a companion standing
    // beside them.
    const about = answerAbout(text, situation);
    if (about) return this.checked({ say: clip(about), actions: [] });

    const suggestions = parsed.ok ? [] : parsed.suggestions;
    return this.checked({ say: clip(puzzled(suggestions, text)), actions: [] });
  }

  /** A remark when nothing has happened for a while. */
  idle(situation: Situation, seed: string): string {
    return idleRemark(situation, seed);
  }

  /**
   * Every brain's output goes through the schema, including this one. If the
   * scripted brain ever produced something invalid that would be a bug here,
   * not a reason to let it through.
   */
  private checked(output: BrainOutput): BrainOutput {
    const result = validate(output);
    if (result.ok) return result.value;
    return { say: 'Something went sideways in my head. Try again?', actions: [] };
  }
}
