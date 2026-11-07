/** The history page's `commit` value that opens the working tree instead of a commit. */
export const UNCOMMITTED = 'uncommitted';

const MONO_PREFIX = 'mono-';

/** A group opened as a mono repo goes by this id, in place of a repository's. */
export const monoRepositoryId = (groupId) => `${MONO_PREFIX}${groupId}`;

export const isMonoRepositoryId = (id) => id.startsWith(MONO_PREFIX);

export const monoGroupId = (id) => id.slice(MONO_PREFIX.length);

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
