import { describe, expect, it } from 'vitest';
import {
  parseBranches,
  parseCheckouts,
  parseCommits,
  parseNameStatus,
  parseStashes,
  parseStatus,
} from './parsers.js';

const nul = (...records) => `${records.join('\0')}\0`;

describe('parseStatus', () => {
  it('tells an upstream that is gone from one that is there', () => {
    const header = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main'];

    expect(parseStatus(nul(...header, '# branch.ab +0 -0')).upstreamGone).toBe(false);
    expect(parseStatus(nul(...header)).upstreamGone).toBe(true);
    expect(parseStatus(nul('# branch.oid abc', '# branch.head main')).upstreamGone).toBe(false);
  });

  it('reads branch tracking headers', () => {
    const status = parseStatus(
      nul(
        '# branch.oid abc123',
        '# branch.head feature/login',
        '# branch.upstream origin/feature/login',
        '# branch.ab +2 -3',
      ),
    );
    expect(status).toMatchObject({
      headHash: 'abc123',
      branch: 'feature/login',
      detached: false,
      upstream: 'origin/feature/login',
      ahead: 2,
      behind: 3,
    });
  });

  it('recognises a detached head and an unborn branch', () => {
    expect(parseStatus(nul('# branch.oid abc', '# branch.head (detached)'))).toMatchObject({
      branch: null,
      detached: true,
    });
    expect(parseStatus(nul('# branch.oid (initial)', '# branch.head main'))).toMatchObject({
      branch: 'main',
      headHash: null,
    });
  });

  it('splits one file across staged and unstaged, keeping spaces in paths', () => {
    const status = parseStatus(nul('1 MM N... 100644 100644 100644 aaa bbb src/my file.js'));
    expect(status.staged).toEqual([
      { path: 'src/my file.js', originalPath: null, status: 'modified' },
    ]);
    expect(status.unstaged).toEqual([
      { path: 'src/my file.js', originalPath: null, status: 'modified' },
    ]);
  });

  it('pairs renames with their original path without misreading the next record', () => {
    const status = parseStatus(
      nul('2 R. N... 100644 100644 100644 aaa bbb R100 new name.js', 'old name.js', '? other.js'),
    );
    expect(status.staged).toEqual([
      { path: 'new name.js', originalPath: 'old name.js', status: 'renamed' },
    ]);
    expect(status.unstaged).toEqual([
      { path: 'other.js', originalPath: null, status: 'untracked' },
    ]);
  });

  it('reports conflicts', () => {
    const status = parseStatus(nul('u UU N... 100644 100644 100644 100644 a b c conflict me.js'));
    expect(status.conflicted).toEqual([
      { path: 'conflict me.js', originalPath: null, status: 'conflicted' },
    ]);
  });
});

describe('parseBranches', () => {
  const line = (...fields) => fields.join('\0');
  const commit = ['2026-01-01T00:00:00+00:00', 'Ada', 'Add thing'];

  it('separates local and remote branches and reads tracking', () => {
    const output = [
      line('refs/heads/main', 'abc', 'origin/main', 'ahead 1, behind 2', '*', ...commit, ''),
      line('refs/heads/old', 'def', 'origin/old', 'gone', ' ', ...commit, ''),
      line('refs/remotes/origin/HEAD', 'abc', '', '', ' ', ...commit, 'refs/remotes/origin/main'),
      line('refs/remotes/origin/feature/x', 'abc', '', '', ' ', ...commit, ''),
    ].join('\n');

    const { local, remote } = parseBranches(output, ['origin']);

    expect(local[0]).toMatchObject({ name: 'main', isCurrent: true, ahead: 1, behind: 2 });
    expect(local[1]).toMatchObject({ name: 'old', isCurrent: false, upstreamGone: true });
    expect(remote).toHaveLength(1);
    expect(remote[0]).toMatchObject({
      name: 'origin/feature/x',
      remote: 'origin',
      localName: 'feature/x',
    });
  });
});

