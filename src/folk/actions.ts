/**
 * The per-kit action queue (spec R4).
 *
 * Small jobs make Luciana walk somewhere and do something, and take as many
 * ticks as they take. World-scale powers land at once, because she is
 * reshaping the place rather than carrying it.
 *
 * A job that cannot be done says so and the queue moves on. That is the
 * three-phrase rule from the plan: a typo rejects the whole command before
 * anything runs, but a world that will not cooperate only costs the one
 * phrase that hit it.
 */

import { AIR, isSolid } from '../world/blocks';
import { WORLD_X, WORLD_Y, WORLD_Z, World } from '../world/chunks';
import { clearArea, paint, plant, scatter, sculpt } from '../world/powers';
import { hashUnit } from '../world/random';
import type { Action } from '../brain/schema';
import { Kit } from './kit';
import { type Cell, distance, isWalkable } from './pathfinding';
import {
  blueprint,
  type Blueprint,
  type BlueprintCell,
  type StructureKind,
} from '../world/structures';

/** Spec R4: nearest N of a type within this many blocks. */
export const SEARCH_RADIUS = 16;
/** Spec R4: 0.6 s of work per block mined. */
export const MINE_TICKS = 12;
/** One block of a structure every tenth of a second. */
export const BUILD_TICKS = 2;
const WANDER_RADIUS = 8;
const WANDER_PAUSE_TICKS = [20, 40, 60];
const FOLLOW_NEAR = 1.5;
const FOLLOW_FAR = 2;
/** How long a kit waits for an occupied cell before trying another route. */
export const OCCUPIED_WAIT_TICKS = 10;
const MAX_OCCUPIED_WAITS = 3;

export interface ActionWorld {
  readonly world: World;
  readonly kits: readonly Kit[];
  /** The cell the camera orbits, which is what "here" and "me" mean. */
  reticle(): Cell;
  setDayPhase(phase: number): void;
  readonly seed: number;
  /** Luciana reporting on her own work. The chat layer gives this a voice. */
  report(kit: Kit, note: string, detail?: Record<string, unknown>): void;
}

const DAY_PHASES: Record<string, number> = { dawn: 0.02, day: 0.3, dusk: 0.56, night: 0.78 };

interface Job {
  readonly action: Action;
  /** Mined so far, for a job with a count. */
  mined: number;
  /** Ticks spent on the current block. */
  work: number;
  /** Ticks spent waiting for something to clear. */
  waited: number;
  waits: number;
  started: boolean;
  target: Cell | null;
  /** For a build: the plan, how far through it she is, and cells to retry. */
  plan: Blueprint | null;
  placed: number;
  built: number;
  skipped: BlueprintCell[];
  /** Set once gather jobs were put ahead of a build, so it never loops. */
  gathered: boolean;
}

function newJob(action: Action): Job {
  return {
    action,
    mined: 0,
    work: 0,
    waited: 0,
    waits: 0,
    started: false,
    target: null,
    plan: null,
    placed: 0,
    built: 0,
    skipped: [],
    gathered: false,
  };
}

export class ActionQueue {
  private jobs: Job[] = [];
  private pause = 0;

  constructor(
    private readonly kit: Kit,
    private readonly context: ActionWorld,
  ) {}

  get current(): Action | null {
    return this.jobs[0]?.action ?? null;
  }

  get length(): number {
    return this.jobs.length;
  }

  get idle(): boolean {
    return this.jobs.length === 0;
  }

  /** Replace whatever she was doing. Used by "stop" and by a fresh command. */
  clear(): void {
    this.jobs = [];
    this.pause = 0;
    this.kit.stop();
    this.kit.activity = null;
    this.kit.progress = null;
  }

  push(actions: readonly Action[]): void {
    for (const action of actions) {
      if (action.type === 'stop') {
        this.clear();
        continue;
      }
      this.jobs.push(newJob(action));
    }
  }

  /** One simulation step. Call after the kit's own tick. */
  tick(): void {
    if (this.pause > 0) {
      this.pause--;
      return;
    }
    const job = this.jobs[0];
    if (!job) {
      this.kit.activity = null;
      this.kit.progress = null;
      return;
    }

    const done = this.run(job);
    if (done) {
      this.jobs.shift();
      this.kit.progress = null;
      if (this.jobs.length === 0) this.kit.activity = null;
    }
  }

