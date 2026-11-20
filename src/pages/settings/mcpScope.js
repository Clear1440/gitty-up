/** Every repository, including ones linked later. */
export const ALL_REPOSITORIES = '*';

export const groupEntry = (group) => `group:${group.id}`;
export const repositoryEntry = (repository) => `repo:${repository.id}`;

/**
 * The scope after the dropdown changed from `previous` to `next`. Picking All drops the
 * rest, and picking anything else drops All, as the two can't mean anything together.
 */
export function nextScope(previous, next) {
  const pickedAll = next.includes(ALL_REPOSITORIES) && !previous.includes(ALL_REPOSITORIES);
  if (pickedAll) return [ALL_REPOSITORIES];
  return next.length > 1 ? next.filter((entry) => entry !== ALL_REPOSITORIES) : next;
}

/** The linked repositories `scope` lets AI tools use, as the server works it out. */
export function allowedRepositories(scope, repositories) {
  const linked = repositories.filter((repository) => repository.path);
  if (scope.includes(ALL_REPOSITORIES)) return linked;
  const entries = new Set(scope);
  return linked.filter(
    (repository) =>
      entries.has(repositoryEntry(repository)) ||
      (repository.groupIds ?? []).some((id) => entries.has(groupEntry({ id }))),
  );
}
