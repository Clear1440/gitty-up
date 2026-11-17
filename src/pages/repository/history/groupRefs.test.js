import { describe, expect, it } from 'vitest';
import {
  branchOfGroup,
  findBranchTip,
  groupHasBranch,
  groupRefs,
  orderForStack,
} from './groupRefs.js';

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

describe('groupHasBranch', () => {
  const [group] = groupRefs([{ type: 'branch', name: 'dev' }, remote('dev')]);
  const [remoteOnly] = groupRefs([remote('topic')]);
  const [tag] = groupRefs([{ type: 'tag', name: 'v1' }]);

  it('matches a group by its local or remote name', () => {
    expect(groupHasBranch(group, 'dev')).toBe(true);
    expect(groupHasBranch(group, 'origin/dev')).toBe(true);
    expect(groupHasBranch(group, 'other')).toBe(false);
  });

  it('never takes a remote branch for a local one of the same name', () => {
    expect(groupHasBranch(remoteOnly, 'topic')).toBe(false);
    expect(groupHasBranch(remoteOnly, 'origin/topic')).toBe(true);
  });

  it('never matches a tag', () => {
    expect(groupHasBranch(tag, 'v1')).toBe(false);
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

describe('orderForStack', () => {
  const head = { key: 'branch:main', name: 'main', type: 'head', local: true, remotes: ['origin/main'] };
  const local = { key: 'branch:topic', name: 'topic', type: 'branch', local: true, remotes: [] };
  const remote = { key: 'branch:other', name: 'other', type: 'branch', local: false, remotes: ['origin/other'] };
  const tag = { key: 'tag:v1', name: 'v1', type: 'tag', local: false, remotes: [] };
  const names = (groups) => groups.map((group) => group.name);

  it('puts the checked out branch in front, then local, remote and tags', () => {
    expect(names(orderForStack([tag, remote, local, head]))).toEqual(['main', 'topic', 'other', 'v1']);
  });

  it('puts the selected branch in front of the checked out one', () => {
    expect(names(orderForStack([head, local, remote], 'topic'))).toEqual(['topic', 'main', 'other']);
  });

  it('matches a selected remote branch by its full name', () => {
    expect(names(orderForStack([head, remote], 'origin/other'))).toEqual(['other', 'main']);
  });

  it('keeps the order of groups that rank the same', () => {
    const second = { ...local, key: 'branch:second', name: 'second' };
    expect(names(orderForStack([second, local]))).toEqual(['second', 'topic']);
  });
});

describe('branchOfGroup', () => {
  it('names the local branch, or else the first remote copy', () => {
    expect(branchOfGroup({ name: 'main', local: true, remotes: ['origin/main'] })).toBe('main');
    expect(branchOfGroup({ name: 'other', local: false, remotes: ['origin/other'] })).toBe('origin/other');
  });
});
