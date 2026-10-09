/**
 * Where the API key lives (non-negotiable 3).
 *
 * In memory by default. Nowhere else, unless the player explicitly asks it to
 * be remembered for the tab, and even then never in localStorage, never in the
 * save file, and never in a share link. Tests check each of those.
 */

const SESSION_KEY = 'daniblox:key';

let inMemory = '';
let remembered = false;

/** Read the key. The only place anything should get it from. */
export function getKey(): string {
  return inMemory;
}

export function isRemembered(): boolean {
  return remembered;
}

/**
 * Set the key. `remember` writes it to sessionStorage, which the browser drops
 * when the tab closes. localStorage is never used for this and never will be.
 */
export function setKey(key: string, remember: boolean): void {
  inMemory = key;
  remembered = remember;
  try {
    if (remember && key) sessionStorage.setItem(SESSION_KEY, key);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be switched off entirely. The key still works this session.
    remembered = false;
  }
}

/** Pick up a key the player chose to remember earlier in this tab. */
export function restoreKey(): string {
  try {
    const found = sessionStorage.getItem(SESSION_KEY);
    if (found) {
      inMemory = found;
      remembered = true;
      return found;
    }
  } catch {
    // Nothing to restore.
  }
  return '';
}

export function forgetKey(): void {
  inMemory = '';
  remembered = false;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Already gone.
  }
}
