import { describe, expect, it } from 'vitest';
import { clampSize, sanitizeSizes } from './useResizableSizes.js';

const limits = { sidebar: { min: 200, max: 600 }, list: { min: 100, max: 300 } };

describe('clampSize', () => {
  it('keeps a size inside its limits', () => {
    expect(clampSize(50, limits.sidebar)).toBe(200);
    expect(clampSize(350, limits.sidebar)).toBe(350);
    expect(clampSize(900, limits.sidebar)).toBe(600);
  });
});

describe('sanitizeSizes', () => {
  it('keeps valid sizes', () => {
    expect(sanitizeSizes({ sidebar: 320 }, limits)).toEqual({ sidebar: 320 });
  });

  it('pulls stored sizes back inside their limits', () => {
    expect(sanitizeSizes({ sidebar: 5000, list: 1 }, limits)).toEqual({ sidebar: 600, list: 100 });
  });

  it('drops values that are not sizes, and names that no longer exist', () => {
    expect(sanitizeSizes({ sidebar: 'wide', list: null, removed: 300 }, limits)).toEqual({});
  });

  it('survives stored data that is not an object', () => {
    expect(sanitizeSizes(null, limits)).toEqual({});
    expect(sanitizeSizes('corrupt', limits)).toEqual({});
  });
});
