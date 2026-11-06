import { describe, expect, it } from 'vitest';
import { GRAPH_COLOR_COUNT, layoutCommitGraph } from './commitGraph.js';

const commit = (hash, ...parents) => ({ hash, parents });
const ofKind = (row, kind) => row.segments.filter((segment) => segment.kind === kind);
const withoutColor = (segments) => segments.map(({ from, to }) => ({ from, to }));

describe('naming the branch of each row and line', () => {
  const on = (type, name) => ({ type, name });
  const tipOf = (hash, name, ...parents) => ({ ...commit(hash, ...parents), refs: [on('branch', name)] });

  it('carries a branch name down its lane', () => {
    const { rows } = layoutCommitGraph([tipOf('b', 'topic', 'a'), commit('a')]);

    expect(rows.map((row) => row.branch)).toEqual(['topic', 'topic']);
    expect(ofKind(rows[0], 'bottom')[0].branch).toBe('topic');
    expect(ofKind(rows[1], 'top')[0].branch).toBe('topic');
  });

  it('names a remote only branch without its remote', () => {
    const remoteRef = { type: 'remote', name: 'origin/topic', remote: 'origin', localName: 'topic' };
    const { rows } = layoutCommitGraph([{ ...commit('a'), refs: [remoteRef] }]);

    expect(rows[0].branch).toBe('topic');
  });

  it('prefers the checked out branch among several on one commit', () => {
    const refs = [on('branch', 'other'), on('head', 'mine')];
    const { rows } = layoutCommitGraph([{ ...commit('a'), refs }]);

    expect(rows[0].branch).toBe('mine');
  });

  it('names lines passing through other rows', () => {
    const { rows } = layoutCommitGraph([
      tipOf('m', 'main', 'base'),
      tipOf('t', 'topic', 'base'),
      commit('base'),
    ]);

    expect(ofKind(rows[1], 'through')[0].branch).toBe('main');
  });

  it('gives the history below a fork to the trunk, even when a topic got there first', () => {
    const { rows } = layoutCommitGraph([
      tipOf('t', 'topic', 'base'),
      tipOf('m', 'main', 'base'),
      commit('base', 'root'),
      commit('root'),
    ]);

    expect(rows[0].branch).toBe('topic');
    expect(rows[1].branch).toBe('main');
    expect(rows[2].branch).toBe('main');
    expect(rows[3].branch).toBe('main');
  });

  it('names a merged branch with no ref left from the merge message', () => {
    const merge = {
      ...tipOf('merge', 'main', 'a', 'b'),
      subject: "Merge branch 'feature/x' into main",
    };
    const { rows } = layoutCommitGraph([merge, commit('b', 'a'), commit('a')]);

    expect(ofKind(rows[0], 'bottom').map((segment) => segment.branch)).toEqual([
      'main',
      'feature/x',
    ]);
    expect(rows[1].branch).toBe('feature/x');
  });

  it('understands merged pull requests', () => {
    const merge = {
      ...tipOf('merge', 'main', 'a', 'b'),
      subject: 'Merge pull request #12 from someone/fix/thing',
    };
    const { rows } = layoutCommitGraph([merge, commit('b', 'a'), commit('a')]);

    expect(rows[1].branch).toBe('fix/thing');
  });

  it('names a lane from a ref found further down, back up to its top', () => {
    const { rows } = layoutCommitGraph([
      tipOf('merge', 'main', 'a', 'c'),
      commit('c', 'b'),
      tipOf('b', 'found', 'a'),
      commit('a'),
    ]);

    expect(rows[1].branch).toBe('found');
    expect(ofKind(rows[0], 'bottom')[1].branch).toBe('found');
  });

  it('leaves a branch it cannot name as null', () => {
    const { rows } = layoutCommitGraph([commit('a')]);
    expect(rows[0].branch).toBeNull();
  });
});

