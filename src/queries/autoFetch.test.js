import { describe, expect, it } from 'vitest';
import {
  FETCH_INTERVAL_MS,
  RETURN_DEBOUNCE_MS,
  isFetchDue,
  isReturnRefreshDue,
} from './autoFetch.js';

const NOW = 1_000_000;

describe('isFetchDue', () => {
  it('fetches the first time', () => {
    expect(isFetchDue(null, NOW)).toBe(true);
  });

  it('waits a while before fetching again', () => {
    expect(isFetchDue(NOW - FETCH_INTERVAL_MS + 1, NOW)).toBe(false);
    expect(isFetchDue(NOW - FETCH_INTERVAL_MS, NOW)).toBe(true);
  });
});

describe('isReturnRefreshDue', () => {
  it('refreshes the first time the window is come back to', () => {
    expect(isReturnRefreshDue(null, NOW)).toBe(true);
  });

  it('treats focus and visibility events straight after each other as one return', () => {
    expect(isReturnRefreshDue(NOW - RETURN_DEBOUNCE_MS + 1, NOW)).toBe(false);
    expect(isReturnRefreshDue(NOW - RETURN_DEBOUNCE_MS, NOW)).toBe(true);
  });
});
