/**
 * Luciana's voice.
 *
 * Templates seeded by her card, grounded in what she is doing, where she is,
 * what she is carrying and the time of day. This is what she sounds like with
 * no key and no network, so it has to carry the character on its own.
 *
 * It cannot hold an open conversation, and does not pretend to. What it can do
 * is answer questions about her own situation, which is most of what anyone
 * asks a companion standing next to them, and say so plainly otherwise.
 */

import card from './luciana.json';

export interface Situation {
  readonly activity: string | null;
  readonly cell: { x: number; y: number; z: number };
  readonly standingOn: string | null;
  readonly carrying: readonly { readonly label: string; readonly count: number }[];
  /** 0 at dawn, through to 1. */
  readonly dayPhase: number;
}

export const CARD = card;

/** Deterministic pick, so the same question twice gives the same answer. */
function pick<T>(options: readonly T[], seed: string): T {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return options[hash % options.length] as T;
}

/** Start a line with a capital, since several templates open with a fragment. */
function sentenceCase(text: string): string {
  return text.replace(/^./, (c) => c.toUpperCase());
}

export function timeOfDay(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.12) return 'dawn';
  if (p < 0.45) return 'the middle of the day';
  if (p < 0.6) return 'dusk';
  return 'the middle of the night';
}

function carryingPhrase(situation: Situation): string {
  const items = situation.carrying.filter((item) => item.count > 0);
  if (items.length === 0) return 'nothing at all';
  return items
    .map((item) => `${String(item.count)} ${item.label}`)
    .join(items.length === 2 ? ' and ' : ', ');
}

function doingPhrase(situation: Situation): string {
  switch (situation.activity) {
    case 'walking':
      return 'walking somewhere';
    case 'mining':
      return 'digging something out';
    case 'building':
      return 'putting a block down';
    case 'following':
      return 'following you';
    case 'wandering':
      return 'wandering about';
    case 'reshaping':
      return 'rearranging the landscape';
    default:
      return 'standing here, mostly';
  }
}

// --- questions she can actually answer about herself ---

interface Question {
  readonly test: RegExp;
  reply(situation: Situation, seed: string): string;
}

const QUESTIONS: readonly Question[] = [
  {
    test: /\bwhat are you doing\b|\bwhat.*up to\b|\bbusy\b/i,
    reply: (s, seed) =>
      pick(
        [
          `Right now, ${doingPhrase(s)}.`,
          `${sentenceCase(doingPhrase(s))}. Why, did you need something?`,
        ],
        seed,
      ),
  },
  {
    test: /\bwhere are you\b|\bwhere.*standing\b|\bwhere am i\b/i,
    reply: (s, seed) => {
      const where = `${String(s.cell.x)}, ${String(s.cell.z)}`;
      const on = s.standingOn ? ` on ${s.standingOn}` : '';
      return pick([`Over at ${where}${on}.`, `${where}${on}. Come and see.`], seed);
    },
  },
  {
    test: /\bwhat.*(carrying|have you got|holding|pockets|inventory)\b|\bgot anything\b/i,
    reply: (s, seed) =>
      pick(
        [`I have ${carryingPhrase(s)}.`, `${sentenceCase(carryingPhrase(s))}, since you ask.`],
        seed,
      ),
  },
  {
    test: /\bwhat time\b|\bhow late\b|\bis it (night|day|dark|morning)\b/i,
    reply: (s, seed) =>
      pick(
        [`It is ${timeOfDay(s.dayPhase)}.`, `${sentenceCase(timeOfDay(s.dayPhase))}, near enough.`],
        seed,
      ),
  },
  {
    test: /\bhow are you\b|\byou (alright|ok|okay)\b|\bhow.*feeling\b/i,
    reply: (s, seed) =>
      pick(
        [`${sentenceCase(CARD.mood)}, as usual.`, `Fine. ${sentenceCase(doingPhrase(s))}.`],
        seed,
      ),
  },
  {
    test: /\bwhat can you do\b|\bhelp\b|\bcommands\b|\bhow.*work\b/i,
    reply: (_s, seed) =>
      pick(
        [
          'I can fetch things, build things, and move the ground about. Try telling me to raise a hill.',
          'Ask me to gather something, or to plant a forest, or to make it night.',
        ],
        seed,
      ),
  },
  {
    test: /\b(thanks|thank you|nice|well done|good (job|work|girl|cat))\b/i,
    reply: (_s, seed) =>
      pick(['It was nothing.', 'I know.', 'It did come out well, did it not?'], seed),
  },
  {
    // Deliberately last of the "what are you" family: "what are you doing"
    // and "what are you carrying" are asked far more often than "who are you",
    // and a loose pattern here swallows both.
    test: /\bwho are you\b|\bwhat are you\??$|\byour name\b|\bwhat kind of\b/i,
    reply: (_s, seed) =>
      pick(
        [
          `I am ${CARD.name}. ${CARD.bio[0] ?? ''}`,
          `${CARD.name}. ${CARD.bio[1] ?? ''}`,
          `${CARD.name}, and I am ${CARD.species}.`,
        ],
        seed,
      ),
  },
  {
    test: /\b(hi|hey|hello|yo|good (morning|evening|afternoon))\b/i,
    reply: (s, seed) =>
      pick(
        [
          'Hello. What are we doing?',
          `Hello yourself. It is ${timeOfDay(s.dayPhase)}, in case you had lost track.`,
          'There you are. Say the word.',
        ],
        seed,
      ),
  },
];

