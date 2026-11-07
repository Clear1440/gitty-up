/**
 * The branches a group could open on, with the repositories each would take in, the
 * likeliest first. Stubs, missing folders and detached HEADs are on no branch at all.
 */
export function findMonoBranches(repositories) {
  const byBranch = new Map();
  for (const repository of repositories) {
    const branch = repository.summary?.branch;
    if (branch) byBranch.set(branch, [...(byBranch.get(branch) ?? []), repository]);
  }

  return [...byBranch]
    .map(([branch, members]) => ({ branch, repositories: members }))
    .sort(
      (a, b) => b.repositories.length - a.repositories.length || a.branch.localeCompare(b.branch),
    );
}

/** Why a repository would be left out when opening on `branch`, for showing to the user. */
export function describeLeftOut(repository) {
  if (!repository.available) return 'not on this machine';
  if (repository.summary.detached) return 'detached HEAD';
  return `on ${repository.summary.branch}`;
}
