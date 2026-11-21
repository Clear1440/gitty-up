import { describe, expect, it } from 'vitest';
import { argumentRows, describeHead, outcomeLabel, visibleEntries } from './aiActivity.js';

describe('AI activity', () => {
  const entries = [
    { id: '1', tool: 'commit', write: true },
    { id: '2', tool: 'get_status', write: false },
  ];

  it('shows only changes unless asked for everything', () => {
    expect(visibleEntries(entries, false).map((entry) => entry.id)).toEqual(['1']);
    expect(visibleEntries(entries, true)).toHaveLength(2);
  });

  it('lists the arguments as lines, leaving out the repository', () => {
    expect(argumentRows({ repository: 'x', message: 'Fix', paths: ['a', 'b'], amend: false })).toEqual([
      { key: 'message', value: 'Fix' },
      { key: 'paths', value: 'a, b' },
      { key: 'amend', value: 'false' },
    ]);
  });

  it('describes where HEAD stood', () => {
    expect(describeHead({ head: '1234567890', branch: 'main' })).toBe('main at 1234567');
    expect(describeHead({ head: '1234567890', branch: null })).toBe('detached at 1234567');
    expect(describeHead(null)).toBeNull();
  });

  it('names the outcome, undone first', () => {
    expect(outcomeLabel({ outcome: 'ok' })).toBe('Done');
    expect(outcomeLabel({ outcome: 'error' })).toBe('Failed');
    expect(outcomeLabel({ outcome: 'ok', undone: { time: 'now' } })).toBe('Undone');
  });
});
