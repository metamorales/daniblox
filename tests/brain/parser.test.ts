import { describe, expect, it } from 'vitest';
import {
  MAX_PHRASES,
  closestCommands,
  parseCommand,
  type ParseContext,
} from '../../src/brain/parser';
import { validate } from '../../src/brain/schema';

const HERE = { x: 32, y: 14, z: 32 };
const FOCUS = { x: 10, y: 12, z: 20 };

const context: ParseContext = { reticle: HERE, focus: FOCUS, kitNames: ['Luciana'] };
const noFocus: ParseContext = { reticle: HERE, focus: null, kitNames: ['Luciana'] };

function parse(input: string, ctx: ParseContext = context) {
  return parseCommand(input, ctx);
}

/** Every parse must also survive the schema; the two must never disagree. */
function actions(input: string, ctx: ParseContext = context) {
  const result = parse(input, ctx);
  if (!result.ok) throw new Error(`"${input}" did not parse`);
  const checked = validate({ say: 'ok', actions: result.actions });
  expect(checked.ok, `"${input}" produced actions the schema rejects`).toBe(true);
  return result.actions;
}

describe('small jobs', () => {
  it('reads go here and its cousins', () => {
    for (const input of ['go here', 'go there', 'come', 'come here', 'come back', 'return']) {
      expect(actions(input)[0], input).toEqual({ type: 'goto', at: HERE });
    }
  });

  it('reads explicit coordinates', () => {
    expect(actions('go to 10 12 30')[0]).toEqual({ type: 'goto', at: { x: 10, y: 12, z: 30 } });
    expect(actions('10 12 30')[0]).toEqual({ type: 'goto', at: { x: 10, y: 12, z: 30 } });
  });

  it('reads mine this', () => {
    expect(actions('mine this')[0]).toEqual({ type: 'mine', at: FOCUS });
    expect(actions('break that')[0]).toEqual({ type: 'mine', at: FOCUS });
  });

  it('reads mine by type with a count', () => {
    expect(actions('mine stone 3')[0]).toEqual({ type: 'mine', block: 3, count: 3 });
    expect(actions('dig pebble 2')[0]).toEqual({ type: 'mine', block: 3, count: 2 });
  });

  it('reads gather with the count before the block', () => {
    expect(actions('gather five bark')[0]).toEqual({ type: 'mine', block: 5, count: 5 });
    expect(actions('collect 2 sprout')[0]).toEqual({ type: 'mine', block: 6, count: 2 });
    expect(actions('grab a gem')[0]).toEqual({ type: 'mine', block: 8, count: 1 });
  });

  it('defaults a missing count to one', () => {
    expect(actions('mine clover')[0]).toEqual({ type: 'mine', block: 2, count: 1 });
  });

  it('reads every number word up to sixteen', () => {
    const spelled = [
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      'eleven',
      'twelve',
      'thirteen',
      'fourteen',
      'fifteen',
      'sixteen',
    ];
    spelled.forEach((word, index) => {
      const [action] = actions(`gather ${word} bark`);
      expect(action, word).toEqual({ type: 'mine', block: 5, count: index + 1 });
    });
  });

  it('reads place with and without a destination', () => {
    expect(actions('place tile here')[0]).toEqual({ type: 'place', block: 7, at: FOCUS });
    expect(actions('put tile at 5 6 7')[0]).toEqual({
      type: 'place',
      block: 7,
      at: { x: 5, y: 6, z: 7 },
    });
    expect(actions('build brick here', noFocus)[0]).toEqual({ type: 'place', block: 7, at: HERE });
  });

  it('reads follow', () => {
    expect(actions('follow me')[0]).toEqual({ type: 'follow', target: 'user' });
    expect(actions('follow')[0]).toEqual({ type: 'follow', target: 'user' });
  });

  it('reads wander and stop', () => {
    for (const input of ['wander', 'explore', 'roam']) {
      expect(actions(input)[0], input).toEqual({ type: 'wander' });
    }
    for (const input of ['stop', 'halt', 'wait', 'stay']) {
      expect(actions(input)[0], input).toEqual({ type: 'stop' });
    }
  });

  it('accepts every block name and synonym', () => {
    const pairs: [string, number][] = [
      ['crumb', 1],
      ['ground', 1],
      ['earth', 1],
      ['clover', 2],
      ['grass', 2],
      ['turf', 2],
      ['pebble', 3],
      ['stone', 3],
      ['rock', 3],
      ['shell', 4],
      ['sand', 4],
      ['bark', 5],
      ['log', 5],
      ['wood', 5],
      ['sprout', 6],
      ['leaves', 6],
      ['tile', 7],
      ['brick', 7],
      ['gem', 8],
      ['crystal', 8],
    ];
    for (const [word, id] of pairs) {
      expect(actions(`gather one ${word}`)[0], word).toEqual({ type: 'mine', block: id, count: 1 });
    }
  });
});

