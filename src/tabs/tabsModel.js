/** Opens a tab, or updates where an open tab should return to. */
export function rememberTab(tabs, repositoryId, path) {
  const existing = tabs.find((tab) => tab.repositoryId === repositoryId);
  if (!existing) return [...tabs, { repositoryId, path }];
  if (existing.path === path) return tabs;
  return tabs.map((tab) => (tab === existing ? { ...tab, path } : tab));
}

/** Opens a tab without touching one that is already open, so it keeps its place. */
export function openTab(tabs, repositoryId, path) {
  return tabs.some((tab) => tab.repositoryId === repositoryId)
    ? tabs
    : rememberTab(tabs, repositoryId, path);
}

/** Moves a tab to just before the target tab, or just after it when `after` is set. */
export function moveTab(tabs, repositoryId, targetId, after = false) {
  const moved = tabs.find((tab) => tab.repositoryId === repositoryId);
  const isKnownTarget = tabs.some((tab) => tab.repositoryId === targetId);
  if (!moved || !isKnownTarget || repositoryId === targetId) return tabs;

  const others = tabs.filter((tab) => tab !== moved);
  const index = others.findIndex((tab) => tab.repositoryId === targetId) + (after ? 1 : 0);
  return [...others.slice(0, index), moved, ...others.slice(index)];
}

export function removeTab(tabs, repositoryId) {
  return tabs.filter((tab) => tab.repositoryId !== repositoryId);
}

/** The tab to show after closing one: the next tab, else the previous, else none. */
export function findNeighbourTab(tabs, repositoryId) {
  const index = tabs.findIndex((tab) => tab.repositoryId === repositoryId);
  return tabs[index + 1] ?? tabs[index - 1] ?? null;
}
