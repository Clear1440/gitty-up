/** Finds the commit a branch points at, by its full name, such as main or origin/main. */
export function findBranchTip(commits, branch) {
  return commits.find(({ refs }) =>
    refs.some(({ type, name }) => type !== 'tag' && name === branch),
  );
}

/** Whether a group from groupRefs stands for this branch, by its full name. */
export function groupHasBranch({ name, local, remotes }, branch) {
  return (local && name === branch) || remotes.includes(branch);
}

/**
 * Folds a commit's refs into what to label it with: a branch that is both local and
 * on a remote is one entry saying so, rather than "main" beside "origin/main".
 * Each group is `{ key, name, type, local, remotes }`, in the order the refs came in.
 */
export function groupRefs(refs) {
  const groups = new Map();

  for (const ref of refs) {
    const isTag = ref.type === 'tag';
    const name = ref.localName ?? ref.name;
    const key = `${isTag ? 'tag' : 'branch'}:${name}`;

    if (!groups.has(key)) {
      groups.set(key, { key, name, type: isTag ? 'tag' : 'branch', local: false, remotes: [] });
    }
    const group = groups.get(key);

    if (ref.type === 'remote') {
      group.remotes.push(ref.name);
    } else if (!isTag) {
      group.local = true;
      if (ref.type === 'head') group.type = 'head';
    }
  }

  return [...groups.values()];
}

/** Lower comes first: the selected branch, then HEAD's, local branches, remote ones, tags. */
function stackRank(group, selectedBranch) {
  if (selectedBranch && group.type !== 'tag' && groupHasBranch(group, selectedBranch)) return 0;
  if (group.type === 'head') return 1;
  if (group.type === 'branch') return group.local ? 2 : 3;
  return 4;
}

/**
 * Orders a commit's label groups for stacking, front first: the branch selected in the
 * sidebar or by a click, else the checked out branch, then other local branches, remote
 * branches and tags. Groups that rank the same keep their order.
 */
export function orderForStack(groups, selectedBranch) {
  return groups
    .map((group, index) => ({ group, index, rank: stackRank(group, selectedBranch) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ group }) => group);
}

/**
 * Splits a commit's label groups into the branches, which stack with the front one
 * readable (see orderForStack), and the tags, which always show in full beside them, as
 * they mark versions: "[main] [0.3.0] +1" rather than a tag hidden behind a branch.
 */
export function arrangeLabels(groups, selectedBranch) {
  const ordered = orderForStack(groups, selectedBranch);
  return {
    branches: ordered.filter((group) => group.type !== 'tag'),
    tags: ordered.filter((group) => group.type === 'tag'),
  };
}

/** The branch a label group selects: its local branch, or else its first remote copy. */
export function branchOfGroup(group) {
  return group.local ? group.name : group.remotes[0];
}
