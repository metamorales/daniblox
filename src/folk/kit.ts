/**
 * Luciana, and any kit that follows her.
 *
 * Pure simulation: no Three.js here, so the whole of a kit's movement can be
 * tested in Node. The renderer reads `position` and `facing` and interpolates
 * between ticks.
 */

import { isSolid } from '../world/blocks';
import { World } from '../world/chunks';
import { PathSearch, type Cell, distance, isWalkable } from './pathfinding';

/** Spec R4: three blocks a second. */
export const WALK_SPEED = 3;
export const FALL_SPEED = 9;
/** Pathfinding may take this much of a frame, and no more. */
export const PATH_BUDGET_MS = 2;
/** How close a path may land to the request before the kit gives up (spec R4). */
export const NEAR_ENOUGH = 3;

export type KitState = 'idle' | 'thinking' | 'walking' | 'falling' | 'stuck';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface KitAppearance {
  /** Main coat colour. */
  readonly coat: string;
  /** Patches: ears, tail, saddle, eye patch. */
  readonly patch: string;
}

export interface KitOptions {
  readonly id: string;
  readonly name: string;
  readonly appearance: KitAppearance;
  readonly at: Cell;
}

export class Kit {
  readonly id: string;
  readonly name: string;
  readonly appearance: KitAppearance;

  /** Continuous position, in block units, at the kit's feet. */
  readonly position: Vec3;
  /** Where it was at the previous tick, so the renderer can interpolate. */
  readonly previous: Vec3;

  facing = 0;
  state: KitState = 'idle';
  /** What she is carrying, by block id. */
  readonly inventory = new Map<number, number>();
  /** A short label for the current job, shown beside her name. */
  activity: string | null = null;
  /** Set when the last request could not be met, for the chat layer to voice. */
  lastProblem: string | null = null;
  /** Pathfinding nodes expanded so far, for the perf panel. */
  pathNodes = 0;
  /** How far through the current block of work, 0 to 1, or null between jobs. */
  progress: number | null = null;

  private path: Cell[] = [];
  private pathIndex = 0;
  private search: PathSearch | null = null;
  private goal: Cell | null = null;

  constructor(options: KitOptions) {
    this.id = options.id;
    this.name = options.name;
    this.appearance = options.appearance;
    this.position = { x: options.at.x + 0.5, y: options.at.y, z: options.at.z + 0.5 };
    this.previous = { ...this.position };
  }

  carrying(block: number): number {
    return this.inventory.get(block) ?? 0;
  }

  take(block: number, amount = 1): void {
    this.inventory.set(block, this.carrying(block) + amount);
  }

  /** Spend from the inventory. Returns false when there is nothing to spend. */
  spend(block: number, amount = 1): boolean {
    const held = this.carrying(block);
    if (held < amount) return false;
    if (held === amount) this.inventory.delete(block);
    else this.inventory.set(block, held - amount);
    return true;
  }

  /** The cell the kit is standing in. */
  get cell(): Cell {
    return {
      x: Math.floor(this.position.x),
      y: Math.round(this.position.y),
      z: Math.floor(this.position.z),
    };
  }

  get hasPath(): boolean {
    return this.pathIndex < this.path.length;
  }

  /** Remaining cells of the current route, for tests and the debug panel. */
  get remainingPath(): readonly Cell[] {
    return this.path.slice(this.pathIndex);
  }

  /** Ask the kit to walk somewhere. The search runs across following ticks. */
  goTo(world: World, target: Cell): void {
    this.goal = target;
    this.lastProblem = null;
    this.path = [];
    this.pathIndex = 0;

    const start = this.standingCell(world);
    if (!start) {
      this.state = 'falling';
      this.search = null;
      return;
    }
    this.search = new PathSearch(world, start, target);
    this.state = 'thinking';
  }

  stop(): void {
    this.search = null;
    this.path = [];
    this.pathIndex = 0;
    this.goal = null;
    this.state = 'idle';
  }

  /** One simulation step. */
  tick(world: World, now: () => number = () => performance.now()): void {
    this.previous.x = this.position.x;
    this.previous.y = this.position.y;
    this.previous.z = this.position.z;

    if (this.applyGravity(world)) return;
    if (this.advanceSearch(now)) return;
    this.followPath(world);
  }

