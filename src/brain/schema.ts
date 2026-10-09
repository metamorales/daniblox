/**
 * The closed action vocabulary, and the validator every Brain output must
 * pass (spec R2, non-negotiable 2).
 *
 * Nothing a Brain produces is ever executed as code. It produces data, that
 * data is checked against the schema below, and only recognised actions run.
 * A model that invents an action, strays outside the world, or tries to smuggle
 * an extra field is rejected whole.
 *
 * Two families live here. The small jobs are the six from the spec, which
 * Luciana walks over and performs. The world-scale powers were added when the
 * owner replaced eight workers with one companion who can reshape the world;
 * the set is still closed and still validated, which is what the
 * non-negotiable actually requires.
 */

import { z } from 'zod';
import { BLOCKS } from '../world/blocks';
import { WORLD_X, WORLD_Y, WORLD_Z } from '../world/chunks';
import { STRUCTURES } from '../world/structures';

export const MAX_ACTIONS = 10;
export const MAX_SAY = 240;
export const MAX_RADIUS = 16;

const blockIds: readonly number[] = BLOCKS.map((b) => b.id);

const BlockId = z
  .number()
  .int()
  .refine((id) => blockIds.includes(id), { message: 'unknown block' });

export const Vec3 = z
  .object({
    x: z
      .number()
      .int()
      .min(0)
      .max(WORLD_X - 1),
    y: z
      .number()
      .int()
      .min(0)
      .max(WORLD_Y - 1),
    z: z
      .number()
      .int()
      .min(0)
      .max(WORLD_Z - 1),
  })
  .strict();

export type Vec3 = z.infer<typeof Vec3>;

// --- small jobs: Luciana walks over and does these ---

const Goto = z.object({ type: z.literal('goto'), at: Vec3 }).strict();

const MineByType = z
  .object({
    type: z.literal('mine'),
    block: BlockId,
    count: z.number().int().min(1).max(16),
  })
  .strict();

const MineAt = z.object({ type: z.literal('mine'), at: Vec3 }).strict();

const Place = z.object({ type: z.literal('place'), block: BlockId, at: Vec3 }).strict();

const Follow = z
  .object({ type: z.literal('follow'), target: z.union([z.literal('user'), z.string().min(1)]) })
  .strict();

const Wander = z.object({ type: z.literal('wander') }).strict();

const Stop = z.object({ type: z.literal('stop') }).strict();

/** Owner's change (plan M9): she builds one of three things from her pockets. */
const Build = z
  .object({ type: z.literal('build'), structure: z.enum(STRUCTURES), at: Vec3 })
  .strict();

// --- world-scale powers: she reshapes without walking ---

const Radius = z.number().int().min(1).max(MAX_RADIUS);

const Sculpt = z
  .object({
    type: z.literal('sculpt'),
    shape: z.enum(['raise', 'lower', 'flatten']),
    at: Vec3,
    radius: Radius,
    amount: z.number().int().min(1).max(8),
  })
  .strict();

const Paint = z
  .object({ type: z.literal('paint'), block: BlockId, at: Vec3, radius: Radius })
  .strict();

const Plant = z
  .object({
    type: z.literal('plant'),
    at: Vec3,
    radius: Radius,
    count: z.number().int().min(1).max(24),
  })
  .strict();

const Scatter = z
  .object({
    type: z.literal('scatter'),
    block: BlockId,
    at: Vec3,
    radius: Radius,
    count: z.number().int().min(1).max(32),
  })
  .strict();

const Clear = z.object({ type: z.literal('clear'), at: Vec3, radius: Radius }).strict();

const SetTime = z
  .object({ type: z.literal('settime'), phase: z.enum(['dawn', 'day', 'dusk', 'night']) })
  .strict();

export const Action = z.union([
  Goto,
  MineByType,
  MineAt,
  Place,
  Follow,
  Wander,
  Stop,
  Build,
  Sculpt,
  Paint,
  Plant,
  Scatter,
  Clear,
  SetTime,
]);

export type Action = z.infer<typeof Action>;

export const MOODS = ['cheerful', 'calm', 'curious', 'grumpy', 'sleepy'] as const;
export type Mood = (typeof MOODS)[number];

export const BrainOutput = z
  .object({
    say: z.string().min(1).max(MAX_SAY),
    actions: z.array(Action).max(MAX_ACTIONS),
    mood: z.enum(MOODS).optional(),
  })
  .strict();

export type BrainOutput = z.infer<typeof BrainOutput>;

/** Every action name the vocabulary accepts. Used by the prompt builder. */
export const ACTION_TYPES = [
  'goto',
  'mine',
  'place',
  'follow',
  'wander',
  'stop',
  'build',
  'sculpt',
  'paint',
  'plant',
  'scatter',
  'clear',
  'settime',
] as const;

export type ValidationResult = { ok: true; value: BrainOutput } | { ok: false; error: string };

/** Turn a zod failure into one line a model can actually act on. */
function explain(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Validate a Brain's output. `input` may be a parsed object or raw JSON text,
 * because a model endpoint hands back text and a scripted brain hands back an
 * object, and both go through exactly the same gate.
 */
export function validate(input: unknown): ValidationResult {
  let candidate = input;

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { ok: false, error: 'the reply was not valid JSON' };
    }
  }

  const parsed = BrainOutput.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: explain(parsed.error) };
  return { ok: true, value: parsed.data };
}

/** True when the action makes the kit walk somewhere rather than reshape things. */
export function isSmallJob(action: Action): boolean {
  return (['goto', 'mine', 'place', 'follow', 'wander', 'stop', 'build'] as string[]).includes(
    action.type,
  );
}
