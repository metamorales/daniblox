import { useSignalEffect } from '@preact/signals';
import { useCallback, useRef, useState } from 'preact/hooks';
import styles from './Sidebar.module.css';
import { chat, kitStatus, onCommand, thinking } from './state';

/**
 * Luciana's panel: who she is, what she is doing, what she has said, and the
 * box you talk to her through. M6 restyles this; here it only has to work and
 * be reachable from the keyboard.
 */
export function Sidebar() {
  const [draft, setDraft] = useState('');
  const thread = useRef<HTMLUListElement>(null);

  useSignalEffect(() => {
    // Touch the signal so the effect re-runs, then stick to the newest line.
    void chat.value.length;
    const element = thread.current;
    if (element) element.scrollTop = element.scrollHeight;
  });

  const submit = useCallback(
    (event: Event) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;
      setDraft('');
      onCommand.value(text);
    },
    [draft],
  );

  const status = kitStatus.value;
  const lines = chat.value;

  return (
    <aside class={styles.sidebar} aria-label="Luciana">
      <div class={styles.card}>
        <span class={styles.name}>{status?.name ?? 'Luciana'}</span>
        <span class={styles.activity}>{status?.activity ?? 'waiting'}</span>
        {status && status.carrying.length > 0 && (
          <span class={styles.carrying}>
            {status.carrying.map((item) => `${String(item.count)} ${item.label}`).join(', ')}
          </span>
        )}
      </div>

      <ul class={styles.thread} ref={thread}>
        {lines.length === 0 && (
          <li class={styles.empty}>Say hello, or tell her to do something.</li>
        )}
        {lines.map((line) => (
          <li
            key={line.id}
            class={`${styles.line} ${line.who === 'player' ? styles.fromPlayer : styles.fromKit}`}
          >
            {line.text}
          </li>
        ))}
      </ul>

      <form class={styles.form} onSubmit={submit}>
        <label class="visually-hidden" for="command">
          Tell Luciana what to do
        </label>
        <input
          id="command"
          class={styles.input}
          value={draft}
          placeholder="plant a forest here"
          autocomplete="off"
          onInput={(event) => {
            setDraft((event.currentTarget as HTMLInputElement).value);
          }}
        />
        <button class={styles.send} type="submit" disabled={thinking.value}>
          Say
        </button>
      </form>
      <p class={styles.hint}>Try: gather three bark · raise a hill here · make it night · wander</p>
    </aside>
  );
}