  /** Returns true when the job is finished, one way or another. */
  private run(job: Job): boolean {
    const { action } = job;
    switch (action.type) {
      case 'goto':
        return this.runGoto(job, action.at);
      case 'mine':
        return 'at' in action
          ? this.runMineAt(job, action.at)
          : this.runMineType(job, action.block, action.count);
      case 'place':
        return this.runPlace(job, action.block, action.at);
      case 'follow':
        return this.runFollow(job, action.target);
      case 'wander':
        return this.runWander(job);
      case 'stop':
        this.clear();
        return true;
      case 'build':
        return this.runBuild(job, action.structure, action.at);
      case 'sculpt':
      case 'paint':
      case 'plant':
      case 'scatter':
      case 'clear':
      case 'settime':
        return this.runPower(action);
      default:
        return true;
    }
  }

  // --- small jobs ---

  private runGoto(job: Job, at: Cell): boolean {
    const kit = this.kit;
    kit.activity = 'walking';

    if (!job.started) {
      job.started = true;
      kit.goTo(this.context.world, this.standable(at));
      return false;
    }
    if (kit.state === 'thinking' || kit.state === 'walking' || kit.state === 'falling') {
      return this.watchForBlockage(job);
    }
    if (kit.state === 'stuck') {
      this.context.report(kit, 'cannot-reach', { at });
      return true;
    }
    return true;
  }

  /**
   * A cell that can actually be stood in: the request may name a block rather
   * than the space above it.
   */
  private standable(at: Cell): Cell {
    const world = this.context.world;
    if (isWalkable(world, at.x, at.y, at.z)) return at;
    for (const dy of [1, 2, -1]) {
      if (isWalkable(world, at.x, at.y + dy, at.z)) return { x: at.x, y: at.y + dy, z: at.z };
    }
    return at;
  }

  /** Another kit in the way is waited out, then routed around (spec R4). */
  private watchForBlockage(job: Job): boolean {
    const kit = this.kit;
    const next = kit.remainingPath[0];
    if (!next) return false;

    const occupied = this.context.kits.some(
      (other) =>
        other !== kit &&
        other.cell.x === next.x &&
        other.cell.y === next.y &&
        other.cell.z === next.z,
    );
    if (!occupied) {
      job.waited = 0;
      return false;
    }

    job.waited++;
    if (job.waited < OCCUPIED_WAIT_TICKS) return false;

    job.waited = 0;
    job.waits++;
    if (job.waits > MAX_OCCUPIED_WAITS) {
      this.context.report(kit, 'blocked');
      return true;
    }
    kit.goTo(this.context.world, this.standable({ x: next.x, y: next.y, z: next.z }));
    return false;
  }

  private runMineAt(job: Job, at: Cell): boolean {
    const kit = this.kit;
    const world = this.context.world;
    const block = world.get(at.x, at.y, at.z);
    if (block === AIR) {
      this.context.report(kit, 'nothing-there', { at });
      return true;
    }
    kit.activity = 'mining';
    kit.progress = null;

    if (!job.started) {
      job.started = true;
      job.target = at;
      kit.goTo(world, this.beside(at));
      return false;
    }
    if (kit.state === 'thinking' || kit.state === 'walking' || kit.state === 'falling')
      return false;
    if (kit.state === 'stuck' && distance(kit.cell, at) > 2) {
      this.context.report(kit, 'cannot-reach', { at });
      return true;
    }

    // Face it, work for a moment, then take it.
    kit.facing = Math.atan2(at.x + 0.5 - kit.position.x, at.z + 0.5 - kit.position.z);
    job.work++;
    kit.progress = job.work / MINE_TICKS;
    if (job.work < MINE_TICKS) return false;

    world.set(at.x, at.y, at.z, AIR);
    kit.take(block);
    this.context.report(kit, 'mined', { block, at });
    return true;
  }

  private runMineType(job: Job, block: number, count: number): boolean {
    const kit = this.kit;
    const world = this.context.world;
    kit.activity = 'mining';
    kit.progress = null;

    if (job.mined >= count) {
      this.context.report(kit, 'gathered', { block, count: job.mined });
      return true;
    }

    if (!job.target) {
      const found = this.nearest(block);
      if (!found) {
        if (job.mined > 0) {
          this.context.report(kit, 'gathered-some', { block, count: job.mined, wanted: count });
        } else {
          this.context.report(kit, 'none-nearby', { block });
        }
        return true;
      }
      job.target = found;
      job.work = 0;
      job.started = true;
      kit.goTo(world, this.beside(found));
      return false;
    }

    const at = job.target;
    if (world.get(at.x, at.y, at.z) !== block) {
      // Somebody took it first. Look again.
      job.target = null;
      return false;
    }
    if (kit.state === 'thinking' || kit.state === 'walking' || kit.state === 'falling')
      return false;
    if (kit.state === 'stuck' && distance(kit.cell, at) > 2) {
      // Unreachable: try the next candidate rather than giving up outright.
      job.target = null;
      job.work = 0;
      job.waits++;
      if (job.waits > 5) {
        this.context.report(kit, 'none-reachable', { block });
        return true;
      }
      return false;
    }

    kit.facing = Math.atan2(at.x + 0.5 - kit.position.x, at.z + 0.5 - kit.position.z);
    job.work++;
    kit.progress = job.work / MINE_TICKS;
    if (job.work < MINE_TICKS) return false;

    world.set(at.x, at.y, at.z, AIR);
    kit.take(block);
    job.mined++;
    job.target = null;
    job.work = 0;
    return false;
  }

