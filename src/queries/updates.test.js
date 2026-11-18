import { describe, expect, it } from 'vitest';
import { isUpdating, updateStatusInterval } from './updates.js';

describe('isUpdating', () => {
  it('is true only while an update downloads or installs', () => {
    expect(isUpdating({ supported: true, phase: 'downloading' })).toBe(true);
    expect(isUpdating({ supported: true, phase: 'installing' })).toBe(true);
    expect(isUpdating({ supported: true, phase: 'idle' })).toBe(false);
  });

  it('is false for a status with no phase, as when the app cannot update itself', () => {
    expect(isUpdating({ supported: false })).toBe(false);
    expect(isUpdating(undefined)).toBe(false);
  });
});

describe('updateStatusInterval', () => {
  it('never reads again when the app cannot update itself', () => {
    expect(updateStatusInterval({ supported: false })).toBe(false);
  });

  it('reads often while installing, and rarely otherwise', () => {
    const installing = updateStatusInterval({ supported: true, phase: 'downloading' });
    const idle = updateStatusInterval({ supported: true, phase: 'idle' });
    expect(installing).toBeLessThan(idle);
    expect(idle).toBeGreaterThanOrEqual(60 * 60_000);
  });
});
