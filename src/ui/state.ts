/**
 * The bridge between the simulation and the interface.
 *
 * Signals only. src/world, src/render, src/folk and src/brain never import
 * anything from src/ui, so the app layer writes here and the components read.
 */

import { signal } from '@preact/signals';
import { DEFAULTS } from '../brain/llm';
import type { PlayerAction } from './paletteItems';

export interface ChatLine {
  readonly id: number;
  readonly who: 'player' | 'kit';
  readonly text: string;
  /** Which kit said it, when a kit did. */
  readonly speaker?: string;
}

export interface KitStatus {
  readonly id: string;
  readonly name: string;
  /** A short label for what she is doing, or null when she is idle. */
  readonly activity: string | null;
  readonly carrying: readonly {
    readonly block: number;
    readonly label: string;
    readonly count: number;
  }[];
}

/** Spec R8 keeps the last fifty lines. */
export const MAX_CHAT_LINES = 50;

export const chat = signal<readonly ChatLine[]>([]);
/** Every kit, in spawn order, with what she is doing and carrying. */
export const roster = signal<readonly KitStatus[]>([]);
/** Who an unaddressed command goes to. */
export const selectedKit = signal('luciana');
/** The block the player puts down by hand. */
export const placeBlock = signal(7);
export const toast = signal<string | null>(null);
/** Read out by the polite live region, for anyone not watching the canvas. */
export const announcement = signal('');
export const thinking = signal(false);

let nextId = 1;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function addLine(who: ChatLine['who'], text: string, speaker?: string): void {
  const line: ChatLine = speaker
    ? { id: nextId++, who, text, speaker }
    : { id: nextId++, who, text };
  const next = [...chat.value, line];
  chat.value = next.length > MAX_CHAT_LINES ? next.slice(next.length - MAX_CHAT_LINES) : next;
  if (who === 'kit') announcement.value = speaker ? `${speaker}: ${text}` : text;
}

export function showToast(text: string, ms = 3200): void {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
  }, ms);
}

export function announce(text: string): void {
  announcement.value = text;
}

export function clearChat(): void {
  chat.value = [];
}

/** Put saved lines back, in order, with fresh ids. */
export function restoreChat(
  lines: readonly { who: ChatLine['who']; text: string; speaker?: string }[],
): void {
  chat.value = lines.slice(-MAX_CHAT_LINES).map((line) => ({ id: nextId++, ...line }));
}

/** Remove the save and start a new meadow; settings stay. */
export const onResetWorld = signal<() => void>(() => undefined);
/** Put a share link for this world in the address bar and on the clipboard. */
export const onShareLink = signal<() => void>(() => undefined);

/**
 * Set by the app so the input can send a command without the interface
 * knowing anything about the world.
 */
export const onCommand = signal<(text: string) => void>(() => undefined);

// --- the model, if the player plugs one in ---

export interface ModelSettings {
  readonly provider: 'openai' | 'anthropic';
  readonly baseUrl: string;
  readonly model: string;
  readonly remember: boolean;
}

export interface ModelRequest extends ModelSettings {
  readonly apiKey: string;
}

export interface BrainStatusView {
  readonly used: number;
  readonly limit: number;
  readonly error: string | null;
}

export const modelSettings = signal<ModelSettings>({
  provider: 'openai',
  ...DEFAULTS.openai,
  remember: false,
});

/** Which brain answered the last turn, for the badge beside the panel. */
export const brainMode = signal<'scripted' | 'model'>('scripted');
export const brainStatus = signal<BrainStatusView | null>(null);

export const onApplyModel = signal<(settings: ModelRequest) => void>(() => undefined);
export const onForgetKey = signal<() => void>(() => undefined);

// --- the palette, the block menu, and the player's own actions ---

export const paletteOpen = signal(false);
export const settingsOpen = signal(false);

/** Things the player does directly rather than through Luciana. */
export const onPlayerAction = signal<(action: PlayerAction) => void>(() => undefined);

export interface BlockPickView {
  readonly cell: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  readonly block: number;
  readonly screen: { readonly x: number; readonly y: number };
}

export type MenuChoice = 'go' | 'mine' | 'place' | 'break-you' | 'place-you';

/** The block the player just clicked, or null when no menu is open. */
export const blockMenu = signal<BlockPickView | null>(null);
export const onBlockMenuChoice = signal<(choice: MenuChoice, pick: BlockPickView) => void>(
  () => undefined,
);

// --- preferences; applied by the app, saved from M7 on ---

export type ThemeChoice = 'system' | 'light' | 'dark';
export type MotionChoice = 'system' | 'reduced';
export type DistanceChoice = 'auto' | 'near' | 'far';

export interface Preferences {
  readonly theme: ThemeChoice;
  readonly motion: MotionChoice;
  readonly renderDistance: DistanceChoice;
  /** Spec R3: idle remarks come from the templates unless this is on. */
  readonly ambientModel: boolean;
}

export const preferences = signal<Preferences>({
  theme: 'system',
  motion: 'system',
  renderDistance: 'auto',
  ambientModel: false,
});

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  preferences.value = { ...preferences.value, [key]: value };
}

/** Numbers for the Advanced panel. Null until the panel has been opened. */
export interface PerfView {
  readonly frameP50: number;
  readonly frameP95: number;
  readonly frameMax: number;
  readonly drawCalls: number;
  readonly visibleChunks: number;
  readonly pathNodesPerFrame: number;
}

export const perfView = signal<PerfView | null>(null);

/** Show the three-step welcome again, from the settings panel. */
export const onReplayOnboarding = signal<() => void>(() => undefined);

/** Which welcome step is up: 1 to 3, or 0 when it is closed. */
export const onboarding = signal(0);
/** Finished or skipped; the app remembers so it does not show again. */
export const onOnboardingDone = signal<() => void>(() => undefined);

/** On a phone the panel is a sheet along the bottom; this is whether it is up. */
export const sheetOpen = signal(false);

const THEME_ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export function cycleTheme(): ThemeChoice {
  const at = THEME_ORDER.indexOf(preferences.value.theme);
  const next = THEME_ORDER[(at + 1) % THEME_ORDER.length] ?? 'system';
  setPreference('theme', next);
  return next;
}
