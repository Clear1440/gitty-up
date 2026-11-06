import { describe, expect, it } from 'vitest';
import { BRANCH_SORTS, buildBranchTree, sortBranches } from './branchTree.js';

const branch = (name, { date = '2026-01-01T00:00:00Z', ...rest } = {}) => ({
  name,
  lastCommit: { date },
  ...rest,
});

const names = (branches) => branches.map(({ name }) => name);

describe('sortBranches', () => {
  const old = branch('b-old', { date: '2026-01-01T00:00:00Z' });
  const fresh = branch('a-fresh', { date: '2026-03-01T00:00:00Z' });
  const visited = branch('C-visited', {
    date: '2025-01-01T00:00:00Z',
    lastCheckout: '2026-06-01T00:00:00Z',
  });
  const branches = [old, fresh, visited];

  it('offers each sort', () => {
    expect(BRANCH_SORTS.map(({ value }) => value)).toEqual([
      'committed',
      'recent',
      'name-asc',
      'name-desc',
    ]);
  });

  it('sorts by the last commit', () => {
    expect(names(sortBranches(branches, 'committed'))).toEqual(['a-fresh', 'b-old', 'C-visited']);
  });

  it('counts checkouts as recent, and puts the current branch first', () => {
    expect(names(sortBranches(branches, 'recent'))).toEqual(['C-visited', 'a-fresh', 'b-old']);

    const current = branch('z-current', { date: '2020-01-01T00:00:00Z', isCurrent: true });
    expect(names(sortBranches([...branches, current], 'recent'))[0]).toBe('z-current');
  });

  it('sorts names either way, ignoring case and reading numbers as numbers', () => {
    const numbered = [branch('v10'), branch('V2'), branch('a')];

    expect(names(sortBranches(numbered, 'name-asc'))).toEqual(['a', 'V2', 'v10']);
    expect(names(sortBranches(numbered, 'name-desc'))).toEqual(['v10', 'V2', 'a']);
  });

  it('leaves the list it was given alone', () => {
    const list = [branch('b'), branch('a')];
    sortBranches(list, 'name-asc');
    expect(names(list)).toEqual(['b', 'a']);
  });
});

describe('buildBranchTree', () => {
  it('leaves names without a slash at the top', () => {
    expect(buildBranchTree([branch('main')])).toMatchObject([{ type: 'branch', label: 'main' }]);
  });

  it('groups branches under shared folders, at any depth', () => {
    const [features] = buildBranchTree([
      branch('features/x'),
      branch('features/y'),
      branch('features/ui/z'),
      branch('features/ui/w'),
    ]);

    expect(features).toMatchObject({ type: 'folder', name: 'features', path: 'features/' });
    expect(names(features.branches)).toEqual([
      'features/x',
      'features/y',
      'features/ui/z',
      'features/ui/w',
    ]);
    expect(features.children).toMatchObject([
      { type: 'branch', label: 'x' },
      { type: 'branch', label: 'y' },
      { type: 'folder', name: 'ui', path: 'features/ui/' },
    ]);
  });

  it('shows a branch alone in its folder as one row', () => {
    const [node] = buildBranchTree([branch('features/x')]);

    expect(node).toMatchObject({ type: 'branch', label: 'features/x' });
    expect(node.branch.name).toBe('features/x');
  });

  it('folds a lone branch into a row at the level above', () => {
    const [features] = buildBranchTree([branch('features/x'), branch('features/ui/z')]);

    expect(features.children).toMatchObject([
      { type: 'branch', label: 'x' },
      { type: 'branch', label: 'ui/z' },
    ]);
  });

  it('folds a chain of single folders down to the first with a choice in it', () => {
    const [node] = buildBranchTree([branch('a/b/c/x'), branch('a/b/c/y')]);

    expect(node).toMatchObject({ type: 'folder', name: 'a/b/c', path: 'a/b/c/' });
    expect(node.children).toMatchObject([
      { type: 'branch', label: 'x' },
      { type: 'branch', label: 'y' },
    ]);
  });

  it('collapses a whole chain to one row when it ends in a single branch', () => {
    const [node] = buildBranchTree([branch('a/b/c')]);
    expect(node).toMatchObject({ type: 'branch', label: 'a/b/c' });
  });

  it('places a folder where its first branch falls, keeping the given order', () => {
    const nodes = buildBranchTree([branch('a'), branch('f/1'), branch('b'), branch('f/2')]);

    expect(nodes.map((node) => node.label ?? node.name)).toEqual(['a', 'f', 'b']);
  });

  it('files remote branches under their remote', () => {
    const [origin] = buildBranchTree([
      branch('origin/main', { remote: 'origin', localName: 'main' }),
      branch('origin/feature/x', { remote: 'origin', localName: 'feature/x' }),
    ]);

    expect(origin).toMatchObject({ name: 'origin', path: 'origin/' });
    expect(origin.children).toMatchObject([
      { type: 'branch', label: 'main' },
      { type: 'branch', label: 'feature/x' },
    ]);
  });

  it('keeps the whole name on a branch inside a folder', () => {
    const [folder] = buildBranchTree([branch('features/x'), branch('features/y')]);
    expect(folder.children[0].branch.name).toBe('features/x');
  });
});
