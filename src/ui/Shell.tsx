import styles from './Shell.module.css';
import { Wordmark } from './Wordmark';

/**
 * M0 shell: the wordmark over the canvas and a note about what this scene is.
 * The sidebar, roster, chat thread and command palette arrive in M3 and M6.
 */
export function Shell() {
  return (
    <div class={styles.overlay}>
      <header class={styles.header}>
        <Wordmark size={20} />
      </header>
      <p class={styles.caption}>Drag to orbit, scroll to zoom, W A S D to pan. Kits arrive next.</p>
    </div>
  );
}
