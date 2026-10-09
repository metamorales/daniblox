import { useState } from 'preact/hooks';
import { DEFAULTS } from '../brain/llm';
import styles from './Settings.module.css';
import {
  brainMode,
  brainStatus,
  modelSettings,
  onApplyModel,
  onForgetKey,
  settingsOpen,
} from './state';

/**
 * Where a model gets plugged in. Everything here is optional: with nothing
 * filled in, Luciana still works.
 */
export function Settings() {
  const current = modelSettings.value;
  const [provider, setProvider] = useState(current.provider);
  const [baseUrl, setBaseUrl] = useState(current.baseUrl);
  const [model, setModel] = useState(current.model);
  const [apiKey, setApiKey] = useState('');
  const [remember, setRemember] = useState(current.remember);

  const status = brainStatus.value;
  const usingModel = brainMode.value === 'model';

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
        <p class={styles.note}>
          Luciana works with nothing set up. Point her at a model and she stops needing exact
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
      </div>
    </details>
  );
}