describe('layoutCommitGraph', () => {
  it('handles an empty history', () => {
    expect(layoutCommitGraph([])).toEqual({ rows: [], columnCount: 0 });
  });

  it('draws a straight line in one column for linear history', () => {
    const { rows, columnCount } = layoutCommitGraph([
      commit('c', 'b'),
      commit('b', 'a'),
      commit('a'),
    ]);

    expect(columnCount).toBe(1);
    expect(rows.map((row) => row.column)).toEqual([0, 0, 0]);
    expect(new Set(rows.map((row) => row.color)).size).toBe(1);
  });

  it('starts a tip with no line above it, and ends a root with none below', () => {
    const { rows } = layoutCommitGraph([commit('b', 'a'), commit('a')]);

    expect(ofKind(rows[0], 'top')).toEqual([]);
    expect(ofKind(rows[0], 'bottom')).toHaveLength(1);
    expect(ofKind(rows[1], 'top')).toHaveLength(1);
    expect(ofKind(rows[1], 'bottom')).toEqual([]);
  });

  it('gives two branches their own lanes and joins them at their common parent', () => {
    const { rows, columnCount } = layoutCommitGraph([
      commit('main', 'base'),
      commit('topic', 'base'),
      commit('base'),
    ]);

    expect(columnCount).toBe(2);
    expect(rows.map((row) => row.column)).toEqual([0, 1, 0]);
    expect(withoutColor(ofKind(rows[1], 'through'))).toEqual([{ from: 0, to: 0 }]);
    expect(withoutColor(ofKind(rows[1], 'bottom'))).toEqual([{ from: 1, to: 0 }]);
  });

  it('keeps a branch color until it joins another lane', () => {
    const { rows } = layoutCommitGraph([
      commit('main', 'base'),
      commit('topic', 'base'),
      commit('base'),
    ]);

    expect(rows[1].color).not.toBe(rows[0].color);
    expect(ofKind(rows[1], 'bottom')[0].color).toBe(rows[1].color);
  });

  it('opens a lane for each extra parent of a merge, then closes it', () => {
    const { rows, columnCount } = layoutCommitGraph([
      commit('merge', 'main', 'topic'),
      commit('main', 'base'),
      commit('topic', 'base'),
      commit('base'),
    ]);

    expect(columnCount).toBe(2);
    expect(withoutColor(ofKind(rows[0], 'bottom'))).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 1 },
    ]);
    // The topic lane runs alongside main's commit before reaching its own.
    expect(withoutColor(ofKind(rows[1], 'through'))).toEqual([{ from: 1, to: 1 }]);
    expect(rows[2].column).toBe(1);
  });

  it('colors a merge line with the branch coming in', () => {
    const { rows } = layoutCommitGraph([
      commit('merge', 'main', 'topic'),
      commit('main', 'base'),
      commit('topic', 'base'),
      commit('base'),
    ]);
    const [, incoming] = ofKind(rows[0], 'bottom');

    expect(incoming.color).toBe(rows[2].color);
    expect(incoming.color).not.toBe(rows[0].color);
  });

  it('joins a lane already waiting for the same parent, rather than opening a second', () => {
    const { rows } = layoutCommitGraph([
      commit('a', 'base'),
      commit('b', 'other'),
      commit('other', 'base'),
      commit('base'),
    ]);

    expect(withoutColor(ofKind(rows[2], 'bottom'))).toEqual([{ from: 1, to: 0 }]);
    expect(rows[3].column).toBe(0);
    expect(withoutColor(ofKind(rows[3], 'top'))).toEqual([{ from: 0, to: 0 }]);
    expect(ofKind(rows[3], 'through')).toEqual([]);
  });

  it('points a second parent at a lane already waiting for it', () => {
    const { rows, columnCount } = layoutCommitGraph([
      commit('a', 'shared'),
      commit('b', 'c', 'shared'),
      commit('c', 'shared'),
      commit('shared'),
    ]);

    expect(columnCount).toBe(2);
    expect(withoutColor(ofKind(rows[1], 'bottom'))).toEqual([
      { from: 1, to: 1 },
      { from: 1, to: 0 },
    ]);
  });

  it('reuses a lane once it has closed', () => {
    const { rows, columnCount } = layoutCommitGraph([
      commit('a', 'b'),
      commit('x'),
      commit('b', 'c'),
      commit('y'),
      commit('c'),
    ]);

    expect(columnCount).toBe(2);
    expect(rows[1].column).toBe(1);
    expect(rows[3].column).toBe(1);
  });

  it('keeps lanes open for parents that are not loaded yet', () => {
    const { rows, columnCount } = layoutCommitGraph([commit('a', 'not-loaded')]);

    expect(columnCount).toBe(1);
    expect(ofKind(rows[0], 'bottom')).toHaveLength(1);
  });

  it('cycles through the palette without running out', () => {
    const tips = Array.from({ length: GRAPH_COLOR_COUNT + 2 }, (_, index) => commit(`t${index}`));

    const { rows } = layoutCommitGraph(tips);

    expect(rows.every((row) => row.color >= 0 && row.color < GRAPH_COLOR_COUNT)).toBe(true);
    expect(rows[GRAPH_COLOR_COUNT].color).toBe(rows[0].color);
  });

  it('never leaves a line disconnected between rows', () => {
    const history = [
      commit('m2', 'm1', 'f2'),
      commit('f2', 'f1', 'g1'),
      commit('m1', 'base'),
      commit('g1', 'base'),
      commit('f1', 'base'),
      commit('base', 'root'),
      commit('root'),
    ];

    const { rows } = layoutCommitGraph(history);

    rows.slice(0, -1).forEach((row, index) => {
      const leaving = row.segments
        .filter(({ kind }) => kind !== 'top')
        .map(({ to }) => to)
        .sort();
      const arriving = rows[index + 1].segments
        .filter(({ kind }) => kind !== 'bottom')
        .map(({ from }) => from)
        .sort();
      expect([...new Set(arriving)]).toEqual([...new Set(leaving)]);
    });
  });
});