  /** Nearest block of a type within the search radius, by walking distance. */
  private nearest(block: number): Cell | null {
    const world = this.context.world;
    const from = this.kit.cell;
    let best: Cell | null = null;
    let bestDistance = Infinity;

    for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
      for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz++) {
        for (let dy = -SEARCH_RADIUS; dy <= SEARCH_RADIUS; dy++) {
          const x = from.x + dx;
          const y = from.y + dy;
          const z = from.z + dz;
          if (x < 0 || y < 0 || z < 0 || x >= WORLD_X || y >= WORLD_Y || z >= WORLD_Z) continue;
          if (world.get(x, y, z) !== block) continue;
          const span = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (span > SEARCH_RADIUS || span >= bestDistance) continue;
          // Only blocks she can actually get beside.
          if (!this.hasApproach({ x, y, z })) continue;
          bestDistance = span;
          best = { x, y, z };
        }
      }
    }
    return best;
  }

  private hasApproach(at: Cell): boolean {
    const world = this.context.world;
    for (const [dx, dy, dz] of NEIGHBOUR_OFFSETS) {
      if (isWalkable(world, at.x + dx, at.y + dy, at.z + dz)) return true;
    }
    return false;
  }

  /** A cell beside the target that she can stand in. */
  private beside(at: Cell): Cell {
    const world = this.context.world;
    let best: Cell = at;
    let bestDistance = Infinity;
    for (const [dx, dy, dz] of NEIGHBOUR_OFFSETS) {
      const cell = { x: at.x + dx, y: at.y + dy, z: at.z + dz };
      if (!isWalkable(world, cell.x, cell.y, cell.z)) continue;
      const span = distance(cell, this.kit.cell);
      if (span < bestDistance) {
        bestDistance = span;
        best = cell;
      }
    }
    return best;
  }

  private runPlace(job: Job, block: number, at: Cell): boolean {
    const kit = this.kit;
    const world = this.context.world;
    kit.activity = 'building';

    if (kit.carrying(block) <= 0) {
      this.context.report(kit, 'nothing-to-place', { block });
      return true;
    }
    if (world.get(at.x, at.y, at.z) !== AIR) {
      this.context.report(kit, 'already-something-there', { at });
      return true;
    }
    if (!this.hasSolidNeighbour(at)) {
      this.context.report(kit, 'nothing-to-build-on', { at });
      return true;
    }
    const ownCell = kit.cell;
    if (
      ownCell.x === at.x &&
      ownCell.z === at.z &&
      (ownCell.y === at.y || ownCell.y + 1 === at.y)
    ) {
      this.context.report(kit, 'standing-there', { at });
      return true;
    }
    if (this.context.kits.some((other) => sameCell(other.cell, at))) {
      job.waited++;
      if (job.waited < OCCUPIED_WAIT_TICKS * MAX_OCCUPIED_WAITS) return false;
      this.context.report(kit, 'someone-in-the-way', { at });
      return true;
    }

    if (!job.started) {
      job.started = true;
      kit.goTo(world, this.beside(at));
      return false;
    }
    if (kit.state === 'thinking' || kit.state === 'walking' || kit.state === 'falling')
      return false;
    if (kit.state === 'stuck' && distance(kit.cell, at) > 2) {
      this.context.report(kit, 'cannot-reach', { at });
      return true;
    }

    if (!kit.spend(block)) {
      this.context.report(kit, 'nothing-to-place', { block });
      return true;
    }
    world.set(at.x, at.y, at.z, block);
    this.context.report(kit, 'placed', { block, at });
    return true;
  }

  // --- building ---

  /**
   * Put up a structure from her pockets, one block every couple of ticks,
   * bottom up. What she lacks she gathers first by putting gather jobs ahead
   * of this one; if the meadow cannot supply it, she says so and gives up.
   */
  private runBuild(job: Job, kind: StructureKind, at: Cell): boolean {
    const kit = this.kit;
    const world = this.context.world;
    kit.activity = 'building';

    if (!job.plan) {
      job.plan = blueprint(kind, at, world);
      if (job.plan.cells.length === 0) {
        this.context.report(kit, 'nowhere-to-build', { structure: kind });
        return true;
      }
    }
    const plan = job.plan;

    // Materials are checked once, before she sets off. Checking again later
    // would count the blocks she has already placed as missing, and she
    // would go and dig up her own work.
    if (!job.started) {
      const short = this.shortfall(plan);
      if (short.length > 0) {
        const first = short[0];
        if (job.gathered || !first) {
          this.context.report(kit, 'short-of', {
            structure: kind,
            block: first?.[0],
            count: first?.[1] ?? 0,
          });
          return true;
        }
        job.gathered = true;
        const gathers: Job[] = [];
        for (const [block, missing] of short) {
          let left = missing;
          while (left > 0) {
            const count = Math.min(16, left);
            gathers.push(newJob({ type: 'mine', block, count }));
            left -= count;
          }
        }
        this.jobs.splice(0, 0, ...gathers);
        this.context.report(kit, 'gathering-for', {
          structure: kind,
          block: first[0],
          count: first[1],
        });
        return false;
      }
      job.started = true;
      job.target = this.buildSpot(at);
      kit.goTo(world, job.target);
      return false;
    }
    if (kit.state === 'thinking' || kit.state === 'walking' || kit.state === 'falling')
      return false;
    if (kit.state === 'stuck' && distance(kit.cell, at) > 5) {
      this.context.report(kit, 'cannot-reach', { at });
      return true;
    }

    kit.facing = Math.atan2(at.x + 0.5 - kit.position.x, at.z + 0.5 - kit.position.z);
    job.work++;
    if (job.work % BUILD_TICKS !== 0) return false;

    while (job.placed < plan.cells.length) {
      const cell = plan.cells[job.placed];
      job.placed++;
      if (!cell) continue;
      if (world.get(cell.x, cell.y, cell.z) === cell.block) continue;
      if (this.occupied(cell)) {
        job.skipped.push(cell);
        continue;
      }
      if (!this.lay(cell)) {
        this.context.report(kit, 'short-of', { structure: kind, block: cell.block, count: 1 });
        return true;
      }
      job.built++;
      kit.progress = job.placed / plan.cells.length;
      return false;
    }

    // One more go at the cells somebody was standing in.
    const retry = job.skipped.shift();
    if (retry) {
      if (!this.occupied(retry) && this.lay(retry)) job.built++;
      return false;
    }

    kit.progress = null;
    this.context.report(kit, 'built', { structure: kind, count: job.built });
    return true;
  }

  /**
   * Put one planned block in. A site on a slope has ground in the footprint;
   * she digs that out into her pocket first, so a house cuts into a hill
   * rather than coming out with gaps. False when she has nothing to lay.
   */
  private lay(cell: BlueprintCell): boolean {
    const world = this.context.world;
    const kit = this.kit;
    const existing = world.get(cell.x, cell.y, cell.z);
    if (existing === cell.block) return true;
    if (!kit.spend(cell.block)) return false;
    if (existing !== AIR) kit.take(existing);
    world.set(cell.x, cell.y, cell.z, cell.block);
    return true;
  }

  /** What the plan needs beyond what she carries, as [block, missing] pairs. */
  private shortfall(plan: Blueprint): [number, number][] {
    const out: [number, number][] = [];
    for (const [block, needed] of plan.bill) {
      const missing = needed - this.kit.carrying(block);
      if (missing > 0) out.push([block, missing]);
    }
    return out;
  }

  /** Somewhere to stand just outside the footprint, nearest first. */
  private buildSpot(at: Cell): Cell {
    const world = this.context.world;
    const options: Cell[] = [];
    for (const [dx, dz] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [2, 2],
      [-2, 2],
      [2, -2],
      [-2, -2],
    ] as const) {
      const x = at.x + dx;
      const z = at.z + dz;
      const y = world.surfaceHeight(x, z) + 1;
      if (isWalkable(world, x, y, z)) options.push({ x, y, z });
    }
    options.sort((a, b) => distance(a, this.kit.cell) - distance(b, this.kit.cell));
    return options[0] ?? this.beside(at);
  }

  private occupied(cell: Cell): boolean {
    return this.context.kits.some((other) => {
      const c = other.cell;
      return c.x === cell.x && c.z === cell.z && (c.y === cell.y || c.y + 1 === cell.y);
    });
  }

  private hasSolidNeighbour(at: Cell): boolean {
    const world = this.context.world;
    for (const [dx, dy, dz] of NEIGHBOUR_OFFSETS) {
      if (isSolid(world.get(at.x + dx, at.y + dy, at.z + dz))) return true;
    }
    return false;
  }

  private runFollow(job: Job, target: string): boolean {
    const kit = this.kit;
    kit.activity = 'following';

    const spot =
      target === 'user'
        ? this.context.reticle()
        : (this.context.kits.find((other) => other.id === target)?.cell ?? null);

    if (!spot) {
      this.context.report(kit, 'no-such-kit', { target });
      return true;
    }

    const gap = Math.hypot(spot.x + 0.5 - kit.position.x, spot.z + 0.5 - kit.position.z);
    if (gap <= FOLLOW_NEAR) {
      if (kit.state === 'walking' || kit.state === 'thinking') kit.stop();
      job.target = null;
      return false;
    }
    if (gap > FOLLOW_FAR && (!job.target || !sameCell(job.target, spot))) {
      job.target = { ...spot };
      kit.goTo(this.context.world, this.standable(spot));
    }
    // Following never finishes on its own; a new command replaces it.
    return false;
  }

  private runWander(job: Job): boolean {
    const kit = this.kit;
    kit.activity = 'wandering';

    if (kit.state === 'walking' || kit.state === 'thinking' || kit.state === 'falling')
      return false;

    const from = kit.cell;
    const salt = this.context.seed ^ (job.mined << 8);
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = hashUnit(from.x + attempt, job.mined, from.z, salt) * Math.PI * 2;
      const span = 2 + hashUnit(from.z, attempt, from.x, salt) * (WANDER_RADIUS - 2);
      const x = Math.round(from.x + Math.cos(angle) * span);
      const z = Math.round(from.z + Math.sin(angle) * span);
      for (const dy of [0, 1, -1, 2, -2]) {
        if (isWalkable(this.context.world, x, from.y + dy, z)) {
          job.mined++;
          kit.goTo(this.context.world, { x, y: from.y + dy, z });
          this.pause = WANDER_PAUSE_TICKS[job.mined % WANDER_PAUSE_TICKS.length] ?? 30;
          return false;
        }
      }
    }
    this.context.report(kit, 'nowhere-to-wander');
    return true;
  }

  // --- world-scale powers ---

  private runPower(action: Action): boolean {
    const done = this.applyPower(action);
    this.unbury();
    return done;
  }

  /**
   * A power can raise ground or grow a tree straight through a kit. Nobody
   * should be left inside a block, so anyone buried is stood on the new
   * surface of their own column.
   */
  private unbury(): void {
    const world = this.context.world;
    for (const kit of this.context.kits) {
      const cell = kit.cell;
      const buried =
        isSolid(world.get(cell.x, cell.y, cell.z)) ||
        isSolid(world.get(cell.x, cell.y + 1, cell.z));
      if (!buried) continue;
      const top = world.surfaceHeight(cell.x, cell.z);
      kit.lift(top + 1);
      this.context.report(kit, 'lifted');
    }
  }

  private applyPower(action: Action): boolean {
    const { world, seed } = this.context;
    const kit = this.kit;
    kit.activity = 'reshaping';

    switch (action.type) {
      case 'sculpt': {
        const result = sculpt(world, action);
        this.context.report(kit, result.changed > 0 ? 'sculpted' : 'nothing-happened', {
          shape: action.shape,
          changed: result.changed,
        });
        return true;
      }
      case 'paint': {
        const result = paint(world, action);
        this.context.report(kit, result.changed > 0 ? 'painted' : 'nothing-happened', {
          block: action.block,
          changed: result.changed,
        });
        return true;
      }
      case 'plant': {
        const result = plant(world, action, seed);
        this.context.report(kit, result.changed > 0 ? 'planted' : 'nowhere-to-plant', {
          changed: result.changed,
        });
        return true;
      }
      case 'scatter': {
        const result = scatter(world, action, seed);
        this.context.report(kit, result.changed > 0 ? 'scattered' : 'nothing-happened', {
          block: action.block,
          changed: result.changed,
        });
        return true;
      }
      case 'clear': {
        const result = clearArea(world, action);
        this.context.report(kit, result.changed > 0 ? 'cleared' : 'nothing-happened', {
          changed: result.changed,
        });
        return true;
      }
      case 'settime': {
        this.context.setDayPhase(DAY_PHASES[action.phase] ?? 0.3);
        this.context.report(kit, 'time-changed', { phase: action.phase });
        return true;
      }
      default:
        return true;
    }
  }
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

const NEIGHBOUR_OFFSETS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
];
