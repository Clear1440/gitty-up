import { describe, expect, it } from 'vitest';
import { isUpdating } from './updates.js';

describe('isUpdating', () => {
  it('is true only while an update downloads or installs', () => {
    expect(isUpdating({ supported: true, phase: 'downloading' })).toBe(true);
    expect(isUpdating({ supported: true, phase: 'installing' })).toBe(true);
    expect(isUpdating({ supported: true, phase: 'idle' })).toBe(false);
  });

  it('is false without an updater, so the status is not read twice a second', () => {
    expect(isUpdating({ supported: false })).toBe(false);
    expect(isUpdating(undefined)).toBe(false);
  });
});
