import { useLayoutEffect, useRef } from 'preact/hooks';
import styles from './Onboarding.module.css';
import { onCommand, onOnboardingDone, onboarding } from './state';

/**
 * The first-run welcome (spec scope): three steps, each a few lines, each
 * one key to pass. Skippable at any point and replayable from settings. The
 * world keeps running behind it and the camera still answers the pointer,
 * because the first step asks the player to look around.
 */

interface Step {
  readonly title: string;
  readonly body: string;
  readonly action: string;
  /** Sent to Luciana when the action is taken, so the step does something real. */
  readonly command?: string;
}

export const STEPS: readonly Step[] = [
  {
    title: 'Meet Luciana',
    body: 'The cat in the meadow is Luciana. Drag to look around and scroll to zoom. The pale ring on the ground is what "here" means.',
    action: 'Next',
  },
  {
    title: 'Give her an order',
    body: 'She does what you type, in plain words. Try this one: she will raise a hill under the ring.',
    action: 'Raise a hill here',
    command: 'raise a hill here',
  },
  {
    title: 'Say hello',
    body: 'She talks too. Ask what she is doing or carrying, or just say hi. The box on the right is yours from here.',
    action: 'Say hello',
    command: 'hello',
  },
];

export function Onboarding() {
  const step = onboarding.value;
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!step) return;
    card.current?.querySelector<HTMLButtonElement>('button[data-primary]')?.focus();
  }, [step]);

  if (!step) return null;
  const current = STEPS[step - 1];
  if (!current) return null;

  const finish = (): void => {
    onboarding.value = 0;
    onOnboardingDone.value();
  };

  const advance = (): void => {
    if (current.command) onCommand.value(current.command);
    if (step >= STEPS.length) finish();
    else onboarding.value = step + 1;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep focus inside while the welcome is up.
    const buttons = [...(card.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div class={styles.layer}>
      <div
        ref={card}
        class={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onKeyDown={onKeyDown}
      >
        <p class={styles.count}>
          {String(step)} of {String(STEPS.length)}
        </p>
        <h2 id="onboarding-title" class={styles.title}>
          {current.title}
        </h2>
        <p class={styles.body}>{current.body}</p>
        <div class={styles.row}>
          <button type="button" class={styles.skip} onClick={finish}>
            Skip
          </button>
          <button type="button" data-primary class={styles.primary} onClick={advance}>
            {current.action}
          </button>
        </div>
      </div>
    </div>
  );
}
