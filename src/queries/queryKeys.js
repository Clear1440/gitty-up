const ROOT = 'repositories';

export const queryKeys = {
  repositoryList: () => [ROOT, 'list'],
  repositoryGroups: () => [ROOT, 'groups'],
  /** Prefix of everything cached for every repository. */
  allRepositories: () => [ROOT, 'detail'],
  /** Prefix of everything cached for one repository. */
  repository: (id) => [ROOT, 'detail', id],
  status: (id) => [ROOT, 'detail', id, 'status'],
  branches: (id) => [ROOT, 'detail', id, 'branches'],
  remotes: (id) => [ROOT, 'detail', id, 'remotes'],
  commits: (id, ref) => [ROOT, 'detail', id, 'commits', ref ?? 'all-branches'],
  commit: (id, hash) => [ROOT, 'detail', id, 'commit', hash],
  commitDiff: (id, hash, file) => [ROOT, 'detail', id, 'commit', hash, 'diff', file],
  stashes: (id) => [ROOT, 'detail', id, 'stashes'],
  diff: (id, file) => [ROOT, 'detail', id, 'diff', file],
  /**
   * Outside `repository` on purpose: git actions refetch everything under it, and
   * resolving a conflict would then refetch, and fail to find, the conflict just resolved.
   */
  conflict: (id, path) => [ROOT, 'conflict', id, path],
  /** Outside `repository` on purpose: git actions must not spend GitHub's rate limit. */
  pullRequests: (id) => [ROOT, 'pull-requests', id],
  directories: (path) => ['directories', path ?? null],
  repositoryScan: (path) => ['repository-scan', path],
};

export const mutationKeys = {
  gitAction: (id) => ['git-action', id],
};
