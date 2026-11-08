import { MonoIdHelper } from './utils/MonoIdHelper.js';

/** The history page's `commit` value that opens the working tree instead of a commit. */
export const UNCOMMITTED = 'uncommitted';

/** @deprecated Use MonoIdHelper.fromGroupId. */
export const monoRepositoryId = MonoIdHelper.fromGroupId;

/** @deprecated Use MonoIdHelper.isMonoId. */
export const isMonoRepositoryId = MonoIdHelper.isMonoId;

/** @deprecated Use MonoIdHelper.toGroupId. */
export const monoGroupId = MonoIdHelper.toGroupId;

const historyWith = (repositoryId, params) =>
  `/repositories/${repositoryId}/history?${new URLSearchParams(params)}`;

/** Builds the app's URLs, so route shapes live in one place. */
export const paths = {
  home: () => '/',
  settings: () => '/settings',
  repository: (repositoryId) => `/repositories/${repositoryId}`,
  history: (repositoryId, ref) =>
    ref ? historyWith(repositoryId, { ref }) : `/repositories/${repositoryId}/history`,
  /** Every branch's history, with this branch's latest commit scrolled to and marked. */
  focusBranch: (repositoryId, branch) => historyWith(repositoryId, { focus: branch }),
  /** The three-way editor for one conflicted file. */
  resolveConflict: (repositoryId, path) =>
    `/repositories/${repositoryId}/resolve?${new URLSearchParams({ path })}`,
  uncommitted: (repositoryId) => historyWith(repositoryId, { commit: UNCOMMITTED }),
};
