import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updatesApi } from '../api';
import { queryKeys } from './queryKeys.js';

/** How often the status is read while an update downloads, for its progress. */
const PROGRESS_INTERVAL_MS = 500;
/** Otherwise read hourly. The server only asks GitHub again once its last check is stale. */
const IDLE_INTERVAL_MS = 60 * 60_000;

const UPDATING_PHASES = ['downloading', 'installing'];

/** Whether an update is downloading or installing. A status without a phase is neither. */
export const isUpdating = (status) => UPDATING_PHASES.includes(status?.phase);

/**
 * How long until the status is read again: often while an update installs, to show its
 * progress, hourly otherwise, and never when the app cannot update itself (in a browser,
 * served by `npm run dev` or `npm start`), as the answer will not change.
 */
export function updateStatusInterval(status) {
  if (status?.supported === false) return false;
  return isUpdating(status) ? PROGRESS_INTERVAL_MS : IDLE_INTERVAL_MS;
}

/**
 * Whether a newer release can be installed, and how installing it is going. The server
 * checks when the app launches, so this is known as soon as the page loads.
 */
export function useUpdateStatus() {
  return useQuery({
    queryKey: queryKeys.updates(),
    queryFn: updatesApi.get,
    staleTime: Infinity,
    refetchInterval: ({ state }) => updateStatusInterval(state.data),
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
