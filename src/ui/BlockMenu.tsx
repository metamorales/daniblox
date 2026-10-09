import { useLayoutEffect, useRef } from 'preact/hooks';
import { blockById } from '../world/blocks';
import styles from './BlockMenu.module.css';
import {
  blockMenu,
  onBlockMenuChoice,
  placeBlock,
  roster,
  selectedKit,
  type MenuChoice,
} from './state';

/**
 * Click-to-direct (spec R5). A click or a long press on a block opens this:
 * three things Luciana can do with the block, and two the player can do
 * themselves. It is a real menu, so the arrow keys walk it and Escape closes.
 */

function items(
  kitName: string,
  blockLabel: string,
): readonly { readonly choice: MenuChoice; readonly label: string }[] {
  return [
    { choice: 'go', label: `${kitName}: go here` },
    { choice: 'mine', label: `${kitName}: mine this` },
    { choice: 'place', label: `${kitName}: place ${blockLabel} here` },
    { choice: 'break-you', label: 'Break it yourself' },
    { choice: 'place-you', label: `Put ${blockLabel} here yourself` },
  ];
}

const WIDTH = 240;
const HEIGHT = 300;

export function BlockMenu() {
  const pick = blockMenu.value;
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!pick) return;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) blockMenu.value = null;
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      blockMenu.value = null;
      document.querySelector<HTMLCanvasElement>('#app canvas')?.focus();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [pick]);

  if (!pick) return null;

  const { cell } = pick;
  const name = blockById(pick.block)?.label ?? 'block';
  const kitName =
    roster.value.find((kit) => kit.id === selectedKit.value)?.name ??
    roster.value[0]?.name ??
    'Luciana';
  const chosen = blockById(placeBlock.value)?.label ?? 'a block';
  const left = Math.max(8, Math.min(pick.screen.x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(pick.screen.y, window.innerHeight - HEIGHT - 8));

  const close = (): void => {
    blockMenu.value = null;
    document.querySelector<HTMLCanvasElement>('#app canvas')?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = buttons.findIndex((button) => button === document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(at + 1) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(at - 1 + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div
      ref={root}
      class={styles.menu}
      role="menu"
      aria-label={`${name} at ${String(cell.x)}, ${String(cell.y)}, ${String(cell.z)}`}
      style={{ left: `${String(left)}px`, top: `${String(top)}px` }}
      onKeyDown={onKeyDown}
    >
      <p class={styles.title}>
        {name}{' '}
        <span
          class={styles.where}
        >{`${String(cell.x)}, ${String(cell.y)}, ${String(cell.z)}`}</span>
      </p>
      {items(kitName, chosen).map((item, i) => (
        <button
          key={item.choice}
          type="button"
          role="menuitem"
          class={`${styles.item} ${i === 3 ? styles.divided : ''}`}
          onClick={() => {
            const chosen = pick;
            close();
            onBlockMenuChoice.value(item.choice, chosen);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
