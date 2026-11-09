import { describe, expect, it } from 'vitest';
import { layoutCommitGraph } from './commitGraph.js';
import { interleaveStashes } from './stashRows.js';

const commit = (hash, parents = []) => ({ hash, parents, refs: [] });
const stash = (hash, base, message = hash) => ({
  hash,
  parents: [base, `${hash}-index`],
  message,
  ref: `stash@{${hash}}`,
});

describe('interleaveStashes', () => {
  const commits = [commit('c3', ['c2']), commit('c2', ['c1']), commit('c1')];

  it('puts each stash just above the commit it was made on, newest first', () => {
    const rows = interleaveStashes(commits, [stash('s2', 'c2'), stash('s1', 'c2'), stash('s0', 'c1')]);
    expect(rows.map(({ hash }) => hash)).toEqual([
      'c3',
      'stash:s2',
      'stash:s1',
      'c2',
      'stash:s0',
      'c1',
    ]);
    expect(rows[1]).toMatchObject({ parents: ['c2'], subject: 's2', stash: { hash: 's2' } });
  });

  it('leaves out stashes made on commits that are not loaded', () => {
    expect(interleaveStashes(commits, [stash('s9', 'elsewhere')])).toEqual(commits);
  });

  it('gives the tree a branch for each stash, ending at its commit', () => {
    const rows = interleaveStashes(commits, [stash('s1', 'c2')]);
    const graph = layoutCommitGraph(rows);
    // The stash starts its own lane beside c3's, which both run into c2.
    expect(graph.rows[1].column).not.toBe(graph.rows[0].column);
    expect(graph.rows[2].column).toBe(graph.rows[0].column);
  });
});
