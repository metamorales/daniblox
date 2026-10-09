/**
 * The model-backed brain (spec R3).
 *
 * An upgrade on the scripted brain, never a replacement. Everything degrades
 * to the scripted brain: a malformed reply, a provider that will not answer, a
 * request cap, a timeout. The game never stops working because a model did.
 *
 * The browser talks to the endpoint directly. There is no server of ours in
 * the middle, so the key goes only to the address the player typed, and lives
 * in memory unless they explicitly ask otherwise.
 */

import type { Brain, BrainRequest } from './brain';
import { buildSystemPrompt, recentTurns, wrapPlayerMessage, type PromptSituation } from './prompt';
import { RateLimiter } from './rateLimiter';
import type { ScriptedBrain } from './scripted';
import { type BrainOutput, validate } from './schema';

export const TIMEOUT_MS = 10_000;
export const TEMPERATURE = 0.7;
export const MAX_TOKENS = 200;
/** After two transport failures in a row, stop trying for a while. */
export const BREAKER_FAILURES = 2;
export const BREAKER_COOLDOWN_MS = 60_000;

export type Provider = 'openai' | 'anthropic';

export interface LlmSettings {
  readonly provider: Provider;
  /** Editable, so a local server or a gateway works as well as a hosted one. */
  readonly baseUrl: string;
  readonly model: string;
  /** Empty is fine for a local server that wants no key. */
  readonly apiKey: string;
}

export type FallbackReason =
  | 'invalid-twice'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'unauthorised'
  | 'server-error'
  | 'breaker-open'
  | 'no-settings';

export interface BrainStatus {
  /** Which brain actually answered the last turn. */
  readonly mode: 'model' | 'fallback';
  readonly reason: FallbackReason | null;
  /** Shown beside the input, so the cap is never a surprise. */
  readonly used: number;
  readonly limit: number;
  /** A plain sentence for the settings panel, or null when all is well. */
  readonly error: string | null;
}

export interface LlmEvents {
  onStatus?(status: BrainStatus): void;
}

/** Sensible starting points. A local server needs no key and costs nothing. */
export const DEFAULTS: Record<Provider, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-4-5-20251001' },
};

const EXPLAIN: Record<FallbackReason, string> = {
  'invalid-twice': 'The model replied with something the game could not read, twice.',
  'rate-limited': 'That is ten messages in a minute. Luciana needs a breather.',
  timeout: 'The model took more than ten seconds, so the question was dropped.',
  network:
    'The game could not reach that address. Check the base URL, and that the server allows this page to call it.',
  unauthorised: 'That key was refused. Check it, or clear it to use a local server.',
  'server-error': 'The model endpoint returned an error.',
  'breaker-open': 'Two failures in a row, so the model is being left alone for a minute.',
  'no-settings': 'No model is set up yet.',
};

interface Attempt {
  readonly text: string | null;
  readonly failure: FallbackReason | null;
}

export class LlmBrain implements Brain {
  readonly name = 'model';
  private readonly limiter: RateLimiter;
  private consecutiveFailures = 0;
  private breakerUntil = 0;
  private lastStatus: BrainStatus;

  constructor(
    private settings: LlmSettings,
    private readonly fallback: ScriptedBrain,
    private readonly events: LlmEvents = {},
    private readonly now: () => number = () => Date.now(),
    limiter?: RateLimiter,
  ) {
    this.limiter = limiter ?? new RateLimiter(10, now);
    this.lastStatus = { mode: 'model', reason: null, used: 0, limit: 10, error: null };
  }

  get status(): BrainStatus {
    return this.lastStatus;
  }

  update(settings: LlmSettings): void {
    this.settings = settings;
    // New settings deserve a fresh try.
    this.consecutiveFailures = 0;
    this.breakerUntil = 0;
  }

  async respond(request: BrainRequest & { situation?: PromptSituation }): Promise<BrainOutput> {
    if (!this.settings.model || !this.settings.baseUrl) {
      return this.giveUp(request, 'no-settings');
    }
    if (this.now() < this.breakerUntil) return this.giveUp(request, 'breaker-open');
    if (!this.limiter.take()) return this.breather(request);

    const situation = request.situation ?? fallbackSituation(request);
    const system = buildSystemPrompt(situation);
    const turns = recentTurns(request.history);

    const first = await this.ask(system, turns, wrapPlayerMessage(request.text));
    if (first.failure) return this.transportFailure(request, first.failure);

    const checked = validate(first.text ?? '');
    if (checked.ok) return this.succeed(checked.value);

    // One retry, with the complaint attached so the model can correct itself.
    const correction = `${wrapPlayerMessage(request.text)}\n\nYour last reply was rejected: ${checked.error}. Reply with JSON only, matching the shape exactly.`;
    const second = await this.ask(system, turns, correction);
    if (second.failure) return this.transportFailure(request, second.failure);

    const recheck = validate(second.text ?? '');
    if (recheck.ok) return this.succeed(recheck.value);

    return this.giveUp(request, 'invalid-twice');
  }

