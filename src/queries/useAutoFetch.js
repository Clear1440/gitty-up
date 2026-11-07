import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { gitApi } from '../api';
import { isFetchAllDue } from './autoFetch.js';
import { queryKeys } from './queryKeys.js';
import { useFetchAllRepositories } from './repositories.js';

/** When every repository was last fetched automatically, this app start. */
let fetchedAllAt = null;
/** Repositories with a fetch on its way, so one visit never starts two. */
const fetching = new Set();

/**
 * Fetches from the remotes quietly on switching tabs. Entering a repository's tab,
 * or opening a new one, fetches that repository every time. The repositories page
 * fetches every repository, at most once a minute. Failures are left for a manual
 * fetch to report.
 */
export function useAutoFetch(activeRepositoryId) {
  const queryClient = useQueryClient();
  const { mutate: fetchAll } = useFetchAllRepositories();

  useEffect(() => {
    if (activeRepositoryId === null) {
      const now = Date.now();
      if (!isFetchAllDue(fetchedAllAt, now)) return;
      // Marked before it finishes, so a failing remote is not retried on every visit.
      fetchedAllAt = now;
      fetchAll();
      return;
    }

    if (fetching.has(activeRepositoryId)) return;
    fetching.add(activeRepositoryId);
    gitApi
      .fetch(activeRepositoryId)
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.repository(activeRepositoryId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
        ]),
      )
      .catch(() => {})
      .finally(() => fetching.delete(activeRepositoryId));
  }, [activeRepositoryId, fetchAll, queryClient]);
}
