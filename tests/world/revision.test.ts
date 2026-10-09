import { describe, expect, it } from 'vitest';
import { World } from '../../src/world/chunks';

describe('world revision', () => {
  it('moves on every real change and never on a no-op', () => {
    const world = new World(1);
    const start = world.revision;
    expect(world.set(1, 1, 1, 3)).toBe(true);
    expect(world.revision).toBe(start + 1);
    expect(world.set(1, 1, 1, 3)).toBe(false);
    expect(world.revision).toBe(start + 1);
    expect(world.set(-1, 1, 1, 3)).toBe(false);
    expect(world.revision).toBe(start + 1);
  });

  it('takes a new seed and counts that as a change too', () => {
    const world = new World(5);
    const before = world.revision;
    world.reseed(9);
    expect(world.seed).toBe(9);
    expect(world.revision).toBe(before + 1);
  });
});
