import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * WCAG AA over the real token file (spec R7). Both themes, every pair of
 * text on a background and every border on a background. Reads the CSS
 * rather than a copy of it, so the numbers in docs/design.md cannot drift.
 */

const css = readFileSync(new URL('../../src/ui/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `${selector} is missing from tokens.css`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const vars: Record<string, string> = {};
  for (const line of css.slice(open + 1, close).split('\n')) {
    const m = /--([\w-]+):\s*(#[0-9a-f]{6})/i.exec(line);
    if (m?.[1] && m[2]) vars[m[1]] = m[2];
  }
  return vars;
}

function luminance(hex: string): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(':root {');
const dark = block(":root[data-theme='dark']");

describe.each([
  ['light', light],
  ['dark', dark],
])('the %s theme', (_name, theme) => {
  const need = (fg: string, bg: string, ratio: number): void => {
    const a = theme[fg];
    const b = theme[bg];
    expect(a, fg).toBeTruthy();
    expect(b, bg).toBeTruthy();
    expect(contrast(a ?? '#000000', b ?? '#ffffff'), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
      ratio,
    );
  };

  it('keeps body text readable on both surfaces', () => {
    need('text', 'bg', 4.5);
    need('text', 'surface', 4.5);
    need('muted', 'bg', 4.5);
    need('muted', 'surface', 4.5);
  });

  it('keeps the accent readable, and labels readable on it', () => {
    need('accent', 'bg', 4.5);
    need('accent', 'surface', 4.5);
    need('on-accent', 'accent', 4.5);
  });

  it('keeps borders visible', () => {
    need('border', 'bg', 3);
    need('border', 'surface', 3);
  });
});

describe('the dark theme is also what the system picks', () => {
  it('matches the media-query copy token for token', () => {
    const media = block(":root:not([data-theme='light'])");
    expect(media).toEqual(dark);
  });
});
