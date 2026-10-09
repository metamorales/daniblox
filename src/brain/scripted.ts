/**
 * The scripted brain: the one that always works.
 *
 * No network, no key, no setup. It reads the command grammar, turns it into
 * actions, and answers in Luciana's voice. The model-backed brain in M5 is an
 * upgrade on this, never a replacement, and this is what every fallback lands
 * on.
 *
 * The player's text is data. It is matched against patterns and never
 * evaluated, and the output still goes through the schema like any other.
 */

import { blockById } from '../world/blocks';
import type { Brain, BrainRequest } from './brain';
import { parseCommand } from './parser';
import { MAX_SAY, type Action, type BrainOutput, validate } from './schema';

/**
 * Luciana: curious, a bit mischievous. Full personality card lands in M4; this
 * is enough voice to stop the game sounding like a form.
 */
const ACKNOWLEDGE: Record<string, string[]> = {
  goto: ['On my way.', 'Going there now.', 'Right, over I go.'],
  mine: ['I will fetch that.', 'Digging in.', 'Give me a moment with it.'],
  place: ['Putting it down.', 'There we go.', 'Setting it in place.'],
  follow: ['Right behind you.', 'Lead on.', 'I am following.'],
  wander: ['I will go and have a look around.', 'Off exploring, then.'],
  stop: ['Stopping.', 'Standing still.'],
  sculpt: ['Watch this.', 'Reshaping it now.', 'Hold on to something.'],
  paint: ['Changing the colour.', 'A fresh coat coming up.'],
  plant: ['Planting now.', 'Let us grow something.'],
  scatter: ['Scattering them about.', 'Sprinkling a few around.'],
  clear: ['Clearing it out.', 'Tidying up.'],
  settime: ['Changing the light.', 'Shifting the hour.'],
};

const PUZZLED = [
  'I did not quite follow that.',
  'Say that another way and I will try.',
  'That one went over my head.',
];

const GREETINGS = [
  'Hello. What are we doing?',
  'Hello yourself. Need something moved?',
  'There you are. Say the word.',
];

const CHATTER = [
  'I am just poking about.',
  'This place is nice, is it not?',
  'Ask me to do something and I will.',
  'I was wondering what is under all this.',
];

const GREETING_WORDS = /\b(hi|hey|hello|yo|good (morning|evening|afternoon))\b/i;

/** Pick deterministically, so the same input twice gives the same reply. */
function pick<T>(options: readonly T[], seed: string): T | undefined {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return options[hash % options.length];
}

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

  respond(request: BrainRequest): Promise<BrainOutput> {
    return Promise.resolve(this.reply(request));
  }

  /** Synchronous, because nothing here waits on anything. */
  reply(request: BrainRequest): BrainOutput {
    const { text, world } = request;
    const parsed = parseCommand(text, {
      reticle: world.reticle,
      focus: world.focus ?? null,
      kitNames: world.kitNames,
    });

    if (parsed.ok && parsed.actions.length > 0) {
      const first = parsed.actions[0];
      const lines = (first ? ACKNOWLEDGE[first.type] : undefined) ?? ['Right.'];
      let say = pick(lines, text) ?? 'Right.';
      if (parsed.actions.length > 1) say += ` Then ${describe(parsed.actions[1] ?? first!)}.`;
      return this.checked({ say: clip(say), actions: parsed.actions });
    }

    // Not a command, so it is conversation.
    if (GREETING_WORDS.test(text)) {
      return this.checked({ say: pick(GREETINGS, text) ?? GREETINGS[0]!, actions: [] });
    }

    const suggestions = parsed.ok ? [] : parsed.suggestions;
    const puzzled = pick(PUZZLED, text) ?? PUZZLED[0]!;
    const say =
      suggestions.length >= 2
        ? `${puzzled} Try "${suggestions[0] ?? ''}" or "${suggestions[1] ?? ''}".`
        : puzzled;
    return this.checked({ say: clip(say), actions: [] });
  }

  /** Ambient line when nobody has said anything for a while. */
  idleRemark(seed: string): string {
    return pick(CHATTER, seed) ?? CHATTER[0]!;
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
