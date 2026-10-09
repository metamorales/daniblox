/**
 * The bridge between the simulation and the interface.
 *
 * Signals only. src/world, src/render, src/folk and src/brain never import
 * anything from src/ui, so the app layer writes here and the components read.
 */

import { signal } from '@preact/signals';
import { DEFAULTS } from '../brain/llm';

export interface ChatLine {
  readonly id: number;
  readonly who: 'player' | 'kit';
  readonly text: string;
}

export interface KitStatus {
  readonly name: string;
  /** A short label for what she is doing, or null when she is idle. */
  readonly activity: string | null;
  readonly carrying: readonly { readonly label: string; readonly count: number }[];
}

/** Spec R8 keeps the last fifty lines. */
export const MAX_CHAT_LINES = 50;

export const chat = signal<readonly ChatLine[]>([]);
export const kitStatus = signal<KitStatus | null>(null);
export const toast = signal<string | null>(null);
/** Read out by the polite live region, for anyone not watching the canvas. */
export const announcement = signal('');
export const thinking = signal(false);

let nextId = 1;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function addLine(who: ChatLine['who'], text: string): void {
  const line = { id: nextId++, who, text };
  const next = [...chat.value, line];
  chat.value = next.length > MAX_CHAT_LINES ? next.slice(next.length - MAX_CHAT_LINES) : next;
  if (who === 'kit') announcement.value = text;
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
