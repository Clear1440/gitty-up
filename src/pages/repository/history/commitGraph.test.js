import { describe, expect, it } from 'vitest';
import { GRAPH_COLOR_COUNT, layoutCommitGraph } from './commitGraph.js';

const commit = (hash, ...parents) => ({ hash, parents });
const ofKind = (row, kind) => row.segments.filter((segment) => segment.kind === kind);
const withoutColor = (segments) => segments.map(({ from, to }) => ({ from, to }));

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
    expect(rows.map((row) => row.column)).toEqual([0, 0 + 1, 0]);
    expect(withoutColor(ofKind(rows[1], 'through'))).toEqual([]);
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

  it('merges lanes when both are waiting for the same commit', () => {
    const { rows } = layoutCommitGraph([
      commit('a', 'base'),
      commit('b', 'other'),
      commit('other', 'base'),
      commit('base'),
    ]);

    expect(rows[3].column).toBe(0);
    expect(withoutColor(ofKind(rows[3], 'top'))).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 0 },
    ]);
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
