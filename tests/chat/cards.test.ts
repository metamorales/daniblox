import { describe, expect, it } from 'vitest';
import { CARDS, cardFor } from '../../src/chat/cards';
import { CARD, acknowledge, answerAbout, exchange } from '../../src/chat/dialogue';

const situation = {
  activity: null,
  cell: { x: 1, y: 1, z: 1 },
  standingOn: 'clover',
  carrying: [],
  dayPhase: 0.3,
};

describe('the cards', () => {
  it('are two complete, distinct cats', () => {
    expect(CARDS.map((c) => c.id)).toEqual(['luciana', 'xochi']);
    expect(new Set(CARDS.map((c) => c.name)).size).toBe(2);
    for (const card of CARDS) {
      expect(card.bio).toHaveLength(2);
      expect(card.quirks).toHaveLength(3);
      expect(card.catchphrases).toHaveLength(2);
      expect(card.mood.length).toBeGreaterThan(0);
      expect(card.appearance.coat).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(cardFor('xochi').appearance.pattern).toBe('calico');
    expect(cardFor('nobody')).toBe(CARD);
  });

  it('give each cat her own answer to who she is', () => {
    const luciana = answerAbout('who are you?', situation, cardFor('luciana')) ?? '';
    const xochi = answerAbout('who are you?', situation, cardFor('xochi')) ?? '';
    expect(luciana).toContain('Luciana');
    expect(xochi).toContain('Xochi');
    expect(xochi).not.toContain('Luciana');
  });

  it('let each cat take an order in her own words', () => {
    const lines = new Set<string>();
    for (let i = 0; i < 20; i++)
      lines.add(acknowledge('sculpt', `seed${String(i)}`, cardFor('xochi')));
    expect([...lines].some((line) => line === cardFor('xochi').catchphrases[0])).toBe(true);
  });

  it('overhear two lines when both are idle, the second answering the first', () => {
    const [first, second] = exchange(cardFor('luciana'), cardFor('xochi'), situation, 'seed');
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(first).not.toBe(second);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      seen.add(exchange(cardFor('xochi'), cardFor('luciana'), situation, `s${String(i)}`)[0]);
    }
    expect(seen.size).toBeGreaterThan(2);
  });
});
