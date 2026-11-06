import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { filesystemApi, repositoriesApi } from '../api';
import { queryKeys } from './queryKeys.js';

export function useRepositories() {
  return useQuery({ queryKey: queryKeys.repositoryList(), queryFn: repositoriesApi.list });
}

export function useRepository(repositoryId) {
  return useQuery({
    queryKey: queryKeys.repository(repositoryId),
    queryFn: () => repositoriesApi.get(repositoryId),
  });
}

export function useLinkRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: repositoriesApi.link,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
  });
}

export function useUnlinkRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: repositoriesApi.unlink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
  });
}

export function useDirectories(path) {
  return useQuery({
    queryKey: queryKeys.directories(path),
    queryFn: () => filesystemApi.listDirectories(path),
    placeholderData: keepPreviousData,
  });
}
