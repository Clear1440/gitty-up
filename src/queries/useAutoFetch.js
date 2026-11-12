import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { gitApi } from '../api';
import { isFetchDue, isReturnRefreshDue } from './autoFetch.js';
import { mutationKeys, queryKeys } from './queryKeys.js';
import { refreshTogether } from './refreshTogether.js';
import { useFetchAllRepositories } from './repositories.js';

/** When every repository was last fetched automatically, this app start. */
let fetchedAllAt = null;
/** When each repository was last fetched automatically, by id. */
const fetchedAt = new Map();
/** Repositories with a fetch on its way, so one visit never starts two. */
const fetching = new Set();

/** Rereads everything on screen for a repository, in one go, and the repository list. */
function refreshRepository(queryClient, repositoryId) {
  return Promise.all([
    refreshTogether(queryClient, queryKeys.repository(repositoryId)),
    queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
  ]);
}

/** Fetches a repository from its remotes quietly, then refreshes it. */
function fetchRepository(queryClient, repositoryId) {
  if (fetching.has(repositoryId)) return;
  fetching.add(repositoryId);
  fetchedAt.set(repositoryId, Date.now());
  gitApi
    .fetch(repositoryId)
    .then(() => refreshRepository(queryClient, repositoryId))
    .catch(() => {})
    .finally(() => fetching.delete(repositoryId));
}

/**
 * Fetches from the remotes quietly on switching tabs. Entering a repository's tab,
 * or opening a new one, fetches that repository every time. The repositories page
 * fetches every repository, at most once a minute. Failures are left for a manual
 * fetch to report.
 *
 * Coming back to the app, from another app or after minimizing it, rereads the open
 * tab straight away, so changes made elsewhere, such as a commit in a terminal, show
 * up. It also fetches from the remotes if that hasn't happened in the last minute.
 */
export function useAutoFetch(activeRepositoryId) {
  const queryClient = useQueryClient();
  const { mutate: fetchAll } = useFetchAllRepositories();

  useEffect(() => {
    if (activeRepositoryId === null) {
      const now = Date.now();
      if (!isFetchDue(fetchedAllAt, now)) return;
      // Marked before it finishes, so a failing remote is not retried on every visit.
      fetchedAllAt = now;
      fetchAll();
      return;
    }
    fetchRepository(queryClient, activeRepositoryId);
  }, [activeRepositoryId, fetchAll, queryClient]);

  useEffect(() => {
    let refreshedAt = null;

    // Switching to another app and back fires `focus` but leaves the page visible, so
    // React Query's own refetch on focus, which waits for it to become visible, misses it.
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!isReturnRefreshDue(refreshedAt, now)) return;
      refreshedAt = now;

      if (activeRepositoryId === null) {
        if (isFetchDue(fetchedAllAt, now)) {
          fetchedAllAt = now;
          fetchAll();
        } else {
          refreshTogether(queryClient, queryKeys.repositoryList()).catch(() => {});
        }
        return;
      }

      // A git action under way refreshes everything itself once it's done.
      const isActing = queryClient.isMutating({
        mutationKey: mutationKeys.gitAction(activeRepositoryId),
      });
      if (isActing > 0) return;
      refreshRepository(queryClient, activeRepositoryId).catch(() => {});
      if (isFetchDue(fetchedAt.get(activeRepositoryId) ?? null, now)) {
        fetchRepository(queryClient, activeRepositoryId);
      }
    };

    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [activeRepositoryId, fetchAll, queryClient]);
}
