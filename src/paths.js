/** Builds the app's URLs, so route shapes live in one place. */
export const paths = {
  home: () => '/',
  repository: (repositoryId) => `/repositories/${repositoryId}`,
  history: (repositoryId, ref) => {
    const base = `/repositories/${repositoryId}/history`;
    return ref ? `${base}?${new URLSearchParams({ ref })}` : base;
  },
  changes: (repositoryId) => `/repositories/${repositoryId}/changes`,
};
