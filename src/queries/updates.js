import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updatesApi } from '../api';
import { queryKeys } from './queryKeys.js';

/** How often the status is read while an update downloads, for its progress. */
const PROGRESS_INTERVAL_MS = 500;
/** Otherwise read hourly. The server only asks GitHub again once its last check is stale. */
const IDLE_INTERVAL_MS = 60 * 60_000;

export const isUpdating = (status) => Boolean(status) && status.phase !== 'idle';

/**
 * Whether a newer release can be installed, and how installing it is going. The server
 * checks when the app launches, so this is known as soon as the page loads.
 */
export function useUpdateStatus() {
  return useQuery({
    queryKey: queryKeys.updates(),
    queryFn: updatesApi.get,
    staleTime: Infinity,
    refetchInterval: ({ state }) => (isUpdating(state.data) ? PROGRESS_INTERVAL_MS : IDLE_INTERVAL_MS),
    // Once installing, the app restarts, so failed reads while it goes are expected.
    retry: false,
  });
}

export function useCheckForUpdates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatesApi.check,
    onSuccess: (status) => queryClient.setQueryData(queryKeys.updates(), status),
  });
}

export function useInstallUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatesApi.install,
    onSuccess: (status) => queryClient.setQueryData(queryKeys.updates(), status),
  });
}
