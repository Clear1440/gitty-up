import { describe, expect, it } from 'vitest';
import { ReflogHelper } from './ReflogHelper.js';

const entries = [
  { hash: 'a', reachable: true, action: 'commit', message: 'one' },
  { hash: 'b', reachable: false, action: 'reset', message: '' },
  { hash: 'b', reachable: false, action: 'checkout', message: 'moving' },
  { hash: 'c', reachable: false, action: 'amend', message: 'three' },
];

describe('ReflogHelper', () => {
  it('keeps only the entries no branch reaches', () => {
    expect(ReflogHelper.onlyLost(entries).map(({ hash }) => hash)).toEqual(['b', 'b', 'c']);
  });

  it('counts a lost commit once however often it is listed', () => {
    expect(ReflogHelper.countLost(entries)).toBe(2);
  });

  it('lists everything unless asked for the lost ones', () => {
    expect(ReflogHelper.visible(entries, false)).toHaveLength(4);
    expect(ReflogHelper.visible(entries, true)).toHaveLength(3);
  });

  it('names the action with a capital', () => {
    expect(ReflogHelper.actionLabel('cherry-pick')).toBe('Cherry-pick');
  });

  it('falls back to the action when there is no message', () => {
    expect(ReflogHelper.describe(entries[1])).toBe('Reset');
    expect(ReflogHelper.describe(entries[0])).toBe('one');
  });
});
