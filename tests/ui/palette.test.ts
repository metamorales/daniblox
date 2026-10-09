import { describe, expect, it } from 'vitest';
import { EXAMPLES, PLAYER_ITEMS, paletteItems } from '../../src/ui/paletteItems';

describe('the command palette', () => {
  it('offers every example and every player action when nothing is typed', () => {
    const items = paletteItems('');
    for (const text of EXAMPLES) expect(items.map((i) => i.label)).toContain(text);
    for (const item of PLAYER_ITEMS) expect(items).toContainEqual(item);
  });

  it('puts what the player typed first, so Enter sends their own words', () => {
    const items = paletteItems('raise a mountain');
    expect(items[0]).toMatchObject({ kind: 'say', value: 'raise a mountain' });
  });

  it('narrows to matching entries, without repeating an exact match', () => {
    const items = paletteItems('hill');
    expect(items.slice(1).map((i) => i.label)).toEqual(['raise a hill here']);

    const exact = paletteItems('Wander');
    expect(exact.filter((i) => i.label === 'wander')).toHaveLength(1);
    expect(exact[0]?.value).toBe('wander');
  });

  it('finds a player action by a word in it', () => {
    const items = paletteItems('focus');
    expect(items.some((i) => i.kind === 'player' && i.value === 'focus-kit')).toBe(true);
  });
});
