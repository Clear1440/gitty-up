import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { gitApi } from '../api';
import { queryKeys } from './queryKeys.js';

const COMMIT_PAGE_SIZE = 100;
const STATUS_POLL_MS = 5_000;
const PULL_REQUESTS_STALE_MS = 5 * 60_000;

export const statusQuery = (repositoryId) =>
  queryOptions({
    queryKey: queryKeys.status(repositoryId),
    queryFn: () => gitApi.getStatus(repositoryId),
  });

export const branchesQuery = (repositoryId) =>
  queryOptions({
    queryKey: queryKeys.branches(repositoryId),
    queryFn: () => gitApi.getBranches(repositoryId),
  });

export const stashesQuery = (repositoryId) =>
  queryOptions({
    queryKey: queryKeys.stashes(repositoryId),
    queryFn: () => gitApi.getStashes(repositoryId),
  });

/** One page per fetch. `ref` is a branch, or undefined for every branch. */
export const commitsQuery = (repositoryId, ref) =>
  infiniteQueryOptions({
    queryKey: queryKeys.commits(repositoryId, ref),
    queryFn: ({ pageParam }) =>
      gitApi.getCommits(repositoryId, { ref, limit: COMMIT_PAGE_SIZE, skip: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < COMMIT_PAGE_SIZE ? undefined : allPages.length * COMMIT_PAGE_SIZE,
  });

export function useStatus(repositoryId) {
  return useQuery({
    ...statusQuery(repositoryId),
    // Files also change outside the app, in editors and terminals.
    refetchInterval: STATUS_POLL_MS,
  });
}

export function useBranches(repositoryId) {
  return useQuery(branchesQuery(repositoryId));
}

export function useRemotes(repositoryId) {
  return useQuery({
    queryKey: queryKeys.remotes(repositoryId),
    queryFn: () => gitApi.getRemotes(repositoryId),
  });
}

export function useCommits(repositoryId, ref) {
  return useInfiniteQuery({
    ...commitsQuery(repositoryId, ref),
    select: (data) => data.pages.flat(),
  });
}

export function useCommitDetails(repositoryId, hash) {
  return useQuery({
    queryKey: queryKeys.commit(repositoryId, hash),
    queryFn: () => gitApi.getCommitDetails(repositoryId, hash),
  });
}

export function useCommitDiff(repositoryId, hash, file, { fullFile }) {
  return useQuery({
    queryKey: queryKeys.commitDiff(repositoryId, hash, { ...file, fullFile }),
    queryFn: () => gitApi.getCommitDiff(repositoryId, hash, { ...file, fullFile }),
    enabled: Boolean(file),
  });
}

/** Open pull requests, which change on GitHub rather than here, so these are read rarely. */
export function usePullRequests(repositoryId) {
  return useQuery({
    queryKey: queryKeys.pullRequests(repositoryId),
    queryFn: () => gitApi.getPullRequests(repositoryId),
    staleTime: PULL_REQUESTS_STALE_MS,
  });
}

export function useStashes(repositoryId) {
  return useQuery(stashesQuery(repositoryId));
}

/** A stash's files. A stash never changes, so its hash is enough to cache it by. */
export function useStashDetails(repositoryId, hash) {
  return useQuery({
    queryKey: queryKeys.stash(repositoryId, hash),
    queryFn: () => gitApi.getStashDetails(repositoryId, hash),
  });
}

export function useStashDiff(repositoryId, hash, file, { fullFile }) {
  return useQuery({
    queryKey: queryKeys.stashDiff(repositoryId, hash, { ...file, fullFile }),
    queryFn: () => gitApi.getStashDiff(repositoryId, hash, { ...file, fullFile }),
    enabled: Boolean(file),
  });
}

/** What the repository's .gitty file offers to run. `found` is false when it has none. */
export function useScripts(repositoryId) {
  return useQuery({
    queryKey: queryKeys.scripts(repositoryId),
    queryFn: () => gitApi.getScripts(repositoryId),
  });
}

/**
 * Every version of a conflicted file. Read once: refetching while someone is resolving
 * it would reset their work, and resolving it ends the conflict anyway.
 */
export function useConflict(repositoryId, path) {
  return useQuery({
    queryKey: queryKeys.conflict(repositoryId, path),
    queryFn: () => gitApi.getConflict(repositoryId, { path }),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
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
