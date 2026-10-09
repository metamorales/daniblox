/**
 * The personality cards: one per kit, written by hand (spec: original names,
 * two bio lines, a mood, three quirks, two catchphrases). Everything that
 * gives a kit a voice or a look reads from here, so adding a cat is a JSON
 * file and a spawn point.
 */

import luciana from './luciana.json';
import xochi from './xochi.json';

export interface Card {
  readonly id: string;
  readonly name: string;
  readonly species: string;
  readonly bio: readonly string[];
  readonly mood: string;
  readonly quirks: readonly string[];
  readonly catchphrases: readonly string[];
  readonly voice: {
    readonly register: string;
    readonly avoid: readonly string[];
    readonly likes: readonly string[];
  };
  readonly appearance: {
    readonly coat: string;
    readonly patch: string;
    readonly accent?: string;
    readonly pattern?: 'tuxedo' | 'calico';
    readonly description: string;
  };
}

export const CARDS: readonly Card[] = [luciana as unknown as Card, xochi as unknown as Card];

/** The card for a kit, or Luciana's for an id nobody knows. */
export function cardFor(id: string | undefined): Card {
  return CARDS.find((card) => card.id === id) ?? (luciana as unknown as Card);
}
