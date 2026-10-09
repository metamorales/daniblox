import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import styles from './Palette.module.css';
import { paletteItems, type PaletteItem, type PlayerAction } from './paletteItems';
import { onCommand, onPlayerAction, paletteOpen } from './state';

/**
 * The command palette (spec R5): Ctrl or Cmd and K opens it, Escape closes
 * it. Typed text goes down exactly the same path as the sidebar box, so the
 * two can never disagree about what a command means.
 */
export function Palette() {
  const open = paletteOpen.value;
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const restore = useRef<Element | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        paletteOpen.value = !paletteOpen.value;
      } else if (event.key === 'Escape' && paletteOpen.value) {
        // Closes wherever focus happens to be, so it can never get stuck.
        event.preventDefault();
        paletteOpen.value = false;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Before paint, so a key pressed the instant the palette appears lands in it.
  useLayoutEffect(() => {
    if (open) {
      restore.current = document.activeElement;
      setQuery('');
      setIndex(0);
      input.current?.focus();
    } else if (restore.current instanceof HTMLElement) {
      restore.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const items = paletteItems(query);
  const active = Math.min(index, items.length - 1);

  const run = (item: PaletteItem): void => {
    paletteOpen.value = false;
    if (item.kind === 'say') onCommand.value(item.value);
    else onPlayerAction.value(item.value as PlayerAction);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((active + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((active - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[active];
      if (item) run(item);
    }
  };

  return (
    <div
      class={styles.backdrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) paletteOpen.value = false;
      }}
    >
      <div
        class={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <input
          ref={input}
          id="palette-input"
          class={styles.input}
          aria-label="Type a command for Luciana, or pick one below"
          aria-controls="palette-list"
          aria-activedescendant={`palette-item-${String(active)}`}
          autocomplete="off"
          spellcheck={false}
          placeholder="tell Luciana, or pick something below"
          value={query}
          onInput={(event) => {
            setQuery((event.currentTarget as HTMLInputElement).value);
            setIndex(0);
          }}
        />
        <ul id="palette-list" class={styles.list} role="listbox" aria-label="Commands">
          {items.map((item, i) => (
            <li
              key={`${item.kind}:${item.value}`}
              id={`palette-item-${String(i)}`}
              role="option"
              aria-selected={i === active}
              class={`${styles.item} ${i === active ? styles.active : ''}`}
              onPointerDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                run(item);
              }}
            >
              <span>{item.label}</span>
              <span class={styles.hint}>{item.hint}</span>
            </li>
          ))}
        </ul>
        <p class={styles.foot}>Enter runs · arrows choose · Esc closes</p>
      </div>
    </div>
  );
}
