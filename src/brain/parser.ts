/**
 * The deterministic command grammar (spec R1), plus the world-scale verbs.
 *
 * This is what makes the game work with no key and no network. Everything
 * Luciana can do is reachable by typing, in wording a person would actually
 * use, and the result is the same closed action vocabulary a model would have
 * to produce.
 *
 * Input from the player is data. It is matched against patterns here and never
 * evaluated, and whatever comes out still goes through the schema.
 */

import { BLOCKS, blockByName } from '../world/blocks';
import { WORLD_X, WORLD_Y, WORLD_Z } from '../world/chunks';
import type { Action } from './schema';

export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ParseContext {
  /** The cell the camera orbits. "Here", "there" and "me" all mean this. */
  readonly reticle: Cell;
  /** The block the player last pointed at, for "this". */
  readonly focus?: Cell | null;
  /** Names in the roster, for addressing one by name. */
  readonly kitNames?: readonly string[];
}

export type ParseResult =
  | { readonly ok: true; readonly actions: Action[]; readonly addressed: string | null }
  | {
      readonly ok: false;
      /** The phrase that could not be read, as the player wrote it. */
      readonly phrase: string;
      /** Its position in a chained command, counting from one. */
      readonly index: number;
      /** The two closest commands we do understand. */
      readonly suggestions: string[];
      readonly reason: 'unknown' | 'too-many-phrases';
    };

export const MAX_PHRASES = 3;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  couple: 2,
  few: 3,
};

/** Words that carry no meaning here and are dropped before matching. */
const FILLER = new Set([
  'a',
  'an',
  'please',
  'could',
  'can',
  'you',
  'would',
  'the',
  'some',
  'of',
  'for',
  'me',
  'now',
  'just',
  'go',
  'and',
  'up',
  'bit',
  'little',
  'maybe',
  'try',
  'to',
]);

/** Filler that must survive because a verb depends on it. */
const KEEP_WITH_VERB = new Set(['go', 'to', 'up']);

/** Every verb the grammar recognises, so a name cannot shadow one. */
const COMMAND_WORDS = new Set([
  'go',
  'walk',
  'head',
  'move',
  'return',
  'come',
  'follow',
  'wander',
  'explore',
  'roam',
  'stop',
  'halt',
  'wait',
  'stay',
  'freeze',
  'mine',
  'dig',
  'break',
  'gather',
  'collect',
  'grab',
  'get',
  'fetch',
  'bring',
  'chop',
  'place',
  'put',
  'build',
  'drop',
  'set',
  'raise',
  'rise',
  'lift',
  'lower',
  'sink',
  'carve',
  'flatten',
  'level',
  'smooth',
  'paint',
  'colour',
  'color',
  'cover',
  'turn',
  'plant',
  'grow',
  'scatter',
  'sprinkle',
  'dot',
  'strew',
  'clear',
  'wipe',
  'erase',
  'empty',
  'tidy',
  'make',
]);

const CANONICAL = [
  'go here',
  'go to 10 12 30',
  'come back',
  'mine this',
  'mine stone 3',
  'gather five bark',
  'place tile here',
  'follow me',
  'wander',
  'stop',
  'raise a hill here',
  'lower the ground here',
  'flatten this',
  'paint this shell',
  'plant a forest here',
  'scatter gems here',
  'clear this area',
  'make it night',
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(phrase: string): string[] {
  return phrase.split(' ').filter(Boolean);
}

/** Strip filler, but keep the few words a verb needs to stay readable. */
function declutter(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    if (!FILLER.has(token)) {
      out.push(token);
      continue;
    }
    // "go to", "go here", "up" after raise: keep when the neighbour needs it.
    const previous = out[out.length - 1];
    const next = tokens[i + 1];
    if (KEEP_WITH_VERB.has(token) && (previous === undefined || next !== undefined)) {
      out.push(token);
    }
  }
  return out;
}

function numberAt(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number.parseInt(token, 10);
  return NUMBER_WORDS[token] ?? null;
}

function clampCount(value: number): number {
  return Math.max(1, Math.min(16, Math.round(value)));
}

function inBounds(cell: Cell): boolean {
  return (
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.z >= 0 &&
    cell.x < WORLD_X &&
    cell.y < WORLD_Y &&
    cell.z < WORLD_Z
  );
}

/**
 * Find a block name anywhere in the tokens, singular or plural. People type
 * "scatter gems", not "scatter gem".
 */
function findBlock(tokens: string[]): { id: number; at: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    const found =
      blockByName(token) ?? (token.endsWith('s') ? blockByName(token.slice(0, -1)) : undefined);
    if (found) return { id: found.id, at: i };
  }
  return null;
}

