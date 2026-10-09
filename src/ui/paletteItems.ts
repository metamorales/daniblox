/**
 * What the command palette offers.
 *
 * Pure and testable: given what the player has typed so far, the list of
 * things they can pick, with whatever they typed always first so that Enter
 * does what they wrote rather than what the palette guessed.
 */

export type PaletteKind = 'say' | 'player';

export interface PaletteItem {
  readonly label: string;
  /** A few words on who acts and where. */
  readonly hint: string;
  readonly kind: PaletteKind;
  /** The command text to send, or the player action to perform. */
  readonly value: string;
}

export type PlayerAction =
  'break-here' | 'place-here' | 'focus-kit' | 'open-settings' | 'cycle-theme';

/** Things the player does directly, with no kit involved. */
export const PLAYER_ITEMS: readonly PaletteItem[] = [
  {
    label: 'Break the block here',
    hint: 'you, at the reticle',
    kind: 'player',
    value: 'break-here',
  },
  {
    label: 'Place your block here',
    hint: 'you, at the reticle',
    kind: 'player',
    value: 'place-here',
  },
  {
    label: 'Focus the selected cat',
    hint: 'bring the camera to her, also F',
    kind: 'player',
    value: 'focus-kit',
  },
  { label: 'Open settings', hint: 'model, look, motion', kind: 'player', value: 'open-settings' },
  {
    label: 'Switch theme',
    hint: 'light, dark, or follow the system',
    kind: 'player',
    value: 'cycle-theme',
  },
];

/** One example of each thing Luciana can be asked for. */
export const EXAMPLES: readonly string[] = [
  'raise a hill here',
  'flatten this',
  'plant a forest here',
  'paint this gem',
  'scatter gems here',
  'clear this',
  'build a cat tower here',
  'build a little house here',
  'build a litter box here',
  'make it night',
  'gather three bark',
  'go here',
  'follow me',
  'Xochi, follow Luciana',
  'wander',
  'stop',
];

export function paletteItems(query: string): PaletteItem[] {
  const typed = query.trim();
  const needle = typed.toLowerCase();
  const examples = EXAMPLES.map((text): PaletteItem => ({
    label: text,
    hint: 'tell the cats',
    kind: 'say',
    value: text,
  }));
  const all = [...examples, ...PLAYER_ITEMS];
  if (!needle) return all;

  const matches = all.filter(
    (item) => item.label.toLowerCase().includes(needle) && item.label.toLowerCase() !== needle,
  );
  const exact = all.find((item) => item.label.toLowerCase() === needle);
  const head: PaletteItem = exact ?? {
    label: typed,
    hint: 'send to the cats',
    kind: 'say',
    value: typed,
  };
  return [head, ...matches];
}
