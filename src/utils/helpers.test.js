import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitHelper } from '../pages/repository/CommitHelper.js';
import { countChangedFiles } from '../pages/repository/countChangedFiles.js';
import { StatusHelper } from '../pages/repository/StatusHelper.js';
import { needsPublishing } from '../pages/repository/usePush.js';
import { isMonoRepositoryId, monoGroupId, monoRepositoryId, paths } from '../paths.js';
import { readPixels, readToken } from '../styles/readToken.js';
import { CssTokenHelper } from '../styles/CssTokenHelper.js';
import { BranchHelper } from './BranchHelper.js';
import { KeyboardHelper } from './KeyboardHelper.js';
import { ListHelper } from './ListHelper.js';
import { MonoIdHelper } from './MonoIdHelper.js';
import { SetHelper } from './SetHelper.js';
import { readStored, writeStored } from './storage.js';
import { StorageHelper } from './StorageHelper.js';
import { TextHelper } from './TextHelper.js';
import { formatFullTime, formatRelativeTime } from './time.js';
import { TimeHelper } from './TimeHelper.js';

describe('BranchHelper', () => {
  it('protects main, master, prod and production on a remote', () => {
    expect(BranchHelper.isProtectedOnRemote('Main')).toBe(true);
    expect(BranchHelper.isProtectedOnRemote('feature/main')).toBe(false);
    expect(BranchHelper.isProtectedUpstream('origin/production')).toBe(true);
    expect(BranchHelper.isProtectedUpstream('origin/feature/prod')).toBe(false);
    expect(BranchHelper.isProtectedUpstream(null)).toBe(false);
  });
});

describe('TextHelper', () => {
  it('counts with the right word', () => {
    expect(TextHelper.countOf(1, 'line')).toBe('1 line');
    expect(TextHelper.countOf(3, 'line')).toBe('3 lines');
    expect(TextHelper.countOf(1, 'local branch', 'local branches')).toBe('1 local branch');
    expect(TextHelper.pluralize(2, 'branch', 'branches')).toBe('branches');
  });

  it('matches search text ignoring case and outer spaces', () => {
    expect(TextHelper.includesIgnoringCase('Feature/Login', '  login ')).toBe(true);
    expect(TextHelper.includesIgnoringCase('main', 'dev')).toBe(false);
  });
});

