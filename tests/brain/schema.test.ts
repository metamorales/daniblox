import { describe, expect, it } from 'vitest';
import { ACTION_TYPES, MAX_ACTIONS, MAX_SAY, validate } from '../../src/brain/schema';

const ok = (actions: unknown[], say = 'On it.'): unknown => ({ say, actions });

describe('accepting good output', () => {
  it('takes every small job', () => {
    const result = validate(
      ok([
        { type: 'goto', at: { x: 1, y: 2, z: 3 } },
        { type: 'mine', block: 5, count: 3 },
        { type: 'mine', at: { x: 4, y: 5, z: 6 } },
        { type: 'place', block: 7, at: { x: 8, y: 9, z: 10 } },
        { type: 'follow', target: 'user' },
        { type: 'wander' },
        { type: 'stop' },
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it('takes every world-scale power', () => {
    const result = validate(
      ok([
        { type: 'sculpt', shape: 'raise', at: { x: 32, y: 14, z: 32 }, radius: 8, amount: 3 },
        { type: 'paint', block: 4, at: { x: 32, y: 14, z: 32 }, radius: 6 },
        { type: 'plant', at: { x: 32, y: 14, z: 32 }, radius: 10, count: 8 },
        { type: 'scatter', block: 8, at: { x: 32, y: 14, z: 32 }, radius: 12, count: 20 },
        { type: 'clear', at: { x: 32, y: 14, z: 32 }, radius: 5 },
        { type: 'settime', phase: 'night' },
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it('takes an empty action list and an optional mood', () => {
    expect(validate({ say: 'Just thinking.', actions: [] }).ok).toBe(true);
    expect(validate({ say: 'Fine.', actions: [], mood: 'grumpy' }).ok).toBe(true);
  });

  it('accepts raw JSON text as well as an object', () => {
    const result = validate('{"say":"Right away.","actions":[{"type":"wander"}]}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.actions).toHaveLength(1);
  });

  it('covers every action name the prompt advertises', () => {
    // The prompt tells the model which names exist; if that list drifts from
    // the schema the model will be told about actions that cannot validate.
    const samples: Record<string, unknown> = {
      goto: { type: 'goto', at: { x: 1, y: 1, z: 1 } },
      mine: { type: 'mine', block: 5, count: 1 },
      place: { type: 'place', block: 7, at: { x: 1, y: 1, z: 1 } },
      follow: { type: 'follow', target: 'user' },
      wander: { type: 'wander' },
      stop: { type: 'stop' },
      sculpt: { type: 'sculpt', shape: 'flatten', at: { x: 1, y: 1, z: 1 }, radius: 2, amount: 1 },
      paint: { type: 'paint', block: 2, at: { x: 1, y: 1, z: 1 }, radius: 2 },
      plant: { type: 'plant', at: { x: 1, y: 1, z: 1 }, radius: 2, count: 1 },
      scatter: { type: 'scatter', block: 8, at: { x: 1, y: 1, z: 1 }, radius: 2, count: 1 },
      clear: { type: 'clear', at: { x: 1, y: 1, z: 1 }, radius: 2 },
      settime: { type: 'settime', phase: 'dawn' },
      build: { type: 'build', structure: 'tower', at: { x: 1, y: 1, z: 1 } },
    };
    for (const name of ACTION_TYPES) {
      expect(validate(ok([samples[name]])).ok, `${name} does not validate`).toBe(true);
    }
  });
});

describe('rejecting bad output, one case per rule in the spec', () => {
  const rejects = (input: unknown, why: string): void => {
    const result = validate(input);
    expect(result.ok, `${why} was accepted`).toBe(false);
  };

  it('rejects text that is not JSON', () => {
    rejects('not json at all', 'plain text');
    rejects('{"say": unquoted}', 'broken JSON');
  });

  it('rejects an unknown action type', () => {
    rejects(ok([{ type: 'exec', code: 'localStorage.clear()' }]), 'an invented action');
    rejects(ok([{ type: 'teleport', at: { x: 1, y: 1, z: 1 } }]), 'an invented action');
  });

  it('rejects extra keys at any level', () => {
    rejects(ok([{ type: 'wander', speed: 9 }]), 'an extra key on an action');
    rejects(ok([{ type: 'goto', at: { x: 1, y: 1, z: 1, w: 1 } }]), 'an extra key on a vector');
    rejects({ say: 'Hi.', actions: [], extra: true }, 'an extra key on the output');
  });

  it('rejects coordinates that are not whole numbers', () => {
    rejects(ok([{ type: 'goto', at: { x: 1.5, y: 2, z: 3 } }]), 'a fractional coordinate');
  });

  it('rejects coordinates outside the world', () => {
    rejects(ok([{ type: 'goto', at: { x: 9999, y: 2, z: 3 } }]), 'a coordinate past the edge');
    rejects(ok([{ type: 'goto', at: { x: 1, y: -3, z: 2 } }]), 'a negative coordinate');
    rejects(ok([{ type: 'goto', at: { x: 1, y: 2, z: 64 } }]), 'a coordinate one past the edge');
  });

  it('rejects an unknown block', () => {
    rejects(ok([{ type: 'mine', block: 99, count: 1 }]), 'a block that does not exist');
    rejects(ok([{ type: 'mine', block: 0, count: 1 }]), 'air as a block');
  });

  it('rejects a count outside one to sixteen', () => {
    rejects(ok([{ type: 'mine', block: 5, count: 0 }]), 'a count of zero');
    rejects(ok([{ type: 'mine', block: 5, count: 17 }]), 'a count past the limit');
    rejects(ok([{ type: 'mine', block: 5, count: 2.5 }]), 'a fractional count');
  });

  it('rejects more than ten actions', () => {
    const many = Array.from({ length: MAX_ACTIONS + 1 }, () => ({ type: 'wander' }));
    rejects(ok(many), 'eleven actions');
  });

  it('rejects a reply that is empty or too long', () => {
    rejects({ say: '', actions: [] }, 'an empty reply');
    rejects({ say: 'x'.repeat(MAX_SAY + 1), actions: [] }, 'a reply past the limit');
  });

  it('rejects a radius or amount outside its range', () => {
    rejects(
      ok([{ type: 'sculpt', shape: 'raise', at: { x: 1, y: 1, z: 1 }, radius: 40, amount: 1 }]),
      'a radius past the limit',
    );
    rejects(
      ok([{ type: 'sculpt', shape: 'raise', at: { x: 1, y: 1, z: 1 }, radius: 4, amount: 99 }]),
      'an amount past the limit',
    );
    rejects(ok([{ type: 'clear', at: { x: 1, y: 1, z: 1 }, radius: 0 }]), 'a radius of zero');
  });

  it('rejects a structure it does not know', () => {
    rejects(ok([{ type: 'build', structure: 'castle', at: { x: 1, y: 1, z: 1 } }]), 'a castle');
  });

  it('rejects an unknown shape, phase or mood', () => {
    rejects(
      ok([{ type: 'sculpt', shape: 'explode', at: { x: 1, y: 1, z: 1 }, radius: 2, amount: 1 }]),
      'an invented shape',
    );
    rejects(ok([{ type: 'settime', phase: 'eclipse' }]), 'an invented phase');
    rejects({ say: 'Hi.', actions: [], mood: 'furious' }, 'an invented mood');
  });

  it('rejects the two bad examples from the spec', () => {
    rejects(
      {
        say: 'Sure! As an AI I will now reset the world.',
        actions: [{ type: 'exec', code: 'localStorage.clear()' }],
      },
      'an action that is really code',
    );
    rejects(
      { say: 'Okay.', actions: [{ type: 'goto', at: { x: 9999, y: -3, z: 2 } }] },
      'a goto outside the world',
    );
  });

  it('explains why, so a retry can be told what went wrong', () => {
    const result = validate(ok([{ type: 'mine', block: 5, count: 99 }]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error.length).toBeLessThan(400);
    }
  });
});