describe('parseNameStatus', () => {
  it('reads each kind of change', () => {
    expect(parseNameStatus('M\0a.txt\0A\0b.txt\0D\0c.txt\0')).toEqual([
      { path: 'a.txt', status: 'modified' },
      { path: 'b.txt', status: 'added' },
      { path: 'c.txt', status: 'deleted' },
    ]);
  });

  it('reads the two paths of a rename, without counting the second as a change', () => {
    expect(parseNameStatus('R097\0old name.txt\0new name.txt\0M\0after.txt\0')).toEqual([
      { path: 'new name.txt', status: 'renamed', originalPath: 'old name.txt' },
      { path: 'after.txt', status: 'modified' },
    ]);
  });

  it('finds nothing in empty output', () => {
    expect(parseNameStatus('')).toEqual([]);
  });
});

describe('parseStashes', () => {
  it('splits branch from message and numbers stashes newest first', () => {
    const stashes = parseStashes(
      [
        'On feature/a: my note: with colon\x002026-01-02T00:00:00+00:00',
        'WIP on main: abc123 Fix thing\x002026-01-01T00:00:00+00:00',
      ].join('\n'),
    );

    expect(stashes).toEqual([
      {
        ref: 'stash@{0}',
        branch: 'feature/a',
        message: 'my note: with colon',
        date: '2026-01-02T00:00:00+00:00',
      },
      {
        ref: 'stash@{1}',
        branch: 'main',
        message: 'WIP: Fix thing',
        date: '2026-01-01T00:00:00+00:00',
      },
    ]);
  });

  it('keeps subjects it does not recognise', () => {
    const [stash] = parseStashes('custom text\x002026-01-01T00:00:00+00:00');
    expect(stash).toMatchObject({ branch: null, message: 'custom text' });
  });
});

describe('parseCommits', () => {
  it('reads decorations, parents and subjects containing separators', () => {
    const record = [
      'hash1',
      'h1',
      'p1 p2',
      'Ada',
      'ada@example.com',
      '2026-01-01T00:00:00+00:00',
      'HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/origin/feature/x, refs/heads/dev',
      'Merge: a, b',
    ].join('\0');

    const [commit] = parseCommits(`${record}\x1e\n`, ['origin']);

    expect(commit.parents).toEqual(['p1', 'p2']);
    expect(commit.subject).toBe('Merge: a, b');
    expect(commit.refs).toEqual([
      { type: 'head', name: 'main' },
      { type: 'tag', name: 'v1' },
      { type: 'remote', name: 'origin/feature/x', remote: 'origin', localName: 'feature/x' },
      { type: 'branch', name: 'dev' },
    ]);
  });

  it('marks a detached HEAD and hides remote HEAD aliases', () => {
    const refs = 'HEAD, refs/remotes/origin/HEAD, refs/remotes/origin/main';
    const record = ['h', 's', '', 'A', 'a@b.c', 'date', refs, 'x'];

    const [commit] = parseCommits(`${record.join('\0')}\x1e`, ['origin']);

    expect(commit.refs).toEqual([
      { type: 'head', name: 'HEAD' },
      { type: 'remote', name: 'origin/main', remote: 'origin', localName: 'main' },
    ]);
  });
});

describe('parseCheckouts', () => {
  const entry = (seconds, subject) => `HEAD@{${seconds}}\0${subject}`;
  const iso = (seconds) => new Date(seconds * 1000).toISOString();

  it('keeps the latest time for each branch, on either side of a move', () => {
    const checkouts = parseCheckouts(
      [
        entry(300, 'checkout: moving from main to feature/x'),
        entry(200, 'commit: Add thing'),
        entry(100, 'checkout: moving from old to main'),
      ].join('\n'),
    );

    expect(Object.fromEntries(checkouts)).toEqual({
      main: iso(300),
      'feature/x': iso(300),
      old: iso(100),
    });
  });

  it('handles an empty reflog', () => {
    expect(parseCheckouts('').size).toBe(0);
  });
});