describe('world-scale powers', () => {
  it('reads sculpting', () => {
    expect(actions('raise a hill here')[0]).toMatchObject({ type: 'sculpt', shape: 'raise' });
    expect(actions('lower the ground here')[0]).toMatchObject({ type: 'sculpt', shape: 'lower' });
    expect(actions('flatten this')[0]).toMatchObject({ type: 'sculpt', shape: 'flatten' });
    expect(actions('level it off')[0]).toMatchObject({ type: 'sculpt', shape: 'flatten' });
  });

  it('reads painting, planting, scattering and clearing', () => {
    expect(actions('paint this shell')[0]).toMatchObject({ type: 'paint', block: 4 });
    expect(actions('plant a forest here')[0]).toMatchObject({ type: 'plant' });
    expect(actions('scatter gems here')[0]).toMatchObject({ type: 'scatter', block: 8 });
    expect(actions('clear this area')[0]).toMatchObject({ type: 'clear' });
  });

  it('reads the time of day', () => {
    for (const [input, phase] of [
      ['make it night', 'night'],
      ['make it dawn', 'dawn'],
      ['set it to dusk', 'dusk'],
      ['make it midday', 'day'],
    ] as [string, string][]) {
      expect(actions(input)[0], input).toEqual({ type: 'settime', phase });
    }
  });

  it('takes a size from the wording', () => {
    const [big] = actions('raise a big hill here');
    const [small] = actions('raise a small hill here');
    expect(big?.type).toBe('sculpt');
    expect(small?.type).toBe('sculpt');
    if (big?.type === 'sculpt' && small?.type === 'sculpt') {
      expect(big.radius).toBeGreaterThan(small.radius);
    }
  });

  it('keeps every power inside the schema limits', () => {
    const [action] = actions('scatter 999 gems within 99 here');
    expect(action?.type).toBe('scatter');
    if (action?.type === 'scatter') {
      expect(action.count).toBeLessThanOrEqual(32);
      expect(action.radius).toBeLessThanOrEqual(16);
    }
  });

  it('tells digging a block apart from digging a hole', () => {
    expect(actions('dig stone 2')[0]).toMatchObject({ type: 'mine', block: 3 });
    expect(actions('dig here')[0]).toMatchObject({ type: 'sculpt', shape: 'lower' });
  });
});

describe('chaining and naming', () => {
  it('chains up to three phrases', () => {
    const parsed = actions('gather three bark then come back then wander');
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ type: 'mine' });
    expect(parsed[1]).toMatchObject({ type: 'goto' });
    expect(parsed[2]).toMatchObject({ type: 'wander' });
  });

  it('refuses a fourth phrase and says which one', () => {
    const result = parse('wander then stop then wander then stop');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too-many-phrases');
      expect(result.index).toBe(MAX_PHRASES + 1);
    }
  });

  it('reads a name followed by a comma', () => {
    const result = parse('Luciana, wander');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.addressed).toBe('Luciana');
      expect(result.actions[0]).toEqual({ type: 'wander' });
    }
  });

  it('does not mistake a command word for a name', () => {
    const result = parse('scatter gems here', { ...context, kitNames: ['Scatter'] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.actions[0]).toMatchObject({ type: 'scatter' });
  });

  it('ignores case, punctuation and politeness', () => {
    for (const input of ['WANDER!', '  wander  ', 'could you please wander?', 'just wander, now']) {
      const parsed = actions(input);
      expect(parsed[0], input).toEqual({ type: 'wander' });
    }
  });
});

describe('what it cannot read', () => {
  const unreadable = [
    'tell me a story about the sea',
    'what is your favourite colour',
    'zzzzzzz',
    'sing something',
    'how old are you',
  ];

  it('refuses nonsense rather than guessing', () => {
    for (const input of unreadable) {
      const result = parse(input);
      expect(result.ok, `"${input}" should not have parsed`).toBe(false);
    }
  });

  it('offers two commands it does understand', () => {
    for (const input of unreadable) {
      const result = parse(input);
      if (result.ok) continue;
      expect(result.suggestions, input).toHaveLength(2);
      for (const suggestion of result.suggestions) {
        expect(parse(suggestion).ok, `suggested "${suggestion}" does not parse`).toBe(true);
      }
    }
  });

  it('names the phrase that failed in a chain', () => {
    const result = parse('wander then sing a song then stop');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.index).toBe(2);
      expect(result.phrase).toContain('sing');
    }
  });

  it('suggests something sensible for a near miss', () => {
    expect(closestCommands('wandr')).toContain('wander');
    expect(closestCommands('stpo')).toContain('stop');
  });
});
