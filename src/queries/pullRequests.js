import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gitApi } from '../api';
import { cancellable } from './cancellable.js';
import { queryKeys } from './queryKeys.js';

// Remotes rarely change, and git actions reread them anyway.
const REMOTE_HOSTS_STALE_MS = 5 * 60_000;

/** Which remotes are on a host pull requests can be opened on: see gitApi.getRemoteHosts. */
export function useRemoteHosts(repositoryId) {
  return useQuery({
    queryKey: queryKeys.remoteHosts(repositoryId),
    queryFn: cancellable(({ signal }) => gitApi.getRemoteHosts(repositoryId, { signal })),
    staleTime: REMOTE_HOSTS_STALE_MS,
  });
}

/**
 * What a new pull request for `branch` starts out as, worked out against `base`, or the
 * remote's default branch when that is left out. Keeps showing the last answer while
 * another base is read, so the dialog doesn't empty out.
 */
export function usePullRequestDraft(repositoryId, { branch, remote, base }) {
  return useQuery({
    queryKey: queryKeys.pullRequestDraft(repositoryId, branch, remote, base),
    queryFn: cancellable(({ signal }) =>
      gitApi.getPullRequestDraft(repositoryId, { branch, remote, base }, { signal }),
    ),
    placeholderData: keepPreviousData,
  });
}

/**
 * Opens a pull request. Resolves with where it is, or the host's page that finishes it,
 * and rereads the open pull requests so its label shows.
 */
export function useCreatePullRequest(repositoryId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => gitApi.createPullRequest(repositoryId, input),
    onSuccess: ({ created }) => {
      if (!created) return undefined;
      return queryClient.invalidateQueries({ queryKey: queryKeys.pullRequests(repositoryId) });
    },
  });
}