/** Three whole numbers in a row, read as coordinates. */
function findCoordinates(tokens: string[]): Cell | null {
  for (let i = 0; i + 2 < tokens.length; i++) {
    const x = numberAt(tokens[i]);
    const y = numberAt(tokens[i + 1]);
    const z = numberAt(tokens[i + 2]);
    if (x === null || y === null || z === null) continue;
    const cell = { x, y, z };
    return inBounds(cell) ? cell : null;
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const current = [i];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[cols - 1] ?? Math.max(a.length, b.length);
}

/** The two commands closest to what was typed, for an unreadable phrase. */
export function closestCommands(phrase: string, howMany = 2): string[] {
  const needle = normalise(phrase);
  return [...CANONICAL]
    .map((candidate) => ({
      candidate,
      score: levenshtein(needle, candidate) / Math.max(needle.length, candidate.length),
    }))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, howMany)
    .map((entry) => entry.candidate);
}

const SCULPT_VERBS: Record<string, 'raise' | 'lower' | 'flatten'> = {
  raise: 'raise',
  rise: 'raise',
  lift: 'raise',
  hill: 'raise',
  mountain: 'raise',
  lower: 'lower',
  sink: 'lower',
  dig: 'lower',
  carve: 'lower',
  valley: 'lower',
  flatten: 'flatten',
  level: 'flatten',
  smooth: 'flatten',
};

const TIME_WORDS: Record<string, 'dawn' | 'day' | 'dusk' | 'night'> = {
  dawn: 'dawn',
  sunrise: 'dawn',
  morning: 'dawn',
  day: 'day',
  daytime: 'day',
  noon: 'day',
  midday: 'day',
  dusk: 'dusk',
  sunset: 'dusk',
  evening: 'dusk',
  night: 'night',
  midnight: 'night',
  dark: 'night',
};

/**
 * Read one phrase. Returns null when nothing in the grammar matches, which is
 * what turns the whole command into chat plus a suggestion.
 */
function parsePhrase(raw: string, context: ParseContext): Action[] | null {
  const tokens = declutter(words(normalise(raw)));
  if (tokens.length === 0) return null;
  const has = (...candidates: string[]): boolean => candidates.some((c) => tokens.includes(c));
  const here = context.reticle;
  const focus = context.focus ?? null;

  // --- stop ---
  if (has('stop', 'halt', 'wait', 'stay', 'freeze')) return [{ type: 'stop' }];

  // --- time of day ---
  if (has('make', 'set', 'turn', 'its') || has(...Object.keys(TIME_WORDS))) {
    for (const token of tokens) {
      const phase = TIME_WORDS[token];
      // "day" alone is too common to be a command on its own.
      if (phase && (tokens.length > 1 || token !== 'day')) {
        return [{ type: 'settime', phase }];
      }
    }
  }

  // --- world-scale: clear ---
  if (has('clear', 'wipe', 'erase', 'empty', 'tidy')) {
    return [{ type: 'clear', at: focus ?? here, radius: radiusFrom(tokens, 8) }];
  }

  // --- world-scale: plant ---
  if (has('plant', 'forest', 'woods', 'trees', 'grow')) {
    return [
      {
        type: 'plant',
        at: focus ?? here,
        radius: radiusFrom(tokens, 10),
        count: Math.min(24, numberIn(tokens) ?? 8),
      },
    ];
  }

  // --- world-scale: scatter ---
  if (has('scatter', 'sprinkle', 'dot', 'strew')) {
    const block = findBlock(tokens);
    if (block) {
      return [
        {
          type: 'scatter',
          block: block.id,
          at: focus ?? here,
          radius: radiusFrom(tokens, 8),
          count: Math.min(32, numberIn(tokens) ?? 10),
        },
      ];
    }
  }

  // --- world-scale: paint ---
  if (has('paint', 'colour', 'color', 'cover', 'turn')) {
    const block = findBlock(tokens);
    if (block) {
      return [{ type: 'paint', block: block.id, at: focus ?? here, radius: radiusFrom(tokens, 6) }];
    }
  }

  // --- world-scale: sculpt ---
  for (const token of tokens) {
    const shape = SCULPT_VERBS[token];
    // "dig" only means sculpt when no block is named; "dig stone" is mining.
    if (!shape) continue;
    if (token === 'dig' && findBlock(tokens)) break;
    return [
      {
        type: 'sculpt',
        shape,
        at: focus ?? here,
        radius: radiusFrom(tokens, 6),
        amount: Math.max(1, Math.min(8, numberIn(tokens) ?? 3)),
      },
    ];
  }

  // --- follow ---
  if (has('follow', 'come')) {
    if (has('follow')) {
      const names = context.kitNames ?? [];
      const named = tokens.find((token) => names.some((n) => n.toLowerCase() === token));
      if (named && !has('me')) return [{ type: 'follow', target: named }];
      return [{ type: 'follow', target: 'user' }];
    }
    // "come", "come back", "come here" all mean the reticle.
    return [{ type: 'goto', at: here }];
  }

  // --- wander ---
  if (has('wander', 'explore', 'roam', 'wonder')) return [{ type: 'wander' }];

  // --- place ---
  if (has('place', 'put', 'build', 'drop', 'set')) {
    const block = findBlock(tokens);
    if (block) {
      const at = findCoordinates(tokens) ?? focus ?? here;
      return [{ type: 'place', block: block.id, at }];
    }
  }

  // --- mine ---
  if (has('mine', 'dig', 'break', 'gather', 'collect', 'grab', 'get', 'fetch', 'bring', 'chop')) {
    if (has('this', 'that', 'it') && focus) return [{ type: 'mine', at: focus }];
    const block = findBlock(tokens);
    if (block) {
      return [{ type: 'mine', block: block.id, count: clampCount(numberIn(tokens) ?? 1) }];
    }
    if (focus) return [{ type: 'mine', at: focus }];
  }

  // --- goto ---
  if (has('go', 'walk', 'head', 'move', 'return')) {
    const coordinates = findCoordinates(tokens);
    if (coordinates) return [{ type: 'goto', at: coordinates }];
    if (has('here', 'there', 'back', 'return')) return [{ type: 'goto', at: here }];
    if (focus) return [{ type: 'goto', at: focus }];
    return [{ type: 'goto', at: here }];
  }

  // Bare coordinates, with no verb at all.
  const bare = findCoordinates(tokens);
  if (bare) return [{ type: 'goto', at: bare }];

  return null;
}

