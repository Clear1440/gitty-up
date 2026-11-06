/** Finds the commit a branch points at, by its full name, such as main or origin/main. */
export function findBranchTip(commits, branch) {
  return commits.find(({ refs }) =>
    refs.some(({ type, name }) => type !== 'tag' && name === branch),
  );
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
