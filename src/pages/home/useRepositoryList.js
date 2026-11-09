import { createContext, useContext } from 'react';

/**
 * What every row and section on the repositories page shares: whether the list is
 * condensed, and what is being dragged right now. `drag` is
 * `{ kind: 'repository', repositoryId, fromSectionId }`, `{ kind: 'group', groupId }`
 * or null. Browsers hide what is dragged until the drop, so it is kept here instead.
 */
export const RepositoryListContext = createContext({
  condensed: false,
  drag: null,
  setDrag: () => {},
});

export function useRepositoryList() {
  return useContext(RepositoryListContext);
}

/** Firefox only starts a drag that carries some data, so every drag sets this. */
export const DRAG_TYPE = 'application/x-gitty-up';