/** An answer when she is asked about herself, or null when she was not. */
export function answerAbout(text: string, situation: Situation): string | null {
  for (const question of QUESTIONS) {
    if (question.test.test(text)) return question.reply(situation, text);
  }
  return null;
}

/** What she says when she takes an order. Two sentences at most. */
export function acknowledge(kind: string, seed: string): string {
  const lines: Record<string, string[]> = {
    goto: ['On my way.', 'Going there now.', 'Right, over I go.'],
    mine: ['I will fetch that.', `${CARD.catchphrases[1] ?? 'Let me look.'}`, 'Digging in.'],
    place: ['Putting it down.', 'There we go.', 'Setting it in place.'],
    follow: ['Right behind you.', 'Lead on.', 'I am following.'],
    wander: ['I will go and have a look around.', 'Off exploring, then.'],
    stop: ['Stopping.', 'Standing still.'],
    sculpt: [CARD.catchphrases[0] ?? 'Watch this.', 'Reshaping it now.', 'Stand back a little.'],
    paint: ['Changing the colour.', 'A fresh coat coming up.'],
    plant: ['Planting now.', 'Let us grow something.'],
    scatter: ['Scattering them about.', 'Sprinkling a few around.'],
    clear: ['Clearing it out.', 'Tidying up.'],
    settime: ['Changing the light.', 'Shifting the hour.'],
  };
  return pick(lines[kind] ?? ['Right.'], seed);
}

/** A remark when nothing has happened for a while. */
export function idleRemark(situation: Situation, seed: string): string {
  return pick(
    [
      'I am just poking about.',
      `It is ${timeOfDay(situation.dayPhase)} and I have ${carryingPhrase(situation)}.`,
      'Ask me to do something and I will.',
      'I was wondering what is under all this.',
      'There is a hole over there I have been trying not to think about.',
    ],
    seed,
  );
}

/** What she says when she cannot read a command at all. */
export function puzzled(suggestions: readonly string[], seed: string): string {
  const opener = pick(
    [
      'I did not quite follow that.',
      'Say that another way and I will try.',
      'That one went over my head.',
    ],
    seed,
  );
  if (suggestions.length < 2) return opener;
  return `${opener} Try "${suggestions[0] ?? ''}" or "${suggestions[1] ?? ''}".`;
}
