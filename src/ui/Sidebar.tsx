import { useSignalEffect } from '@preact/signals';
import { useCallback, useRef, useState } from 'preact/hooks';
import { BLOCKS } from '../world/blocks';
import styles from './Sidebar.module.css';
import { chat, onCommand, placeBlock, roster, selectedKit, thinking } from './state';

/**
 * The kits' panel: a card for each cat with what she is doing and carrying,
 * the shared chat thread, the box you talk through, and the block you put
 * down by hand. Clicking a card, or the arrow keys over the roster, picks
 * who an unaddressed command goes to; a name at the start of a line always
 * wins.
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

  const kits = roster.value;
  const selected = kits.find((kit) => kit.id === selectedKit.value) ?? kits[0];
  const lines = chat.value;
  const several = kits.length > 1;

  const onRosterKey = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const at = kits.findIndex((kit) => kit.id === selectedKit.value);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = kits[(at + step + kits.length) % kits.length];
    if (next) {
      selectedKit.value = next.id;
      (event.currentTarget as HTMLElement)
        .querySelector<HTMLButtonElement>(`[data-kit="${next.id}"]`)
        ?.focus();
    }
  };

  return (
    <aside class={styles.sidebar} aria-label="The kits">
      <div class={styles.roster} role="group" aria-label="Kits" onKeyDown={onRosterKey}>
        {kits.map((kit) => (
          <button
            key={kit.id}
            type="button"
            data-kit={kit.id}
            class={`${styles.card} ${kit.id === selected?.id ? styles.cardSelected : ''}`}
            aria-pressed={kit.id === selected?.id}
            onClick={() => {
              selectedKit.value = kit.id;
            }}
          >
            <span class={styles.name}>{kit.name}</span>
            <span class={styles.activity}>{kit.activity ?? 'waiting'}</span>
            <span class={styles.pockets} aria-label={`${kit.name} carries`}>
              {kit.carrying.length === 0 && <span class={styles.empty}>pockets empty</span>}
              {kit.carrying.map((item) => (
                <span key={item.block} class={styles.pocket}>
                  <span
                    class={styles.swatch}
                    style={{ background: BLOCKS.find((b) => b.id === item.block)?.colour }}
                    aria-hidden="true"
                  />
                  {String(item.count)} {item.label}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>

      <ul class={styles.thread} ref={thread}>
        {lines.length === 0 && (
          <li class={styles.empty}>Say hello, or tell them to do something.</li>
        )}
        {lines.map((line) => (
          <li
            key={line.id}
            data-line={line.who}
            class={`${styles.line} ${line.who === 'player' ? styles.fromPlayer : styles.fromKit}`}
          >
            {line.speaker && several && <b class={styles.speaker}>{line.speaker} </b>}
            {line.text}
          </li>
        ))}
      </ul>

      <form class={styles.form} onSubmit={submit}>
        <label class="visually-hidden" for="command">
          Tell {selected?.name ?? 'the kits'} what to do
        </label>
        <input
          id="command"
          class={styles.input}
          value={draft}
          placeholder={`tell ${selected?.name ?? 'them'}: plant a forest here`}
          autocomplete="off"
          onInput={(event) => {
            setDraft((event.currentTarget as HTMLInputElement).value);
          }}
        />
        <button class={styles.send} type="submit" disabled={thinking.value}>
          Say
        </button>
      </form>
      <p class={styles.hint}>
        Try: gather three bark · build a cat tower here · make it night · Xochi, follow me
      </p>

      <div class={styles.chooser} role="group" aria-label="The block you place by hand">
        <span class={styles.chooserLabel}>You place</span>
        {BLOCKS.map((block) => (
          <button
            key={block.id}
            type="button"
            class={`${styles.choice} ${placeBlock.value === block.id ? styles.choiceSelected : ''}`}
            style={{ '--swatch': block.colour }}
            aria-label={`Place ${block.label}`}
            aria-pressed={placeBlock.value === block.id}
            title={block.label}
            onClick={() => {
              placeBlock.value = block.id;
            }}
          />
        ))}
      </div>
    </aside>
  );
}