describe('ListHelper', () => {
  it('toggles a value in or out', () => {
    expect(ListHelper.toggle(['a', 'b'], 'a')).toEqual(['b']);
    expect(ListHelper.toggle(['b'], 'a')).toEqual(['b', 'a']);
  });

  it('slices between two indexes either way round', () => {
    expect(ListHelper.sliceBetween(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['b', 'c']);
    expect(ListHelper.sliceBetween(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['b', 'c', 'd']);
  });

  it('drops repeats and counts different keys', () => {
    expect(ListHelper.unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
    expect(ListHelper.countUnique([{ p: 1 }, { p: 1 }, { p: 2 }], (item) => item.p)).toBe(2);
  });
});

describe('SetHelper', () => {
  it('returns new sets, leaving the original alone', () => {
    const original = new Set(['a']);
    expect([...SetHelper.toggle(original, 'a')]).toEqual([]);
    expect([...SetHelper.toggle(original, 'b')]).toEqual(['a', 'b']);
    expect([...SetHelper.addAll(original, ['b', 'a'])]).toEqual(['a', 'b']);
    expect([...original]).toEqual(['a']);
  });
});

describe('KeyboardHelper', () => {
  it('treats Ctrl and Cmd alike', () => {
    expect(KeyboardHelper.hasCommandKey({ ctrlKey: true })).toBe(true);
    expect(KeyboardHelper.hasCommandKey({ metaKey: true })).toBe(true);
    expect(KeyboardHelper.hasCommandKey({})).toBe(false);
  });

  it('recognises Ctrl+Enter and Cmd+Enter', () => {
    expect(KeyboardHelper.isSubmitShortcut({ key: 'Enter', metaKey: true })).toBe(true);
    expect(KeyboardHelper.isSubmitShortcut({ key: 'Enter' })).toBe(false);
    expect(KeyboardHelper.isSubmitShortcut({ key: 'a', ctrlKey: true })).toBe(false);
  });
});

describe('TimeHelper', () => {
  it('describes how long ago a date was', () => {
    const now = Date.parse('2026-06-10T12:00:00Z');
    expect(TimeHelper.formatRelative('2026-06-10T11:59:40Z', now)).toBe('just now');
    expect(TimeHelper.formatRelative('2026-06-07T12:00:00Z', now)).toMatch(/3 days ago/);
  });

  it('reads a missing date as 0', () => {
    expect(TimeHelper.toTimestamp(null)).toBe(0);
    expect(TimeHelper.toTimestamp('1970-01-01T00:00:01Z')).toBe(1000);
  });
});

describe('MonoIdHelper', () => {
  it('round-trips a group id, as the server does', () => {
    expect(MonoIdHelper.fromGroupId('g1')).toBe('mono-g1');
    expect(MonoIdHelper.isMonoId('mono-g1')).toBe(true);
    expect(MonoIdHelper.toGroupId('mono-g1')).toBe('g1');
  });
});

describe('paths', () => {
  it('builds the same URLs as before', () => {
    expect(paths.history('r1')).toBe('/repositories/r1/history');
    expect(paths.history('r1', 'feature/x')).toBe('/repositories/r1/history?ref=feature%2Fx');
    expect(paths.focusBranch('r1', 'main')).toBe('/repositories/r1/history?focus=main');
    expect(paths.uncommitted('r1')).toBe('/repositories/r1/history?commit=uncommitted');
    expect(paths.resolveConflict('r1', 'a b.txt')).toBe('/repositories/r1/resolve?path=a+b.txt');
  });
});

describe('StatusHelper.tracksOtherName', () => {
  it('spots a branch tracking a remote branch of another name', () => {
    expect(StatusHelper.tracksOtherName({ branch: 'feature', upstream: 'origin/main' })).toBe(true);
    expect(StatusHelper.tracksOtherName({ branch: 'feature/x', upstream: 'origin/feature/x' })).toBe(
      false,
    );
    expect(StatusHelper.tracksOtherName({ branch: 'x', upstream: 'my/remote/x' })).toBe(false);
  });

  it('says nothing without a branch or an upstream', () => {
    expect(StatusHelper.tracksOtherName({ branch: null, upstream: 'origin/main' })).toBe(false);
    expect(StatusHelper.tracksOtherName({ branch: 'main', upstream: null })).toBe(false);
  });
});

describe('StatusHelper', () => {
  const status = (overrides) => ({
    branch: 'main',
    operation: null,
    upstream: 'origin/main',
    upstreamGone: false,
    staged: [],
    unstaged: [],
    conflicted: [],
    ...overrides,
  });

  it('counts each changed file once', () => {
    const file = { path: 'a.txt' };
    const changed = status({ staged: [file], unstaged: [file, { path: 'b.txt' }] });
    expect(StatusHelper.countChangedFiles(changed)).toBe(2);
    expect(StatusHelper.isClean(changed)).toBe(false);
    expect(StatusHelper.isClean(status())).toBe(true);
  });

  it('names the current branch, or HEAD when detached', () => {
    expect(StatusHelper.currentBranchName(status())).toBe('main');
    expect(StatusHelper.currentBranchName(status({ branch: null }))).toBe('HEAD');
  });

  it('blocks actions while one runs or an operation is paused', () => {
    expect(StatusHelper.isBlocked(status(), false)).toBe(false);
    expect(StatusHelper.isBlocked(status(), true)).toBe(true);
    expect(StatusHelper.isBlocked(status({ operation: 'merge' }), false)).toBe(true);
  });
});

describe('CommitHelper', () => {
  it('reads what a commit is', () => {
    const commit = { refs: [{ type: 'head', name: 'main' }], parents: ['a', 'b'] };
    expect(CommitHelper.isHead(commit)).toBe(true);
    expect(CommitHelper.isMerge(commit)).toBe(true);
    expect(CommitHelper.isMerge({ ...commit, parents: ['a'] })).toBe(false);
    expect(CommitHelper.shortHash('0123456789abcdef')).toBe('0123456');
    expect(CommitHelper.shortHash(null)).toBeUndefined();
  });
});

describe('old exports', () => {
  it('still point at the helpers that replaced them', () => {
    expect(readStored).toBe(StorageHelper.read);
    expect(writeStored).toBe(StorageHelper.write);
    expect(formatRelativeTime).toBe(TimeHelper.formatRelative);
    expect(formatFullTime).toBe(TimeHelper.formatFull);
    expect(readToken).toBe(CssTokenHelper.read);
    expect(readPixels).toBe(CssTokenHelper.readPixels);
    expect(monoRepositoryId).toBe(MonoIdHelper.fromGroupId);
    expect(isMonoRepositoryId).toBe(MonoIdHelper.isMonoId);
    expect(monoGroupId).toBe(MonoIdHelper.toGroupId);
    expect(countChangedFiles).toBe(StatusHelper.countChangedFiles);
    expect(needsPublishing).toBe(StatusHelper.needsPublishing);
  });

});

describe('StorageHelper', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips JSON, falling back for a key never written', () => {
    const items = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, value),
    });
    StorageHelper.write('key', { a: 1 });
    expect(StorageHelper.read('key', null)).toEqual({ a: 1 });
    expect(StorageHelper.read('missing', 'fallback')).toBe('fallback');
  });

  it('falls back quietly when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(StorageHelper.read('key', 'fallback')).toBe('fallback');
    expect(() => StorageHelper.write('key', { a: 1 })).not.toThrow();
  });
});
