/**
 * Saving and loading (spec R8).
 *
 * One JSON document under one localStorage key: the seed, the voxels as
 * run-length bytes in base64, Luciana and what she carries, the last fifty
 * chat lines, and the settings. Never the API key: the save type has no
 * field for it, and a blob that carries one is refused as foreign.
 *
 * Storage can be switched off, full, or holding something from another
 * version. Each of those has a named outcome here rather than an exception,
 * so the game keeps running and says one plain sentence about it.
 */

import { z } from 'zod';
import { CHUNK_COUNT, CHUNK_VOLUME } from '../world/chunks';
import { base64ToBytes, bytesToBase64, rleDecode, rleEncode } from '../world/rle';

export const SAVE_KEY = 'daniblox:v1';
export const SAVE_VERSION = 1;
/** Spec R8: warn when the save grows past this. */
export const WARN_BYTES = 4 * 1024 * 1024;
export const WORLD_BYTES = CHUNK_COUNT * CHUNK_VOLUME;
const MAX_CHAT = 50;

const Vec3 = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }).strict();

const KitSave = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(40),
    at: Vec3,
    /** Pairs of block id and count. */
    inventory: z.array(z.tuple([z.number().int().min(1).max(255), z.number().int().min(0)])),
  })
  .strict();

const ChatSave = z.object({ who: z.enum(['player', 'kit']), text: z.string().max(600) }).strict();

const SettingsSave = z
  .object({
    preferences: z
      .object({
        theme: z.enum(['system', 'light', 'dark']),
        motion: z.enum(['system', 'reduced']),
        renderDistance: z.enum(['auto', 'near', 'far']),
        ambientModel: z.boolean().default(false),
      })
      .strict(),
    model: z
      .object({
        provider: z.enum(['openai', 'anthropic']),
        baseUrl: z.string().max(500),
        model: z.string().max(200),
        remember: z.boolean(),
        /** Whether the model brain was in use, so a reload can pick it back up. */
        active: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const SaveFile = z
  .object({
    version: z.literal(SAVE_VERSION),
    seed: z.number().int().min(0).max(0xffffffff),
    voxels: z.string(),
    kits: z.array(KitSave).max(8),
    chat: z.array(ChatSave).max(MAX_CHAT),
    settings: SettingsSave,
  })
  .strict();

export type SaveFile = z.infer<typeof SaveFile>;
export type KitSave = z.infer<typeof KitSave>;
export type SettingsSave = z.infer<typeof SettingsSave>;

export const DEFAULT_SETTINGS: SettingsSave = {
  preferences: { theme: 'system', motion: 'system', renderDistance: 'auto', ambientModel: false },
  model: { provider: 'openai', baseUrl: '', model: '', remember: false, active: false },
};

// --- voxels ---

export function encodeVoxels(bytes: Uint8Array): string {
  return bytesToBase64(rleEncode(bytes));
}

/** Decode, or null when the text is not a whole world. */
export function decodeVoxels(text: string): Uint8Array | null {
  try {
    const bytes = rleDecode(base64ToBytes(text));
    return bytes.length === WORLD_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

// --- the document ---

export function serialize(save: SaveFile): string {
  return JSON.stringify(save);
}

export type ParseOutcome =
  | { readonly ok: true; readonly save: SaveFile }
  | { readonly ok: false; readonly reason: 'corrupt' | 'newer' };

/**
 * Bring an older document up to the current shape, or say why it cannot be.
 *
 * A document with no version is treated as the pre-release v0 shape: seed
 * and voxels only. Anything newer than this build is left alone rather than
 * guessed at, so a downgrade never silently destroys a save.
 */
export function migrate(raw: unknown): ParseOutcome {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt' };
  const record = raw as Record<string, unknown>;
  const version = typeof record.version === 'number' ? record.version : 0;

  let candidate: unknown = raw;
  if (version === 0) {
    candidate = {
      version: 1,
      seed: record.seed,
      voxels: record.voxels,
      kits: [],
      chat: [],
      settings: DEFAULT_SETTINGS,
    };
  } else if (version > SAVE_VERSION) {
    // v2 does not exist yet. When it does, its reader belongs here, and a v1
    // document is what it will be asked to read.
    return { ok: false, reason: 'newer' };
  }

  const parsed = SaveFile.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: 'corrupt' };
  if (decodeVoxels(parsed.data.voxels) === null) return { ok: false, reason: 'corrupt' };
  return { ok: true, save: parsed.data };
}

export function parseSave(text: string): ParseOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  return migrate(raw);
}

export function measure(text: string): { readonly bytes: number; readonly warn: boolean } {
  const bytes = new TextEncoder().encode(text).length;
  return { bytes, warn: bytes > WARN_BYTES };
}

// --- where it goes ---

export type WriteOutcome = 'ok' | 'quota' | 'failed';

export interface Store {
  readonly kind: 'local' | 'memory';
  get(): string | null;
  set(text: string): WriteOutcome;
  remove(): void;
}

/** A store that lasts for the session only, for when storage is switched off. */
export function memoryStore(): Store {
  let held: string | null = null;
  return {
    kind: 'memory',
    get: () => held,
    set(text) {
      held = text;
      return 'ok';
    },
    remove() {
      held = null;
    },
  };
}

function isQuota(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (error as { code?: number }).code === 22
  );
}

/**
 * localStorage when it works, memory when it does not. Reading is probed once
 * up front, because a browser with storage disabled throws on the getter
 * itself rather than on a call.
 */
export function openStore(storage: () => Storage = () => localStorage): Store {
  let backing: Storage;
  try {
    backing = storage();
    backing.getItem(SAVE_KEY);
  } catch {
    return memoryStore();
  }
  return {
    kind: 'local',
    get() {
      try {
        return backing.getItem(SAVE_KEY);
      } catch {
        return null;
      }
    },
    set(text) {
      try {
        backing.setItem(SAVE_KEY, text);
        return 'ok';
      } catch (error) {
        return isQuota(error) ? 'quota' : 'failed';
      }
    },
    remove() {
      try {
        backing.removeItem(SAVE_KEY);
      } catch {
        // Nothing to remove, or nowhere to remove it from.
      }
    },
  };
}
