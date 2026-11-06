import { createContext, useContext } from 'react';

/** What every part of a repository workspace needs: see RepositoryWorkspace. */
export const RepositoryContext = createContext(null);

export function useRepositoryContext() {
  return useContext(RepositoryContext);
}
