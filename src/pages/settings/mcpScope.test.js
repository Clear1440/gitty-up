import { describe, expect, it } from 'vitest';
import { allowedRepositories, nextScope } from './mcpScope.js';

describe('nextScope', () => {
  it('drops everything else when All is picked', () => {
    expect(nextScope(['repo:a', 'group:g'], ['repo:a', 'group:g', '*'])).toEqual(['*']);
  });

  it('drops All when something else is picked', () => {
    expect(nextScope(['*'], ['*', 'repo:a'])).toEqual(['repo:a']);
  });

  it('keeps an ordinary choice, and allows choosing none', () => {
    expect(nextScope(['repo:a'], ['repo:a', 'repo:b'])).toEqual(['repo:a', 'repo:b']);
    expect(nextScope(['repo:a'], [])).toEqual([]);
  });
});

describe('allowedRepositories', () => {
  const repositories = [
    { id: 'a', path: '/a' },
    { id: 'b', path: '/b', groupIds: ['g'] },
    { id: 'c', path: '/c' },
    { id: 'stub', path: null },
  ];
  const ids = (scope) => allowedRepositories(scope, repositories).map(({ id }) => id);

  it('allows every linked repository for All, but never a stub', () => {
    expect(ids(['*'])).toEqual(['a', 'b', 'c']);
  });

  it('allows the repositories chosen and those in the groups chosen', () => {
    expect(ids(['repo:a', 'group:g'])).toEqual(['a', 'b']);
    expect(ids([])).toEqual([]);
  });
});
