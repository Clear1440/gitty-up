import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { gitApi } from '../api';
import { cancellable } from './cancellable.js';
import { readPages } from './pages.js';
import { queryKeys } from './queryKeys.js';

const COMMIT_PAGE_SIZE = 100;
/** The most commits the server sends for one request. */
const MAX_COMMITS_PER_REQUEST = 500;
const PULL_REQUESTS_STALE_MS = 5 * 60_000;
/**
 * Diffs are the biggest answers there are, one per file looked at, so they are let go
 * soon after leaving them rather than kept as long as the rest. Going back to a recent
 * one still shows it at once.
 */
const DIFF_GC_MS = 2 * 60_000;

export const statusQuery = (repositoryId) =>
  queryOptions({
    queryKey: queryKeys.status(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getStatus(repositoryId, { signal })),
  });

export const branchesQuery = (repositoryId) =>
  queryOptions({
    queryKey: queryKeys.branches(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getBranches(repositoryId, { signal })),
  });

export const stashesQuery = (repositoryId) =>
  queryOptions({
    queryKey: queryKeys.stashes(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getStashes(repositoryId, { signal })),
  });

/**
 * One page per fetch. `ref` is a branch, or undefined for every branch. `meta.readPages`
 * rereads the pages loaded so far in a few large requests rather than one per page:
 * see refreshTogether.
 */
export const commitsQuery = (repositoryId, ref) =>
  infiniteQueryOptions({
    queryKey: queryKeys.commits(repositoryId, ref),
    queryFn: cancellable(({ pageParam, signal }) =>
      gitApi.getCommits(
        repositoryId,
        { ref, limit: COMMIT_PAGE_SIZE, skip: pageParam },
        { signal },
      ),
    ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < COMMIT_PAGE_SIZE ? undefined : allPages.length * COMMIT_PAGE_SIZE,
    meta: {
      readPages: (pageCount, { signal }) =>
        readPages(
          ({ limit, skip }) => gitApi.getCommits(repositoryId, { ref, limit, skip }, { signal }),
          { pageCount, pageSize: COMMIT_PAGE_SIZE, maxPerRequest: MAX_COMMITS_PER_REQUEST },
        ),
    },
  });

/**
 * Not polled. Changes made outside the app, in editors and terminals, show on switching
 * to the tab or coming back to the window (see useAutoFetch), and after any git action.
 */
export function useStatus(repositoryId) {
  return useQuery(statusQuery(repositoryId));
}

export function useBranches(repositoryId) {
  return useQuery(branchesQuery(repositoryId));
}

export function useRemotes(repositoryId) {
  return useQuery({
    queryKey: queryKeys.remotes(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getRemotes(repositoryId, { signal })),
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
    queryFn: cancellable(({ signal }) => gitApi.getCommitDetails(repositoryId, hash, { signal })),
  });
}

export function useCommitDiff(repositoryId, hash, file, { fullFile }) {
  return useQuery({
    queryKey: queryKeys.commitDiff(repositoryId, hash, { ...file, fullFile }),
    queryFn: cancellable(({ signal }) =>
      gitApi.getCommitDiff(repositoryId, hash, { ...file, fullFile }, { signal }),
    ),
    gcTime: DIFF_GC_MS,
    enabled: Boolean(file),
  });
}

/** Open pull requests, which change on GitHub rather than here, so these are read rarely. */
export function usePullRequests(repositoryId) {
  return useQuery({
    queryKey: queryKeys.pullRequests(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getPullRequests(repositoryId, { signal })),
    staleTime: PULL_REQUESTS_STALE_MS,
  });
}

export function useStashes(repositoryId) {
  return useQuery(stashesQuery(repositoryId));
}

/** The repository's working trees, the main one first. */
export function useWorktrees(repositoryId) {
  return useQuery({
    queryKey: queryKeys.worktrees(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getWorktrees(repositoryId, { signal })),
  });
}

/** A stash's files. A stash never changes, so its hash is enough to cache it by. */
export function useStashDetails(repositoryId, hash) {
  return useQuery({
    queryKey: queryKeys.stash(repositoryId, hash),
    queryFn: cancellable(({ signal }) => gitApi.getStashDetails(repositoryId, hash, { signal })),
  });
}

export function useStashDiff(repositoryId, hash, file, { fullFile }) {
  return useQuery({
    queryKey: queryKeys.stashDiff(repositoryId, hash, { ...file, fullFile }),
    queryFn: cancellable(({ signal }) =>
      gitApi.getStashDiff(repositoryId, hash, { ...file, fullFile }, { signal }),
    ),
    gcTime: DIFF_GC_MS,
    enabled: Boolean(file),
  });
}

/** What the repository's .gitty file offers to run. `found` is false when it has none. */
export function useScripts(repositoryId) {
  return useQuery({
    queryKey: queryKeys.scripts(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getScripts(repositoryId, { signal })),
  });
}

/**
 * Every version of a conflicted file. Read once: refetching while someone is resolving
 * it would reset their work, and resolving it ends the conflict anyway.
 */
export function useConflict(repositoryId, path) {
  return useQuery({
    queryKey: queryKeys.conflict(repositoryId, path),
    queryFn: cancellable(({ signal }) => gitApi.getConflict(repositoryId, { path }, { signal })),
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
    queryFn: cancellable(({ signal }) =>
      gitApi.getDiff(repositoryId, { ...file, fullFile }, { signal }),
    ),
    gcTime: DIFF_GC_MS,
    enabled: Boolean(file),
  });
}

/**
 * What merging `source` into `target` would bring in. Waits for both, and keeps the last
 * answer on screen while the next branch's loads, so the dialog doesn't jump.
 */
export function useMergePreview(repositoryId, source, target) {
  return useQuery({
    queryKey: queryKeys.mergePreview(repositoryId, source, target),
    queryFn: cancellable(({ signal }) =>
      gitApi.previewMerge(repositoryId, { source, target }, { signal }),
    ),
    enabled: Boolean(source && target),
    placeholderData: (previous) => previous,
    retry: false,
  });
}

/** Branches that some of a mono repo's repositories have. None outside a mono repo. */
export function useSpanningBranches(repositoryId, { enabled }) {
  return useQuery({
    queryKey: queryKeys.spanningBranches(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getSpanningBranches(repositoryId, { signal })),
    enabled,
  });
}

/** Where each repository would go to work on `branch` across a mono repo's group. */
export function useSpanPlan(repositoryId, branch) {
  return useQuery({
    queryKey: queryKeys.spanPlan(repositoryId, branch),
    queryFn: cancellable(({ signal }) => gitApi.getSpanPlan(repositoryId, { branch }, { signal })),
    // Read fresh each time, as staged changes anywhere decide whether it can go ahead.
    staleTime: 0,
    retry: false,
  });
}
