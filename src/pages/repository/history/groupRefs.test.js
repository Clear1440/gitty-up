import { describe, expect, it } from 'vitest';
import { findBranchTip, groupRefs } from './groupRefs.js';

const remote = (name, remoteName = 'origin') => ({
  type: 'remote',
  name: `${remoteName}/${name}`,
  remote: remoteName,
  localName: name,
});

describe('findBranchTip', () => {
  const commits = [
    { hash: 'a', refs: [{ type: 'head', name: 'main' }] },
    { hash: 'b', refs: [{ type: 'tag', name: 'v1' }, remote('main')] },
    { hash: 'c', refs: [{ type: 'branch', name: 'features/x' }] },
    { hash: 'd', refs: [] },
  ];

  it('finds a local branch, checked out or not', () => {
    expect(findBranchTip(commits, 'main').hash).toBe('a');
    expect(findBranchTip(commits, 'features/x').hash).toBe('c');
  });

  it('tells a remote branch from a local one of the same name', () => {
    expect(findBranchTip(commits, 'origin/main').hash).toBe('b');
  });

  it('ignores tags, and branches it has not been given', () => {
    expect(findBranchTip(commits, 'v1')).toBeUndefined();
    expect(findBranchTip(commits, 'gone')).toBeUndefined();
  });
});

describe('groupRefs', () => {
  it('folds a branch and its remote copies into one group', () => {
    const groups = groupRefs([
      { type: 'head', name: 'main' },
      remote('main'),
      remote('main', 'upstream'),
    ]);

    expect(groups).toEqual([
      {
        key: 'branch:main',
        name: 'main',
        type: 'head',
        local: true,
        remotes: ['origin/main', 'upstream/main'],
      },
    ]);
  });

  it('keeps a branch that is only local, or only on a remote, as just that', () => {
    const groups = groupRefs([{ type: 'branch', name: 'dev' }, remote('feature/x')]);

    expect(groups).toMatchObject([
      { name: 'dev', type: 'branch', local: true, remotes: [] },
      { name: 'feature/x', type: 'branch', local: false, remotes: ['origin/feature/x'] },
    ]);
  });

  it('never folds a tag into a branch of the same name', () => {
    const groups = groupRefs([
      { type: 'tag', name: 'v1' },
      { type: 'branch', name: 'v1' },
    ]);

    expect(groups).toMatchObject([
      { name: 'v1', type: 'tag', local: false },
      { name: 'v1', type: 'branch', local: true },
    ]);
  });
});
