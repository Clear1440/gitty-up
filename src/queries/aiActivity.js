import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiActivityApi } from '../api';
import { queryKeys } from './queryKeys.js';

/** How often the log is read again while it is on screen, to show calls as they come. */
const REFRESH_INTERVAL_MS = 5_000;

/**
 * What AI tools did, newest first. While `isLive`, as when the MCP server is on, it is
 * read again every few seconds for as long as it is shown.
 */
export function useAiActivity({ isLive = true } = {}) {
  return useQuery({
    queryKey: queryKeys.aiActivity(),
    queryFn: ({ signal }) => aiActivityApi.list({ signal }),
    select: (data) => data.entries,
    refetchInterval: isLive ? REFRESH_INTERVAL_MS : false,
  });
}

export function useClearAiActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiActivityApi.clear,
    onSuccess: () => queryClient.setQueryData(queryKeys.aiActivity(), { entries: [] }),
  });
}

/**
 * Undoes what an AI tool did. Repositories are read again, in case the one it changed has
 * a tab open, along with the log. Also on failure, as an undo can stop part way.
 */
export function useUndoAiActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiActivityApi.undo,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.aiActivity() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allRepositories() }),
      ]),
  });
}
