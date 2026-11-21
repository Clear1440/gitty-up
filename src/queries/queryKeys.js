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
  remoteHosts: (id) => [ROOT, 'detail', id, 'remote-hosts'],
  /** Inside `repository`, so pushing the branch from the dialog rereads whether it is pushed. */
  pullRequestDraft: (id, branch, remote, base) => [
    ROOT,
    'detail',
    id,
    'pull-request-draft',
    branch,
    remote,
    base ?? null,
  ],
  commits: (id, ref) => [ROOT, 'detail', id, 'commits', ref ?? 'all-branches'],
  commit: (id, hash) => [ROOT, 'detail', id, 'commit', hash],
  commitDiff: (id, hash, file) => [ROOT, 'detail', id, 'commit', hash, 'diff', file],
  tags: (id) => [ROOT, 'detail', id, 'tags'],
  stashes: (id) => [ROOT, 'detail', id, 'stashes'],
  /** Inside `repository`, so any git action rereads it: a reset or amend adds to it. */
  reflog: (id) => [ROOT, 'detail', id, 'reflog'],
  worktrees: (id) => [ROOT, 'detail', id, 'worktrees'],
  stash: (id, hash) => [ROOT, 'detail', id, 'stash', hash],
  stashDiff: (id, hash, file) => [ROOT, 'detail', id, 'stash', hash, 'diff', file],
  /** Inside `repository`, so a checkout rereads the branch's own .gitty file. */
  scripts: (id) => [ROOT, 'detail', id, 'scripts'],
  diff: (id, file) => [ROOT, 'detail', id, 'diff', file],
  spanningBranches: (id) => [ROOT, 'detail', id, 'spanning-branches'],
  spanPlan: (id, branch) => [ROOT, 'detail', id, 'span-plan', branch],
  mergePreview: (id, source, target) => [ROOT, 'detail', id, 'merge-preview', source, target],
  /**
   * Outside `repository` on purpose: git actions refetch everything under it, and
   * resolving a conflict would then refetch, and fail to find, the conflict just resolved.
   */
  conflict: (id, path) => [ROOT, 'conflict', id, path],
  /** Outside `repository` on purpose: it asks the remotes, which git actions must not redo. */
  tagRemotes: (id, name) => [ROOT, 'tag-remotes', id, name],
  /** Outside `repository` on purpose: git actions must not spend GitHub's rate limit. */
  pullRequests: (id) => [ROOT, 'pull-requests', id],
  directories: (path) => ['directories', path ?? null],
  repositoryScan: (path) => ['repository-scan', path],
  settings: () => ['settings'],
  aiActivity: () => ['ai-activity'],
  updates: () => ['updates'],
};

export const mutationKeys = {
  gitAction: (id) => ['git-action', id],
  fetchAll: () => ['fetch-all'],
};
