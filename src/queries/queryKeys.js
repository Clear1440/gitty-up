const ROOT = 'repositories';

export const queryKeys = {
  repositoryList: () => [ROOT, 'list'],
  /** Prefix of everything cached for one repository. */
  repository: (id) => [ROOT, 'detail', id],
  status: (id) => [ROOT, 'detail', id, 'status'],
  branches: (id) => [ROOT, 'detail', id, 'branches'],
  commits: (id, ref) => [ROOT, 'detail', id, 'commits', ref ?? 'all-branches'],
  commit: (id, hash) => [ROOT, 'detail', id, 'commit', hash],
  commitDiff: (id, hash, file) => [ROOT, 'detail', id, 'commit', hash, 'diff', file],
  stashes: (id) => [ROOT, 'detail', id, 'stashes'],
  diff: (id, file) => [ROOT, 'detail', id, 'diff', file],
  directories: (path) => ['directories', path ?? null],
};

export const mutationKeys = {
  gitAction: (id) => ['git-action', id],
};
