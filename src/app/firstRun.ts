/**
 * Whether this is the player's first visit, which is when the three-step
 * welcome shows itself. A save (from M7) or a previous welcome counts as a
 * visit. Storage can be switched off; then every visit is a first one, and
 * the welcome stays skippable in a single keypress.
 */

const SEEN_KEY = 'daniblox:onboarded';
const SAVE_KEY = 'daniblox:v1';

export function isFirstRun(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === null && localStorage.getItem(SAVE_KEY) === null;
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Nothing to remember with. The welcome will simply show again.
  }
}
