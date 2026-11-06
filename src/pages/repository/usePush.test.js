import { describe, expect, it } from 'vitest';
import { needsPublishing } from './usePush.js';

describe('needsPublishing', () => {
  it('is true for a branch with no upstream, or one that is gone', () => {
    expect(needsPublishing({ upstream: null, upstreamGone: false })).toBe(true);
    expect(needsPublishing({ upstream: 'origin/main', upstreamGone: true })).toBe(true);
  });

  it('is false for a branch already on a remote', () => {
    expect(needsPublishing({ upstream: 'origin/main', upstreamGone: false })).toBe(false);
  });
});
