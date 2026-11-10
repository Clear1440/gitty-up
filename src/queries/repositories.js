import {
  keepPreviousData,
  queryOptions,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { filesystemApi, repositoriesApi } from '../api';
import { mutationKeys, queryKeys } from './queryKeys.js';

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
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.fetchAll(),
    mutationFn: repositoriesApi.fetchAll,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allRepositories() }),
      ]),
  });
}

/** True while any fetch of every repository runs, including one started automatically. */
export function useIsFetchingAllRepositories() {
  return useIsMutating({ mutationKey: mutationKeys.fetchAll() }) > 0;
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

/**
 * A mutation that shows its result at once, by writing `apply(cached, variables)` into
 * the cache, then puts the cache back if the server turns it down. Dragging feels
 * instant this way. The query is reread either way, to settle on what was saved.
 */
function useOptimisticMutation(queryKey, mutationFn, apply) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      if (previous) queryClient.setQueryData(queryKey, apply(previous, variables));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

const updateRepository = (repositories, repositoryId, changes) =>
  repositories.map((repository) =>
    repository.id === repositoryId ? { ...repository, ...changes } : repository,
  );

/** Puts a repository in exactly the groups given. An empty list leaves it ungrouped. */
export function useSetRepositoryGroups() {
  return useOptimisticMutation(
    queryKeys.repositoryList(),
    ({ repositoryId, groupIds }) => repositoriesApi.setGroups(repositoryId, groupIds),
    (repositories, { repositoryId, groupIds }) =>
      updateRepository(repositories, repositoryId, { groupIds }),
  );
}

/** Labels a group with a color, or clears it with null. */
export function useSetGroupColor() {
  return useOptimisticMutation(
    queryKeys.repositoryGroups(),
    ({ groupId, color }) => repositoriesApi.setGroupColor(groupId, color),
    (groups, { groupId, color }) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, color: color ?? undefined } : group,
      ),
  );
}

/** Puts the groups in the order of the ids given. */
export function useReorderGroups() {
  return useOptimisticMutation(
    queryKeys.repositoryGroups(),
    repositoriesApi.reorderGroups,
    // As the server does: groups left out keep their order after those named.
    (groups, ids) => [
      ...ids.flatMap((id) => groups.find((group) => group.id === id) ?? []),
      ...groups.filter((group) => !ids.includes(group.id)),
    ],
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
