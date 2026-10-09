import { describe, expect, it } from 'vitest';
import {
  CARD,
  acknowledge,
  answerAbout,
  idleRemark,
  puzzled,
  timeOfDay,
  type Situation,
} from '../../src/chat/dialogue';

const base: Situation = {
  activity: null,
  cell: { x: 32, y: 14, z: 32 },
  standingOn: 'clover',
  carrying: [],
  dayPhase: 0.3,
};

const sentences = (text: string): number =>
  text.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;

describe('her card', () => {
  it('has everything the spec asks a personality card for', () => {
    expect(CARD.name).toBe('Luciana');
    expect(CARD.bio).toHaveLength(2);
    expect(CARD.quirks).toHaveLength(3);
    expect(CARD.catchphrases).toHaveLength(2);
    expect(CARD.mood.length).toBeGreaterThan(0);
  });
});

describe('answering about herself', () => {
  it('says who she is', () => {
    const reply = answerAbout('who are you', base);
    expect(reply).toBeTruthy();
    expect(reply).toContain('Luciana');
  });

  it('says what she is doing, and it matches what she is doing', () => {
    for (const [activity, word] of [
      ['mining', 'digging'],
      ['wandering', 'wandering'],
      ['following', 'following'],
      [null, 'standing'],
    ] as [string | null, string][]) {
      const reply = answerAbout('what are you doing', { ...base, activity });
      expect(reply?.toLowerCase(), String(activity)).toContain(word);
    }
  });

  it('says where she is, with real coordinates', () => {
    const reply = answerAbout('where are you', { ...base, cell: { x: 7, y: 3, z: 19 } });
    expect(reply).toContain('7');
    expect(reply).toContain('19');
  });

  it('says what she is carrying, and notices when it is nothing', () => {
    expect(answerAbout('what are you carrying', base)?.toLowerCase()).toContain('nothing');
    const loaded = answerAbout('what have you got', {
      ...base,
      carrying: [
        { label: 'bark', count: 3 },
        { label: 'gem', count: 1 },
      ],
    });
    expect(loaded).toContain('3 bark');
    expect(loaded).toContain('1 gem');
  });

  it('tells the time, and it changes with the clock', () => {
    const morning = answerAbout('what time is it', { ...base, dayPhase: 0.3 });
    const night = answerAbout('what time is it', { ...base, dayPhase: 0.8 });
    expect(morning).not.toBe(night);
    expect(night?.toLowerCase()).toContain('night');
  });

  it('knows the four parts of the day apart', () => {
    expect(timeOfDay(0.02)).toBe('dawn');
    expect(timeOfDay(0.3)).toContain('day');
    expect(timeOfDay(0.52)).toBe('dusk');
    expect(timeOfDay(0.8)).toContain('night');
  });

  it('says nothing to something that is not about her', () => {
    expect(answerAbout('raise a hill', base)).toBeNull();
    expect(answerAbout('zzzz', base)).toBeNull();
  });
});

describe('her voice', () => {
  it('keeps an acknowledgement to two sentences', () => {
    for (const kind of [
      'goto',
      'mine',
      'place',
      'follow',
      'wander',
      'stop',
      'sculpt',
      'paint',
      'plant',
      'scatter',
      'clear',
      'settime',
    ]) {
      for (const seed of ['a', 'bb', 'ccc', 'dddd']) {
        const line = acknowledge(kind, seed);
        expect(sentences(line), `${kind}/${seed}: "${line}"`).toBeLessThanOrEqual(2);
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });

  it('says the same thing twice for the same input', () => {
    expect(acknowledge('mine', 'gather three bark')).toBe(acknowledge('mine', 'gather three bark'));
    expect(answerAbout('who are you', base)).toBe(answerAbout('who are you', base));
  });

  it('does not say the same thing for every input', () => {
    const replies = new Set(
      ['one', 'two', 'three', 'four', 'five', 'six'].map((seed) => acknowledge('sculpt', seed)),
    );
    expect(replies.size).toBeGreaterThan(1);
  });

  it('uses her own catchphrases', () => {
    const lines = new Set(
      Array.from({ length: 40 }, (_, i) => acknowledge('sculpt', `seed-${String(i)}`)),
    );
    expect([...lines].some((line) => line === CARD.catchphrases[0])).toBe(true);
  });

  it('grounds an idle remark in where she is and what she holds', () => {
    const remarks = new Set(
      Array.from({ length: 40 }, (_, i) =>
        idleRemark({ ...base, carrying: [{ label: 'bark', count: 2 }] }, `idle-${String(i)}`),
      ),
    );
    expect(remarks.size).toBeGreaterThan(2);
    expect([...remarks].some((line) => line.includes('2 bark'))).toBe(true);
  });

  it('offers two suggestions when it has them', () => {
    const line = puzzled(['wander', 'stop'], 'nonsense');
    expect(line).toContain('wander');
    expect(line).toContain('stop');
    expect(puzzled([], 'nonsense')).not.toContain('Try');
  });
});