function numberIn(tokens: string[]): number | null {
  for (const token of tokens) {
    const value = numberAt(token);
    if (value !== null) return value;
  }
  return null;
}

/** A radius given as "within 6" or similar, else the default for that verb. */
function radiusFrom(tokens: string[], fallback: number): number {
  const index = tokens.findIndex((t) => t === 'within' || t === 'radius' || t === 'across');
  if (index >= 0) {
    const value = numberAt(tokens[index + 1]);
    if (value !== null) return Math.max(1, Math.min(16, value));
  }
  if (tokens.includes('big') || tokens.includes('huge') || tokens.includes('large')) return 14;
  if (tokens.includes('small') || tokens.includes('little') || tokens.includes('tiny')) return 3;
  return fallback;
}

/**
 * Read a whole command, which may address a kit by name and may chain up to
 * three phrases with "then".
 */
export function parseCommand(input: string, context: ParseContext): ParseResult {
  const text = input.trim();
  let addressed: string | null = null;
  let body = text;

  // A leading token is a name only when a comma follows it, or when it matches
  // a kit and is not itself a command word. Without that rule a kit called
  // "Dot" would swallow the verb in "dot the hill with gems".
  const comma = /^([\p{L}][\p{L}'-]*)\s*,\s*(.+)$/u.exec(text);
  const names = context.kitNames ?? [];
  if (comma?.[1] && comma[2]) {
    const candidate = comma[1].toLowerCase();
    if (names.some((n) => n.toLowerCase() === candidate)) {
      addressed = comma[1];
      body = comma[2];
    }
  } else {
    const first = normalise(text).split(' ')[0] ?? '';
    // Without a comma, a leading word is a name only if it is not also a verb
    // we understand. A kit called "Scatter" must not swallow "scatter gems".
    if (names.some((n) => n.toLowerCase() === first) && !COMMAND_WORDS.has(first)) {
      addressed = first;
      body = text.slice(first.length).trim();
    }
  }

  const phrases = body
    .split(/\bthen\b|;/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (phrases.length === 0) {
    return {
      ok: false,
      phrase: text,
      index: 1,
      suggestions: closestCommands(text),
      reason: 'unknown',
    };
  }
  if (phrases.length > MAX_PHRASES) {
    return {
      ok: false,
      phrase: phrases[MAX_PHRASES] ?? '',
      index: MAX_PHRASES + 1,
      suggestions: closestCommands(phrases[MAX_PHRASES] ?? ''),
      reason: 'too-many-phrases',
    };
  }

  const actions: Action[] = [];
  for (let i = 0; i < phrases.length; i++) {
    const phrase = phrases[i] ?? '';
    const parsed = parsePhrase(phrase, context);
    if (!parsed) {
      // One unreadable phrase rejects the whole command, so a typo never moves
      // her halfway. A phrase the world refuses later is a different matter.
      return {
        ok: false,
        phrase,
        index: i + 1,
        suggestions: closestCommands(phrase),
        reason: 'unknown',
      };
    }
    actions.push(...parsed);
  }

  return { ok: true, actions, addressed };
}

/** Every block word the parser accepts, for onboarding and the help text. */
export function blockVocabulary(): string[] {
  return BLOCKS.flatMap((block) => [block.name, ...block.synonyms]);
}
