/** Opens a tab, or updates where an open tab should return to. */
export function rememberTab(tabs, repositoryId, path) {
  const existing = tabs.find((tab) => tab.repositoryId === repositoryId);
  if (!existing) return [...tabs, { repositoryId, path }];
  if (existing.path === path) return tabs;
  return tabs.map((tab) => (tab === existing ? { ...tab, path } : tab));
}

export function removeTab(tabs, repositoryId) {
  return tabs.filter((tab) => tab.repositoryId !== repositoryId);
}

/** The tab to show after closing one: the next tab, else the previous, else none. */
export function findNeighbourTab(tabs, repositoryId) {
  const index = tabs.findIndex((tab) => tab.repositoryId === repositoryId);
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}
