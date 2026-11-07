import { describe, expect, it } from 'vitest';
import { FETCH_ALL_INTERVAL_MS, isFetchAllDue } from './autoFetch.js';

const NOW = 1_000_000;

describe('isFetchAllDue', () => {
  it('fetches every repository the first time', () => {
    expect(isFetchAllDue(null, NOW)).toBe(true);
  });

  it('waits a while before fetching every repository again', () => {
    expect(isFetchAllDue(NOW - FETCH_ALL_INTERVAL_MS + 1, NOW)).toBe(false);
    expect(isFetchAllDue(NOW - FETCH_ALL_INTERVAL_MS, NOW)).toBe(true);
  });
});
