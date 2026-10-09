import styles from './Wordmark.module.css';

/**
 * The Daniblox wordmark (docs/plan.md section 3.6).
 *
 * Real text in the display face rather than SVG glyphs, so the font is
 * genuinely exercised, the mark scales with the type system, and assistive
 * technology reads one clean name. A pixel gem stands in for the "O".
 */

export interface WordmarkProps {
  /** Letter height in CSS pixels. The slab and gem scale with it. */
  size?: number;
}

export function Wordmark({ size = 16 }: WordmarkProps) {
  return (
    <span
      class={styles.wordmark}
      style={{ '--wordmark-size': `${String(size)}px` }}
      role="img"
      aria-label="Daniblox"
    >
      <span aria-hidden="true">DANIBL</span>
      <svg class={styles.gem} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
        <path
          d="M3 6h10v1H3z M4 7h8v1H4z M5 8h6v3H5z M6 11h4v1H6z M7 12h2v1H7z"
          fill="currentColor"
        />
        <path d="M3 5h10v1H3z M5 4h6v1H5z" fill="#ffd0e4" />
        <path d="M12 1h1v2h-1z M11 3h3v1h-3z M12 4h1v2h-1z" fill="currentColor" />
      </svg>
      <span aria-hidden="true">X</span>
    </span>
  );
}
