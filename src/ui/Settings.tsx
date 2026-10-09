import { useState } from 'preact/hooks';
import { DEFAULTS } from '../brain/llm';
import styles from './Settings.module.css';
import {
  brainMode,
  brainStatus,
  modelSettings,
  onApplyModel,
  onForgetKey,
  onReplayOnboarding,
  onResetWorld,
  onShareLink,
  perfView,
  preferences,
  setPreference,
  settingsOpen,
  type DistanceChoice,
  type ThemeChoice,
} from './state';

/**
 * Everything optional lives here: how the game looks and moves, how far it
 * draws, which model is behind Luciana if any, and the numbers under
 * Advanced. With nothing touched, Luciana still works.
 */
export function Settings() {
  const current = modelSettings.value;
  const [provider, setProvider] = useState(current.provider);
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [model, setModel] = useState(current.model);
  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(current.remember);
  const [confirmReset, setConfirmReset] = useState(false);

  const status = brainStatus.value;
  const usingModel = brainMode.value === 'model';
  const prefs = preferences.value;
  const perf = perfView.value;

  return (
    <details
      class={styles.panel}
      open={settingsOpen.value}
      onToggle={(event) => {
        settingsOpen.value = (event.currentTarget as HTMLDetailsElement).open;
      }}
    >
      <summary class={styles.summary}>
        Settings
        <span class={`${styles.badge} ${usingModel ? styles.badgeModel : ''}`}>
          {usingModel ? 'model' : 'scripted'}
        </span>
      </summary>

      <div class={styles.body}>
        <h2 class={styles.heading}>Look and feel</h2>

        <label class={styles.field}>
          Theme
          <select
            id="pref-theme"
            value={prefs.theme}
            onChange={(event) => {
              setPreference(
                'theme',
                (event.currentTarget as HTMLSelectElement).value as ThemeChoice,
              );
            }}
          >
            <option value="system">Follow the system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label class={styles.check}>
          <input
            id="pref-motion"
            type="checkbox"
            checked={prefs.motion === 'reduced'}
            onChange={(event) => {
              setPreference(
                'motion',
                (event.currentTarget as HTMLInputElement).checked ? 'reduced' : 'system',
              );
            }}
          />
          Reduce motion: no camera easing, no bobbing
        </label>

        <label class={styles.field}>
          Render distance
          <select
            id="pref-distance"
            value={prefs.renderDistance}
            onChange={(event) => {
              setPreference(
                'renderDistance',
                (event.currentTarget as HTMLSelectElement).value as DistanceChoice,
              );
            }}
          >
            <option value="auto">Automatic: near on phones</option>
            <option value="near">Near</option>
            <option value="far">Far, the whole meadow</option>
          </select>
        </label>

        <h2 class={styles.heading}>Their brain</h2>

        <p class={styles.note}>
          The cats work with nothing set up. Point them at a model and they stop needing exact
          wording. A model running on your own machine needs no key and costs nothing.
        </p>

        <label class={styles.field}>
          Provider
          <select
            value={provider}
            onChange={(event) => {
              const next = (event.currentTarget as HTMLSelectElement).value as
                'openai' | 'anthropic';
              setProvider(next);
              setBaseUrl(DEFAULTS[next].baseUrl);
              setModel(DEFAULTS[next].model);
            }}
          >
            <option value="openai">On this machine, or any OpenAI-compatible server</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>

        <label class={styles.field}>
          Address
          <input
            value={baseUrl}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => {
              setBaseUrl((event.currentTarget as HTMLInputElement).value);
            }}
          />
        </label>

        <label class={styles.field}>
          Model
          <input
            value={model}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => {
              setModel((event.currentTarget as HTMLInputElement).value);
            }}
          />
        </label>

        <label class={styles.field}>
          Key, if the server wants one
          <input
            type="password"
            value={apiKey}
            autocomplete="off"
            placeholder="leave empty for a local model"
            onInput={(event) => {
              setApiKey((event.currentTarget as HTMLInputElement).value);
            }}
          />
        </label>

        <label class={styles.check}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => {
              setRemember((event.currentTarget as HTMLInputElement).checked);
            }}
          />
          Keep the key until I close this tab
        </label>

        <p class={styles.note}>
          The key goes only to the address above, straight from your browser. It is never saved to
          disk, never written into a shared link, and never logged.
        </p>

        <label class={styles.check}>
          <input
            id="pref-ambient"
            type="checkbox"
            checked={prefs.ambientModel}
            onChange={(event) => {
              setPreference('ambientModel', (event.currentTarget as HTMLInputElement).checked);
            }}
          />
          Let the model do their idle remarks too
        </label>

        {status?.error && <p class={styles.error}>{status.error}</p>}

        <div class={styles.row}>
          <button
            type="button"
            onClick={() => {
              onApplyModel.value({ provider, baseUrl, model, apiKey, remember });
            }}
          >
            Use this model
          </button>
          <button
            type="button"
            class={styles.secondary}
            onClick={() => {
              setApiKey('');
              onForgetKey.value();
            }}
          >
            Back to scripted
          </button>
        </div>

        {usingModel && status && (
          <p class={styles.counter}>
            {String(status.used)} of {String(status.limit)} messages used this minute
          </p>
        )}

        <h2 class={styles.heading}>This world</h2>

        <div class={styles.row}>
          <button
            type="button"
            class={styles.secondary}
            onClick={() => {
              onShareLink.value();
            }}
          >
            Copy share link
          </button>
          {!confirmReset && (
            <button
              type="button"
              class={styles.secondary}
              onClick={() => {
                setConfirmReset(true);
              }}
            >
              Reset the world
            </button>
          )}
        </div>
        {confirmReset && (
          <div class={styles.confirm} role="group" aria-label="Confirm the reset">
            <p class={styles.note}>Everything built here goes, and a new meadow takes its place.</p>
            <div class={styles.row}>
              <button
                type="button"
                onClick={() => {
                  setConfirmReset(false);
                  onResetWorld.value();
                }}
              >
                Yes, reset it
              </button>
              <button
                type="button"
                class={styles.secondary}
                onClick={() => {
                  setConfirmReset(false);
                }}
              >
                Keep it
              </button>
            </div>
          </div>
        )}

        <h2 class={styles.heading}>Help</h2>

        <div class={styles.row}>
          <button
            type="button"
            class={styles.secondary}
            onClick={() => {
              onReplayOnboarding.value();
            }}
          >
            Show the welcome again
          </button>
        </div>

        <details class={styles.advanced}>
          <summary class={styles.advancedSummary}>Advanced</summary>
          {perf ? (
            <dl class={styles.perf} aria-label="Performance">
              <dt>frame time</dt>
              <dd>
                {perf.frameP50.toFixed(1)} ms typical · {perf.frameP95.toFixed(1)} ms p95 ·{' '}
                {perf.frameMax.toFixed(1)} ms worst
              </dd>
              <dt>draw calls</dt>
              <dd>
                {String(perf.drawCalls)} for {String(perf.visibleChunks)} visible chunks
              </dd>
              <dt>path nodes per frame</dt>
              <dd>{perf.pathNodesPerFrame.toFixed(1)}</dd>
            </dl>
          ) : (
            <p class={styles.note}>Numbers appear here a moment after the panel opens.</p>
          )}
        </details>
      </div>
    </details>
  );
}
