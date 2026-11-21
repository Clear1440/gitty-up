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

const MCP_MUTATION_KEY = ['settings', 'mcp'];

/**
 * Turns the MCP server for AI tools on or off, or changes what it may do. The page shows
 * the change at once, so several quick picks in a list each build on the one before.
 */
export function useSetMcp() {
  const queryClient = useQueryClient();
  const key = queryKeys.settings();
  return useMutation({
    mutationKey: MCP_MUTATION_KEY,
    mutationFn: settingsApi.setMcp,
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, (settings) =>
        settings && { ...settings, mcp: { ...settings.mcp, ...changes } },
      );
    },
    onSuccess: (settings) => {
      // An earlier answer must not undo a later change still on its way.
      if (queryClient.isMutating({ mutationKey: MCP_MUTATION_KEY }) === 1) {
        queryClient.setQueryData(key, settings);
      }
    },
    onError: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Replaces the MCP server's token, so every AI tool needs its config again. */
export function useRegenerateMcpToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.regenerateMcpToken,
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
