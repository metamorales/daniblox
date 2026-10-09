/**
 * Time-sliced 3D A* (spec R4).
 *
 * A search is a resumable object rather than a function, because a long path
 * must not stall a frame. The caller gives it a couple of milliseconds each
 * frame and asks whether it has finished.
 *
 * Movement rules: four-neighbour moves only, step up one, cost one per move
 * and half as much again for a step up. A kit may drop any height, since a
 * fall costs her nothing in this game; the spec's three-block limit was
 * lifted at the owner's request (decisions M9-1), and a small cost per block
 * dropped keeps her on the gentler way down when there is one. Kits are never
 * obstacles to one another; waiting for a blocked cell belongs to the movement
 * step, not here.
 */

import { isSolid } from '../world/blocks';
import { WORLD_X, WORLD_Y, WORLD_Z, World } from '../world/chunks';

export const MAX_FALL = WORLD_Y;
export const MAX_EXPANDED = 4000;
export const STEP_UP_COST = 0.5;
/** Per block dropped beyond the first, so a cliff is taken only when it is the way. */
export const FALL_COST = 0.1;

export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type SearchState = 'running' | 'found' | 'exhausted';

export function packCell(x: number, y: number, z: number): number {
  return (y << 12) | (z << 6) | x;
}

export function unpackCell(key: number): Cell {
  return { x: key & 63, y: (key >> 12) & 31, z: (key >> 6) & 63 };
}

/**
 * A cell a kit can stand in: room for its feet and its head, with something
 * solid underneath.
 */
export function isWalkable(world: World, x: number, y: number, z: number): boolean {
  if (x < 0 || z < 0 || y < 0 || x >= WORLD_X || z >= WORLD_Z || y >= WORLD_Y) return false;
  if (isSolid(world.get(x, y, z))) return false;
  if (isSolid(world.get(x, y + 1, z))) return false;
  return isSolid(world.get(x, y - 1, z));
}

/** Binary heap keyed on f-score. Small, allocation-free after the first grow. */
class Heap {
  private readonly keys: number[] = [];
  private readonly scores: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, score: number): void {
    this.keys.push(key);
    this.scores.push(score);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.scores[parent] ?? 0) <= (this.scores[i] ?? 0)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.keys[0] ?? -1;
    const lastKey = this.keys.pop();
    const lastScore = this.scores.pop();
    if (this.keys.length > 0 && lastKey !== undefined && lastScore !== undefined) {
      this.keys[0] = lastKey;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && (this.scores[left] ?? 0) < (this.scores[smallest] ?? 0)) {
          smallest = left;
        }
        if (right < this.keys.length && (this.scores[right] ?? 0) < (this.scores[smallest] ?? 0)) {
          smallest = right;
        }
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const key = this.keys[a] ?? 0;
    const score = this.scores[a] ?? 0;
    this.keys[a] = this.keys[b] ?? 0;
    this.scores[a] = this.scores[b] ?? 0;
    this.keys[b] = key;
    this.scores[b] = score;
  }
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface PathResult {
  /** Cells from the start to the end, inclusive. Empty when nothing was found. */
  readonly cells: Cell[];
  /** True when the path reaches the requested cell rather than a near miss. */
  readonly exact: boolean;
  readonly expanded: boolean;
  readonly nodes: number;
}

export class PathSearch {
  readonly goal: Cell;
  private readonly open = new Heap();
  private readonly cameFrom = new Map<number, number>();
  private readonly gScore = new Map<number, number>();
  private readonly closed = new Set<number>();
  private expandedNodes = 0;
  private state: SearchState = 'running';
  private best = -1;
  private bestHeuristic = Infinity;

  constructor(
    private readonly world: World,
    readonly start: Cell,
    goal: Cell,
  ) {
    this.goal = goal;
    const key = packCell(start.x, start.y, start.z);
    this.gScore.set(key, 0);
    this.open.push(key, this.heuristic(start));
    this.best = key;
    this.bestHeuristic = this.heuristic(start);
  }

  get status(): SearchState {
    return this.state;
  }

  get nodesExpanded(): number {
    return this.expandedNodes;
  }

