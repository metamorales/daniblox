/**
 * The Brain interface (spec R3).
 *
 * Both brains implement exactly this. The scripted one ships and needs
 * nothing; the model-backed one is an upgrade the player can switch on. Each
 * returns data that is validated before anything runs.
 */

import type { Kit } from '../folk/kit';
import type { BrainOutput } from './schema';

export interface WorldSnapshot {
  /** Where the camera is looking, which is what "here" and "me" mean. */
  readonly reticle: { x: number; y: number; z: number };
  /** The block the player last pointed at. */
  readonly focus: { x: number; y: number; z: number } | null;
  /** Position in the day, 0 at dawn. */
  readonly dayPhase: number;
  readonly kitNames: readonly string[];
}

export interface ChatTurn {
  readonly who: 'player' | 'kit';
  readonly text: string;
}

export interface BrainRequest {
  readonly text: string;
  readonly source: 'user' | 'folk';
  readonly folk: Kit;
  readonly world: WorldSnapshot;
  readonly history: readonly ChatTurn[];
}

export interface Brain {
  readonly name: string;
  respond(request: BrainRequest): Promise<BrainOutput>;
}