  private async ask(
    system: string,
    turns: readonly { who: string; text: string }[],
    userMessage: string,
  ): Promise<Attempt> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    try {
      const response =
        this.settings.provider === 'anthropic'
          ? await this.askAnthropic(system, turns, userMessage, controller.signal)
          : await this.askOpenAiCompatible(system, turns, userMessage, controller.signal);
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { text: null, failure: 'timeout' };
      }
      // A blocked cross-origin request and an unreachable host look the same
      // from here; the message names both so the player can check either.
      return { text: null, failure: 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async askOpenAiCompatible(
    system: string,
    turns: readonly { who: string; text: string }[],
    userMessage: string,
    signal: AbortSignal,
  ): Promise<Attempt> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.settings.apiKey) headers.Authorization = `Bearer ${this.settings.apiKey}`;

    const response = await fetch(`${trimSlash(this.settings.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: this.settings.model,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          ...turns.map((turn) => ({
            role: turn.who === 'kit' ? 'assistant' : 'user',
            content: turn.text,
          })),
          { role: 'user', content: userMessage },
        ],
      }),
    });

    const failure = statusFailure(response.status);
    if (failure) return { text: null, failure };

    const body: unknown = await response.json();
    const text = readPath(body, ['choices', '0', 'message', 'content']);
    return { text, failure: text === null ? 'server-error' : null };
  }

  private async askAnthropic(
    system: string,
    turns: readonly { who: string; text: string }[],
    userMessage: string,
    signal: AbortSignal,
  ): Promise<Attempt> {
    const response = await fetch(`${trimSlash(this.settings.baseUrl)}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.apiKey,
        'anthropic-version': '2023-06-01',
        // Required for a browser to call the API directly.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
      body: JSON.stringify({
        model: this.settings.model,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages: [
          ...turns.map((turn) => ({
            role: turn.who === 'kit' ? 'assistant' : 'user',
            content: turn.text,
          })),
          { role: 'user', content: userMessage },
        ],
      }),
    });

    const failure = statusFailure(response.status);
    if (failure) return { text: null, failure };

    const body: unknown = await response.json();
    const text = readPath(body, ['content', '0', 'text']);
    return { text, failure: text === null ? 'server-error' : null };
  }

  private succeed(output: BrainOutput): BrainOutput {
    this.consecutiveFailures = 0;
    this.report({ mode: 'model', reason: null, error: null });
    return output;
  }

  /** A transport problem skips the retry: it would only wait another ten seconds. */
  private transportFailure(request: BrainRequest, reason: FallbackReason): BrainOutput {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= BREAKER_FAILURES) {
      this.breakerUntil = this.now() + BREAKER_COOLDOWN_MS;
    }
    return this.giveUp(request, reason);
  }

  private breather(request: BrainRequest): BrainOutput {
    const wait = this.limiter.waitSeconds;
    this.report({ mode: 'fallback', reason: 'rate-limited', error: EXPLAIN['rate-limited'] });
    const scripted = this.fallback.reply(request);
    return {
      ...scripted,
      say: `Give me ${String(Math.max(wait, 1))} seconds, I am out of breath.`,
    };
  }

  private giveUp(request: BrainRequest, reason: FallbackReason): BrainOutput {
    this.report({ mode: 'fallback', reason, error: EXPLAIN[reason] });
    return this.fallback.reply(request);
  }

  private report(partial: Pick<BrainStatus, 'mode' | 'reason' | 'error'>): void {
    this.lastStatus = {
      ...partial,
      used: this.limiter.used,
      limit: 10,
    };
    this.events.onStatus?.(this.lastStatus);
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function statusFailure(status: number): FallbackReason | null {
  if (status === 401 || status === 403) return 'unauthorised';
  if (status === 429) return 'rate-limited';
  if (status >= 400) return 'server-error';
  return null;
}

/** Read a nested string without trusting the shape of the response. */
function readPath(value: unknown, path: readonly string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (Array.isArray(current)) current = current[Number(key)];
    else if (current && typeof current === 'object')
      current = (current as Record<string, unknown>)[key];
    else return null;
  }
  return typeof current === 'string' ? current : null;
}

/** When the caller gave no snapshot, say as little as possible rather than guessing. */
function fallbackSituation(request: BrainRequest): PromptSituation {
  return {
    cell: request.folk.cell,
    standingOn: null,
    dayPhase: request.world.dayPhase,
    activity: request.folk.activity,
    queued: [],
    carrying: [],
    nearby: [],
    otherKits: [],
    reticle: request.world.reticle,
    pointingAt: request.world.focus ?? null,
  };
}
