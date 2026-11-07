import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { filesystemApi, repositoriesApi } from '../api';
import { queryKeys } from './queryKeys.js';

export function useRepositories() {
  return useQuery({ queryKey: queryKeys.repositoryList(), queryFn: repositoriesApi.list });
}

export const repositoryQuery = (repositoryId) =>
  queryOptions({
    queryKey: queryKeys.repository(repositoryId),
    queryFn: () => repositoriesApi.get(repositoryId),
  });

export function useRepository(repositoryId) {
  return useQuery(repositoryQuery(repositoryId));
}

export function useRepositoryGroups() {
  return useQuery({ queryKey: queryKeys.repositoryGroups(), queryFn: repositoriesApi.listGroups });
}

function useInvalidatingMutation(mutationFn, ...queryKeysToRefresh) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        queryKeysToRefresh.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });
}

function useRepositoryListMutation(mutationFn) {
  return useInvalidatingMutation(mutationFn, queryKeys.repositoryList());
}

export function useLinkRepository() {
  return useRepositoryListMutation(repositoriesApi.link);
}

/** Can also create a group, so both lists need refreshing. */
export function useLinkRepositories() {
  return useInvalidatingMutation(
    repositoriesApi.linkMany,
    queryKeys.repositoryList(),
    queryKeys.repositoryGroups(),
  );
}

/** Fetches every repository, then rereads all of them, as branches may have moved. */
export function useFetchAllRepositories() {
  return useInvalidatingMutation(
    repositoriesApi.fetchAll,
    queryKeys.repositoryList(),
    queryKeys.allRepositories(),
  );
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

export function useSetRepositoryGroup() {
  return useRepositoryListMutation(({ repositoryId, groupId }) =>
    repositoriesApi.setGroup(repositoryId, groupId),
  );
}

export function useCreateGroup() {
  return useInvalidatingMutation(repositoriesApi.createGroup, queryKeys.repositoryGroups());
}

export function useRenameGroup() {
  return useInvalidatingMutation(
    ({ groupId, name }) => repositoriesApi.renameGroup(groupId, name),
    queryKeys.repositoryGroups(),
  );
}

export function useDeleteGroup() {
  return useInvalidatingMutation(
    repositoriesApi.deleteGroup,
    queryKeys.repositoryList(),
    queryKeys.repositoryGroups(),
  );
}

/** Opens a group as a mono repo on a branch, which may differ from the last time. */
export function useOpenMono() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, branch }) => repositoriesApi.openMono(groupId, branch),
    onSuccess: ({ id }) => queryClient.invalidateQueries({ queryKey: queryKeys.repository(id) }),
  });
}

export function useDirectories(path) {
  return useQuery({
    queryKey: queryKeys.directories(path),
    queryFn: () => filesystemApi.listDirectories(path),
    placeholderData: keepPreviousData,
  });
}

/** Every repository inside `path`, nested ones included. Idle until `path` is set. */
export function useRepositoryScan(path) {
  return useQuery({
    queryKey: queryKeys.repositoryScan(path),
    queryFn: () => filesystemApi.findRepositories(path),
    enabled: Boolean(path),
  });
}