  private heuristic(cell: Cell): number {
    return (
      Math.abs(cell.x - this.goal.x) +
      Math.abs(cell.y - this.goal.y) +
      Math.abs(cell.z - this.goal.z)
    );
  }

  /**
   * Expand nodes for up to `budgetMs`, then hand the frame back. Returns the
   * state so the caller can keep going next frame.
   */
  step(budgetMs: number, now: () => number = () => performance.now()): SearchState {
    if (this.state !== 'running') return this.state;
    const deadline = now() + budgetMs;

    while (this.open.size > 0) {
      if (this.expandedNodes >= MAX_EXPANDED) {
        this.state = 'exhausted';
        return this.state;
      }
      if (now() > deadline) return 'running';

      const currentKey = this.open.pop();
      if (currentKey < 0) break;
      if (this.closed.has(currentKey)) continue;
      this.closed.add(currentKey);
      this.expandedNodes++;

      const current = unpackCell(currentKey);
      const distance = this.heuristic(current);
      if (distance < this.bestHeuristic) {
        this.bestHeuristic = distance;
        this.best = currentKey;
      }
      if (distance === 0) {
        this.state = 'found';
        return this.state;
      }

      const g = this.gScore.get(currentKey) ?? 0;
      for (const move of NEIGHBOURS) {
        const nx = current.x + (move[0] ?? 0);
        const nz = current.z + (move[1] ?? 0);
        const landing = this.landingFor(current, nx, nz);
        if (!landing) continue;

        const nextKey = packCell(landing.cell.x, landing.cell.y, landing.cell.z);
        if (this.closed.has(nextKey)) continue;
        const tentative = g + landing.cost;
        if (tentative >= (this.gScore.get(nextKey) ?? Infinity)) continue;

        this.cameFrom.set(nextKey, currentKey);
        this.gScore.set(nextKey, tentative);
        this.open.push(nextKey, tentative + this.heuristic(landing.cell));
      }
    }

    this.state = 'exhausted';
    return this.state;
  }

  /** Where a step toward (nx, nz) actually lands, or null if it cannot. */
  private landingFor(from: Cell, nx: number, nz: number): { cell: Cell; cost: number } | null {
    const world = this.world;

    // Straight across.
    if (isWalkable(world, nx, from.y, nz)) {
      return { cell: { x: nx, y: from.y, z: nz }, cost: 1 };
    }

    // Up one, but only with headroom to rise into.
    if (!isSolid(world.get(from.x, from.y + 2, from.z)) && isWalkable(world, nx, from.y + 1, nz)) {
      return { cell: { x: nx, y: from.y + 1, z: nz }, cost: 1 + STEP_UP_COST };
    }

    // Down, any height, landing on the first floor found.
    for (let drop = 1; drop <= MAX_FALL; drop++) {
      const y = from.y - drop;
      if (y < 0) break;
      if (isSolid(world.get(nx, y + 1, nz))) break;
      if (isWalkable(world, nx, y, nz)) {
        return { cell: { x: nx, y, z: nz }, cost: 1 + (drop - 1) * FALL_COST };
      }
    }

    return null;
  }

  /**
   * The path found so far. When the goal was never reached this returns the
   * route to the closest cell seen, which the caller accepts only if it lands
   * within three blocks of the target (spec R4).
   */
  result(): PathResult {
    const exact = this.state === 'found';
    const endKey = exact ? packCell(this.goal.x, this.goal.y, this.goal.z) : this.best;

    const cells: Cell[] = [];
    let key: number | undefined = endKey;
    const guard = new Set<number>();
    while (key !== undefined && !guard.has(key)) {
      guard.add(key);
      cells.push(unpackCell(key));
      key = this.cameFrom.get(key);
    }
    cells.reverse();

    return {
      cells,
      exact,
      expanded: this.expandedNodes >= MAX_EXPANDED,
      nodes: this.expandedNodes,
    };
  }
}

/** Run a search to completion. Convenient in tests; the game slices it. */
export function findPath(world: World, start: Cell, goal: Cell): PathResult {
  const search = new PathSearch(world, start, goal);
  let guard = 0;
  while (search.step(1000) === 'running' && guard++ < 1000);
  return search.result();
}

/** Manhattan distance, the measure the spec's "within 3 blocks" rule uses. */
export function distance(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}
