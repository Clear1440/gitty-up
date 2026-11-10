import { describe, expect, it } from 'vitest';
import { findMatches, matchesCommit } from './commitSearch.js';

const commit = {
  hash: 'abc1234def',
  subject: 'Fix the login page',
  author: 'Sam Lee',
  email: 'sam@example.com',
  refs: [{ type: 'remote', name: 'origin/feature/login' }],
};

describe('matchesCommit', () => {
  it.each([
    ['the message, ignoring case', 'LOGIN PAGE'],
    ['the author', 'sam lee'],
    ['the email', 'example.com'],
    ['a branch name', 'feature/login'],
    ['the start of the hash', 'ABC12'],
    ['a query with spaces around it', '  fix  '],
  ])('matches %s', (_case, query) => {
    expect(matchesCommit(commit, query)).toBe(true);
  });

  it('does not match the middle of a hash', () => {
    expect(matchesCommit(commit, '1234')).toBe(false);
  });

  it('matches nothing for an empty query', () => {
    expect(matchesCommit(commit, '   ')).toBe(false);
  });

  it('skips stashes', () => {
    expect(matchesCommit({ ...commit, stash: {} }, 'login')).toBe(false);
  });
});

describe('findMatches', () => {
  it('lists the matching hashes in order', () => {
    const entries = [
      { ...commit, hash: 'c3', subject: 'Add login' },
      { ...commit, hash: 'c2', subject: 'Tidy up', refs: [] },
      { ...commit, hash: 'c1', subject: 'Login fix' },
    ];
    expect(findMatches(entries, 'login')).toEqual(['c3', 'c1']);
  });
});
