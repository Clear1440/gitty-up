import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api';
import { queryKeys } from './queryKeys.js';

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings(), queryFn: settingsApi.get });
}

/** Saves the appearance. The page shows it straight away, before the server answers. */
export function useSaveAppearance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.setAppearance,
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings(), settings),
  });
}

/**
 * Moves the data to another folder. Everything cached came from the old folder, so
 * it is all thrown away and read again.
 */
export function useSetDataDir() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.setDataDir,
    onSuccess: async (settings) => {
      queryClient.setQueryData(queryKeys.settings(), settings);
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.settings()[0],
      });
    },
  });
}
