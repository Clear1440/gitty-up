import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiError, badRequest, gitFailure, notFound } from '../errors.js';
import { GitRefHelper } from '../git/GitRefHelper.js';
import { MonoIdHelper } from '../git/MonoIdHelper.js';
import { groupIdOf, isMonoId } from '../git/monoService.js';
import { AsyncHelper } from './AsyncHelper.js';
import { DateHelper } from './DateHelper.js';
import { FileSystemHelper } from './FileSystemHelper.js';
import { HashHelper } from './HashHelper.js';
import { mapWithLimit } from './mapWithLimit.js';
import { TextHelper } from './TextHelper.js';
import { UrlHelper } from './UrlHelper.js';
import { ValidationHelper } from './ValidationHelper.js';

describe('ApiError factories', () => {
  it('give each kind its status and code', () => {
    expect(ApiError.badRequest('x')).toMatchObject({ status: 400, code: 'BAD_REQUEST' });
    expect(ApiError.forbidden('x')).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(ApiError.notFound('x')).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(ApiError.gitFailure('x', 'out')).toMatchObject({ status: 409, code: 'GIT_FAILED' });
    expect(ApiError.conflicts('x', 'out')).toMatchObject({ status: 409, code: 'CONFLICTS' });
    expect(ApiError.partial('x', 'out')).toMatchObject({ status: 409, code: 'PARTIAL' });
    expect(ApiError.branchBehind('x')).toMatchObject({ status: 409, code: 'BRANCH_BEHIND' });
    expect(ApiError.internal()).toMatchObject({ status: 500, code: 'INTERNAL' });
  });

  it('keep the old function exports working', () => {
    expect(badRequest('x')).toBeInstanceOf(ApiError);
    expect(notFound('x').code).toBe('NOT_FOUND');
    expect(gitFailure('x', 'out').details).toBe('out');
  });
});

