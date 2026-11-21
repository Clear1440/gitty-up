import { describe, expect, it } from 'vitest';
import { encodeUrlPath, matchRemotePath, splitRepositoryPath } from './hostApi.js';

describe('matchRemotePath', () => {
  it.each([
    ['https://example.org/a/b.git', 'a/b'],
    ['https://user:secret@example.org/a/b', 'a/b'],
    ['https://example.org:443/a/b/c.git', 'a/b/c'],
    ['ssh://git@example.org:2222/a/b.git', 'a/b'],
    ['git@example.org:a/b.git', 'a/b'],
    ['  git@example.org:a/b.git\n', 'a/b'],
  ])('reads %s', (url, path) => {
    expect(matchRemotePath(url, 'example.org')).toBe(path);
  });

  it.each([
    'https://example.org.evil.test/a/b.git',
    'https://evilexample.org/a/b.git',
    'http://example.org/a/b.git',
    'file:///example.org/a/b.git',
    undefined,
  ])('rejects %s', (url) => {
    expect(matchRemotePath(url, 'example.org')).toBeNull();
  });
});

describe('splitRepositoryPath', () => {
  it('splits a path with the right number of parts', () => {
    expect(splitRepositoryPath('a/b', { min: 2, max: 2 })).toEqual(['a', 'b']);
    expect(splitRepositoryPath('a/b/c', { min: 2, max: 5 })).toEqual(['a', 'b', 'c']);
  });

  it.each(['a', 'a/b/c', 'a/..', 'a/./b', 'a//b', 'a/b?x', null])('rejects %s', (path) => {
    expect(splitRepositoryPath(path, { min: 2, max: 2 })).toBeNull();
  });
});

describe('encodeUrlPath', () => {
  it('keeps slashes and encodes the rest', () => {
    expect(encodeUrlPath('feature/a b#1')).toBe('feature/a%20b%231');
  });
});
