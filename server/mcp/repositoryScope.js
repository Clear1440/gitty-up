import { groupIdsOf } from '../store/repositoryStore.js';

/** Every linked repository, including ones linked later. The default. */
export const ALL_REPOSITORIES = '*';
const GROUP_PREFIX = 'group:';
const REPOSITORY_PREFIX = 'repo:';

/**
 * Whether `scope` says which repositories AI tools may use: a list holding `*` for all of
 * them, or any of `group:<id>` and `repo:<id>`. An empty list allows none.
 */
export function isRepositoryScope(scope) {
  return (
    Array.isArray(scope) &&
    scope.every(
      (entry) =>
        entry === ALL_REPOSITORIES ||
        (typeof entry === 'string' &&
          [GROUP_PREFIX, REPOSITORY_PREFIX].some(
            (prefix) => entry.startsWith(prefix) && entry.length > prefix.length,
          )),
    )
  );
}

const idsWith = (scope, prefix) =>
  new Set(scope.filter((entry) => entry.startsWith(prefix)).map((entry) => entry.slice(prefix.length)));

/**
 * The repository store as the MCP tools see it: only the repositories `scope` allows.
 * A group allows whatever is in it at the time, so a repository added to it later is
 * allowed too, and one taken out no longer is. Ids that no longer exist allow nothing.
 */
export function scopeStore(store, scope) {
  if (scope.includes(ALL_REPOSITORIES)) return store;
  const groupIds = idsWith(scope, GROUP_PREFIX);
  const repositoryIds = idsWith(scope, REPOSITORY_PREFIX);
  const isAllowed = (repository) =>
    repositoryIds.has(repository.id) || groupIdsOf(repository).some((id) => groupIds.has(id));

  return {
    list: async () => (await store.list()).filter(isAllowed),
    // Group names only label the repositories listed, so all of them can be read.
    listGroups: () => store.listGroups(),
  };
}
