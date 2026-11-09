import { StashSelection } from '../../../paths.js';

/**
 * Puts each stash in the history, just above the commit it was made on, so the tree
 * draws it as a short branch off that commit. Stashes are newest first, and so are
 * the ones sharing a commit here. A stash whose commit isn't loaded is left out, as
 * the tree would have nothing to join it to.
 *
 * A stash entry stands in for a commit, with `stash` holding the stash itself.
 */
export function interleaveStashes(commits, stashes) {
  if (stashes.length === 0) return commits;

  const byBase = new Map();
  for (const stash of stashes) {
    const base = stash.parents?.[0];
    if (!stash.hash || !base) continue;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push({
      hash: StashSelection.toValue(stash.hash),
      parents: [base],
      refs: [],
      subject: stash.message,
      stash,
    });
  }

  return commits.flatMap((commit) => [...(byBase.get(commit.hash) ?? []), commit]);
}