  /** The cell the kit can stand in right now, or null if it is in mid-air. */
  private standingCell(world: World): Cell | null {
    const cell = this.cell;
    if (isWalkable(world, cell.x, cell.y, cell.z)) return cell;
    // After an edit the kit may be standing inside or above something; look
    // down a little for honest ground before declaring a fall.
    for (let drop = 1; drop <= 2; drop++) {
      if (isWalkable(world, cell.x, cell.y - drop, cell.z)) {
        return { x: cell.x, y: cell.y - drop, z: cell.z };
      }
    }
    return null;
  }

  /** Returns true when the kit is falling and nothing else should run. */
  private applyGravity(world: World): boolean {
    const cell = this.cell;
    const supported = isSolid(world.get(cell.x, Math.round(this.position.y) - 1, cell.z));
    const stepping = this.state === 'walking' && this.hasPath;

    if (supported || stepping) {
      if (this.state === 'falling') {
        // Landed. Any path we had is stale now.
        this.position.y = Math.round(this.position.y);
        this.path = [];
        this.pathIndex = 0;
        this.state = this.goal ? 'thinking' : 'idle';
        if (this.goal) this.goTo(world, this.goal);
      }
      return false;
    }

    if (this.state !== 'falling') {
      this.state = 'falling';
      this.search = null;
    }

    const step = FALL_SPEED / 20;
    const next = this.position.y - step;
    const landing = Math.floor(next);
    if (isSolid(world.get(cell.x, landing, cell.z))) {
      this.position.y = landing + 1;
      this.state = 'idle';
      if (this.goal && distance(this.cell, this.goal) > 0) this.goTo(world, this.goal);
      return true;
    }
    this.position.y = Math.max(next, 0);
    return true;
  }

  /** Returns true when a search is still running this tick. */
  private advanceSearch(now: () => number): boolean {
    const search = this.search;
    if (!search) return false;

    const before = search.nodesExpanded;
    const status = search.step(PATH_BUDGET_MS, now);
    this.pathNodes += search.nodesExpanded - before;
    if (status === 'running') {
      this.state = 'thinking';
      return true;
    }

    const result = search.result();
    this.search = null;

    const end = result.cells[result.cells.length - 1];
    const close = end && this.goal ? distance(end, this.goal) <= NEAR_ENOUGH : false;

    if (result.cells.length <= 1 || (!result.exact && !close)) {
      this.path = [];
      this.pathIndex = 0;
      this.state = 'stuck';
      this.lastProblem = result.expanded ? 'too-far' : 'unreachable';
      return true;
    }

    if (!result.exact) this.lastProblem = 'near-miss';
    this.path = result.cells;
    // The first cell is where the kit already stands.
    this.pathIndex = 1;
    this.state = this.hasPath ? 'walking' : 'idle';
    return true;
  }

  private followPath(world: World): void {
    if (!this.hasPath) {
      if (this.state === 'walking') this.state = 'idle';
      return;
    }

    // Budget for the whole tick, spent across as many waypoints as it reaches.
    // Stopping dead at each cell centre would quietly make the kit slower than
    // its stated speed.
    let budget = WALK_SPEED / 20;

    while (budget > 0 && this.hasPath) {
      const next = this.path[this.pathIndex];
      if (!next) break;

      // Spec R4: replan when a block on the remaining route changes under us.
      if (!isWalkable(world, next.x, next.y, next.z)) {
        if (this.goal) this.goTo(world, this.goal);
        else this.stop();
        return;
      }

      const targetX = next.x + 0.5;
      const targetZ = next.z + 0.5;
      const dx = targetX - this.position.x;
      const dz = targetZ - this.position.z;
      const remaining = Math.hypot(dx, dz);

      if (remaining > 0.0001) this.facing = Math.atan2(dx, dz);

      if (remaining <= budget) {
        this.position.x = targetX;
        this.position.z = targetZ;
        this.position.y = next.y;
        this.pathIndex++;
        budget -= remaining;
        continue;
      }

      this.position.x += (dx / remaining) * budget;
      this.position.z += (dz / remaining) * budget;
      // Rise or drop smoothly across the step rather than snapping at the edge.
      const climb = next.y - this.position.y;
      if (climb !== 0) this.position.y += climb * (budget / remaining);
      budget = 0;
    }

    if (this.hasPath) {
      this.state = 'walking';
    } else {
      this.state = 'idle';
      this.goal = null;
    }
  }
}
