import { BlockMenu } from './BlockMenu';
import { Onboarding } from './Onboarding';
import { Palette } from './Palette';
import { Settings } from './Settings';
import { Sidebar } from './Sidebar';
import styles from './Shell.module.css';
import { Wordmark } from './Wordmark';
import { announcement, paletteOpen, sheetOpen, toast } from './state';

/**
 * The overlay above the canvas: the wordmark, Luciana's panel, a toast, and a
 * polite live region so anyone not watching the world still hears what she is
 * doing.
 */
export function Shell() {
  return (
    <div class={styles.overlay}>
      <header class={styles.header}>
        <Wordmark />
        <button
          type="button"
          class={styles.paletteButton}
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => {
            paletteOpen.value = true;
          }}
        >
          Commands
          <kbd class={styles.kbd}>⌘K</kbd>
        </button>
      </header>

      <div
        class={`${styles.panel} ${sheetOpen.value ? styles.panelOpen : ''}`}
        data-sheet={sheetOpen.value ? 'open' : 'peek'}
      >
        <button
          type="button"
          class={styles.handle}
          aria-expanded={sheetOpen.value}
          aria-controls="panel-body"
          onClick={() => {
            sheetOpen.value = !sheetOpen.value;
          }}
        >
          <span class={styles.handleBar} aria-hidden="true" />
          {sheetOpen.value ? 'Hide the panel' : 'Show more'}
        </button>
        <div id="panel-body" class={styles.panelBody}>
          <Sidebar />
          <Settings />
        </div>
      </div>

      {toast.value && (
        <p class={styles.toast} role="status">
          {toast.value}
        </p>
      )}

      <p class="visually-hidden" aria-live="polite">
        {announcement.value}
      </p>

      <Palette />
      <BlockMenu />
      <Onboarding />
    </div>
  );
}
