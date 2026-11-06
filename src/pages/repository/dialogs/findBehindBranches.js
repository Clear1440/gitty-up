/** Says which of `names` are behind their remote, for the server's check before a merge. */
export function findBehindBranches(localBranches, names) {
  return localBranches
    .filter(({ name, behind }) => names.includes(name) && behind > 0)
    .map(({ name, behind, upstream }) => {
      return `${name} is ${behind} ${behind === 1 ? 'commit' : 'commits'} behind ${upstream}.`;
    });
}