describe('TextHelper', () => {
  it('counts with the right word', () => {
    expect(TextHelper.countOf(1, 'file')).toBe('1 file');
    expect(TextHelper.countOf(0, 'file')).toBe('0 files');
    expect(TextHelper.countOf(2, 'repository', 'repositories')).toBe('2 repositories');
  });

  it('joins names as a sentence would', () => {
    expect(TextHelper.joinWithAnd([])).toBe('');
    expect(TextHelper.joinWithAnd(['a'])).toBe('a');
    expect(TextHelper.joinWithAnd(['a', 'b'])).toBe('a and b');
    expect(TextHelper.joinWithAnd(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('AsyncHelper.mapWithLimit', () => {
  it('keeps the order of the items, with no more than the limit running', async () => {
    let running = 0;
    let mostRunning = 0;
    const results = await AsyncHelper.mapWithLimit([30, 10, 20, 5], 2, async (delay) => {
      running += 1;
      mostRunning = Math.max(mostRunning, running);
      await new Promise((resolve) => setTimeout(resolve, delay));
      running -= 1;
      return delay * 2;
    });
    expect(results).toEqual([60, 20, 40, 10]);
    expect(mostRunning).toBe(2);
  });

  it('is still exported under its old name', () => {
    expect(mapWithLimit).toBe(AsyncHelper.mapWithLimit);
  });
});

describe('ValidationHelper', () => {
  it('requires a non-blank string, naming the field when it is missing', () => {
    expect(ValidationHelper.requireString(' a ', 'name')).toBe(' a ');
    expect(ValidationHelper.requireTrimmedString(' a ', 'name')).toBe('a');
    expect(() => ValidationHelper.requireString('  ', 'name')).toThrow('"name" is required.');
    expect(() => ValidationHelper.requireString(3, 'name')).toThrow(ApiError);
  });

  it('lets optional fields be left out', () => {
    expect(ValidationHelper.optionalString(undefined, 'x')).toBeUndefined();
    expect(ValidationHelper.optionalString(null, 'x')).toBeUndefined();
    expect(ValidationHelper.optionalString(' x ', 'x')).toBe('x');
    expect(ValidationHelper.optionalPaths(undefined)).toBeUndefined();
  });

  it('checks lists of paths and lines', () => {
    expect(ValidationHelper.requirePaths(['a'])).toEqual(['a']);
    expect(() => ValidationHelper.requirePaths([])).toThrow(ApiError);
    expect(() => ValidationHelper.requirePaths([1])).toThrow(ApiError);
    expect(ValidationHelper.requireLines([1, 2])).toEqual([1, 2]);
    expect(() => ValidationHelper.requireLines([1.5])).toThrow(ApiError);
  });

  it('reads counts from a query string, capped and with a fallback', () => {
    expect(ValidationHelper.toCount('5', 1)).toBe(5);
    expect(ValidationHelper.toCount('900', 1, 500)).toBe(500);
    expect(ValidationHelper.toCount('-1', 7)).toBe(7);
    expect(ValidationHelper.toCount(undefined, 7)).toBe(7);
  });
});

describe('FileSystemHelper', () => {
  it('tells whether a path exists', async () => {
    expect(await FileSystemHelper.exists(os.tmpdir())).toBe(true);
    expect(await FileSystemHelper.exists(path.join(os.tmpdir(), 'no-such-thing-here-42'))).toBe(
      false,
    );
  });
});

describe('HashHelper', () => {
  it('hashes with SHA-256', () => {
    expect(HashHelper.sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('UrlHelper', () => {
  it('parses a URL, or gives null', () => {
    expect(UrlHelper.tryParse('http://localhost:4317/x')?.hostname).toBe('localhost');
    expect(UrlHelper.tryParse('not a url')).toBeNull();
  });
});

describe('DateHelper', () => {
  it('compares ISO dates', () => {
    expect(DateHelper.isNewer('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(true);
    const sorted = ['2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z'].sort(DateHelper.newestFirst);
    expect(sorted[0]).toBe('2026-03-01T00:00:00Z');
  });
});

describe('GitRefHelper', () => {
  it('protects main, master, prod and production on a remote, whatever their case', () => {
    for (const name of ['main', 'master', 'prod', 'production', 'Main', 'PRODUCTION']) {
      expect(GitRefHelper.isProtectedOnRemote(name)).toBe(true);
    }
    for (const name of ['feature/main', 'mainline', 'develop']) {
      expect(GitRefHelper.isProtectedOnRemote(name)).toBe(false);
    }
  });

  it('converts between branch names and full refs', () => {
    expect(GitRefHelper.toLocalRef('feature/x')).toBe('refs/heads/feature/x');
    expect(GitRefHelper.toRemoteRef('origin/main')).toBe('refs/remotes/origin/main');
    expect(GitRefHelper.fromLocalRef('refs/heads/feature/x')).toBe('feature/x');
    expect(GitRefHelper.fromLocalRef('detached HEAD')).toBe('detached HEAD');
    expect(GitRefHelper.fromRemoteRef('refs/remotes/origin/main')).toBe('origin/main');
  });

  it('splits a remote branch name, allowing for slashes in either part', () => {
    expect(GitRefHelper.splitRemoteName('origin/feature/x', ['origin'])).toEqual({
      remote: 'origin',
      localName: 'feature/x',
    });
    expect(GitRefHelper.splitRemoteName('team/a/main', ['team/a'])).toEqual({
      remote: 'team/a',
      localName: 'main',
    });
    expect(GitRefHelper.splitRemoteName('main', [])).toEqual({ remote: null, localName: 'main' });
  });

  it('prefers origin as the default remote', () => {
    expect(GitRefHelper.pickDefaultRemote(['upstream', 'origin'])).toBe('origin');
    expect(GitRefHelper.pickDefaultRemote(['upstream'])).toBe('upstream');
    expect(GitRefHelper.pickDefaultRemote([])).toBeNull();
  });
});

describe('MonoIdHelper', () => {
  it('round-trips a group id', () => {
    const id = MonoIdHelper.fromGroupId('abc123');
    expect(id).toBe('mono-abc123');
    expect(MonoIdHelper.isMonoId(id)).toBe(true);
    expect(MonoIdHelper.isMonoId('abc123')).toBe(false);
    expect(MonoIdHelper.toGroupId(id)).toBe('abc123');
  });

  it('is still exported from monoService under the old names', () => {
    expect(isMonoId).toBe(MonoIdHelper.isMonoId);
    expect(groupIdOf).toBe(MonoIdHelper.toGroupId);
  });
});
