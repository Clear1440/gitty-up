/** The history page's `commit` value that opens the working tree instead of a commit. */
export const UNCOMMITTED = 'uncommitted';

/** Builds the app's URLs, so route shapes live in one place. */
export const paths = {
  home: () => '/',
  repository: (repositoryId) => `/repositories/${repositoryId}`,
  history: (repositoryId, ref) => {
    const base = `/repositories/${repositoryId}/history`;
    return ref ? `${base}?${new URLSearchParams({ ref })}` : base;
  },
  /** Every branch's history, with this branch's latest commit scrolled to and marked. */
  focusBranch: (repositoryId, branch) =>
    `/repositories/${repositoryId}/history?${new URLSearchParams({ focus: branch })}`,
  uncommitted: (repositoryId) =>
    `/repositories/${repositoryId}/history?${new URLSearchParams({ commit: UNCOMMITTED })}`,
};
