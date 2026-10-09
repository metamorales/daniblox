import { Sidebar } from './Sidebar';
import styles from './Shell.module.css';
import { Wordmark } from './Wordmark';
import { announcement, toast } from './state';

/**
 * The overlay above the canvas: the wordmark, Luciana's panel, a toast, and a
 * polite live region so anyone not watching the world still hears what she is
 * doing.
 */
export function Shell() {
  return (
    <div class={styles.overlay}>
      <header class={styles.header}>
        <Wordmark size={20} />
      </header>

      <div class={styles.panel}>
        <Sidebar />
      </div>

      {toast.value && (
        <p class={styles.toast} role="status">
          {toast.value}
        </p>
      )}

      <p class="visually-hidden" aria-live="polite">
        {announcement.value}
      </p>
    </div>
  );
}
