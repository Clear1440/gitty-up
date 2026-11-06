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

function useRepositoryListMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
  });
}

export function useLinkRepository() {
  return useRepositoryListMutation(repositoriesApi.link);
}

export function useUnlinkRepository() {
  return useRepositoryListMutation(repositoriesApi.unlink);
}

export function useAddRepositoryStub() {
  return useRepositoryListMutation(repositoriesApi.addStub);
}

export function useCloneRepository(repositoryId) {
  return useRepositoryListMutation((parentPath) =>
    repositoriesApi.clone(repositoryId, parentPath),
  );
}

export function useLocateRepository(repositoryId) {
  return useRepositoryListMutation((path) => repositoriesApi.locate(repositoryId, path));
}

export function useDirectories(path) {
  return useQuery({
    queryKey: queryKeys.directories(path),
    queryFn: () => filesystemApi.listDirectories(path),
    placeholderData: keepPreviousData,
  });
}
