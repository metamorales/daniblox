import { describe, expect, it } from 'vitest';
import { cycleTheme, preferences, setPreference } from '../../src/ui/state';

describe('preferences', () => {
  it('cycles the theme through system, light and dark', () => {
    setPreference('theme', 'system');
    expect(cycleTheme()).toBe('light');
    expect(cycleTheme()).toBe('dark');
    expect(cycleTheme()).toBe('system');
  });

  it('changes one preference without touching the others', () => {
    setPreference('motion', 'reduced');
    setPreference('renderDistance', 'near');
    expect(preferences.value.motion).toBe('reduced');
    expect(preferences.value.renderDistance).toBe('near');
    setPreference('motion', 'system');
    expect(preferences.value.renderDistance).toBe('near');
  });
});
