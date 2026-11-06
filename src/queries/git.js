import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { gitApi } from '../api';
import { queryKeys } from './queryKeys.js';

const COMMIT_PAGE_SIZE = 100;
const STATUS_POLL_MS = 5_000;

export function useStatus(repositoryId) {
  return useQuery({
    queryKey: queryKeys.status(repositoryId),
    queryFn: () => gitApi.getStatus(repositoryId),
    // Files also change outside the app, in editors and terminals.
    refetchInterval: STATUS_POLL_MS,
  });
}

export function useBranches(repositoryId) {
  return useQuery({
    queryKey: queryKeys.branches(repositoryId),
    queryFn: () => gitApi.getBranches(repositoryId),
  });
}

export function useCommits(repositoryId, ref) {
  return useInfiniteQuery({
    queryKey: queryKeys.commits(repositoryId, ref),
    queryFn: ({ pageParam }) =>
      gitApi.getCommits(repositoryId, { ref, limit: COMMIT_PAGE_SIZE, skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < COMMIT_PAGE_SIZE ? undefined : allPages.length * COMMIT_PAGE_SIZE,
    select: (data) => data.pages.flat(),
  });
}

export function useStashes(repositoryId) {
  return useQuery({
    queryKey: queryKeys.stashes(repositoryId),
    queryFn: () => gitApi.getStashes(repositoryId),
  });
}

/** `file` is `{ path, staged, untracked }`, or null when nothing is selected. */
export function useDiff(repositoryId, file, { fullFile }) {
  return useQuery({
    queryKey: queryKeys.diff(repositoryId, { ...file, fullFile }),
    queryFn: () => gitApi.getDiff(repositoryId, { ...file, fullFile }),
    enabled: Boolean(file),
  });
}
