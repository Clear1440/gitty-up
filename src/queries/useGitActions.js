import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useCallback } from 'react';
import { gitApi } from '../api';
import { mutationKeys, queryKeys } from './queryKeys.js';

/** Every git action the UI can run, with the message shown when it succeeds. */
const GIT_ACTIONS = {
  fetch: { run: gitApi.fetch, title: 'Fetch', success: () => 'Fetched from all remotes' },
  // A pull or push can legitimately do nothing, so these don't claim anything moved.
  pull: { run: gitApi.pull, title: 'Pull', success: () => 'Pull complete' },
  push: { run: gitApi.push, title: 'Push', success: () => 'Push complete' },
  publishBranch: {
    run: gitApi.push,
    title: 'Publish',
    success: ({ remote, upstreamName }) => `Published to ${remote}/${upstreamName}`,
  },
  checkout: {
    run: gitApi.checkout,
    title: 'Checkout',
    success: ({ branch }) => `Checked out ${branch}`,
  },
  createBranch: {
    run: gitApi.createBranch,
    title: 'Create branch',
    success: ({ name }) => `Created ${name}`,
  },
  deleteBranch: {
    run: gitApi.deleteBranch,
    title: 'Delete branch',
    success: ({ name }) => `Deleted ${name}`,
  },
  deleteRemoteBranch: {
    run: gitApi.deleteRemoteBranch,
    title: 'Delete remote branch',
    success: ({ name }) => `Deleted ${name}`,
  },
  pruneBranches: {
    run: gitApi.pruneBranches,
    title: 'Prune branches',
    success: (_input, { deleted, kept }) =>
      [
        `Deleted ${deleted.length} ${deleted.length === 1 ? 'branch' : 'branches'}.`,
        kept.length > 0 && `Kept ${kept.join(', ')}.`,
      ]
        .filter(Boolean)
        .join(' '),
  },
  merge: { run: gitApi.merge, title: 'Merge', success: ({ branch }) => `Merged ${branch}` },
  mergeInto: {
    run: gitApi.mergeInto,
    title: 'Merge',
    success: ({ source, target }) => `Merged ${source} into ${target}`,
  },
  rebase: { run: gitApi.rebase, title: 'Rebase', success: ({ branch }) => `Rebased onto ${branch}` },
  abortOperation: { run: gitApi.abortOperation, title: 'Abort', success: () => 'Aborted' },
  continueOperation: { run: gitApi.continueOperation, title: 'Continue', success: () => 'Done' },
  stage: { run: gitApi.stage, title: 'Stage' },
  unstage: { run: gitApi.unstage, title: 'Unstage' },
  stageLines: { run: gitApi.stageLines, title: 'Stage lines' },
  discard: { run: gitApi.discard, title: 'Discard', success: () => 'Changes discarded' },
  commit: { run: gitApi.commit, title: 'Commit', success: () => 'Committed' },
  undoCommit: {
    run: gitApi.undoCommit,
    title: 'Undo commit',
    success: ({ subject }) => `Undid "${subject}". Its changes and message are ready to commit.`,
  },
  stash: { run: gitApi.stash, title: 'Stash', success: () => 'Changes stashed' },
  stashApply: { run: gitApi.stashApply, title: 'Apply stash', success: () => 'Stash applied' },
  stashPop: { run: gitApi.stashPop, title: 'Pop stash', success: () => 'Stash restored' },
  stashDrop: { run: gitApi.stashDrop, title: 'Drop stash', success: () => 'Stash dropped' },
};

/**
 * Runs git actions for a repository. Results are reported to the user here, so
 * callers only need to know whether to carry on.
 */
export function useGitActions(repositoryId) {
  const queryClient = useQueryClient();
  const { message, notification } = App.useApp();
  const mutationKey = mutationKeys.gitAction(repositoryId);

  const { mutateAsync } = useMutation({
    mutationKey,
    mutationFn: ({ name, input }) => GIT_ACTIONS[name].run(repositoryId, input),
    onSuccess: (result, { name, input }) => {
      const text = GIT_ACTIONS[name].success?.(input, result);
      if (text) message.success(text);
    },
    onError: (error, { name }) => {
      const { title } = GIT_ACTIONS[name];
      if (error.code === 'CONFLICTS') {
        notification.warning({ title: `${title} paused`, description: error.message });
      } else {
        notification.error({ title: `${title} failed`, description: error.message });
      }
    },
    // Failed commands can still change the repository, as a conflicted merge does.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.repository(repositoryId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.repositoryList() }),
      ]),
  });

  const pendingActions = useMutationState({
    filters: { mutationKey, status: 'pending' },
    select: (mutation) => mutation.state.variables.name,
  });

  /**
   * Resolves true once the action has run its course. A stop on conflicts counts,
   * because the conflict banner takes over from there.
   */
  const run = useCallback(
    async (name, input) => {
      try {
        await mutateAsync({ name, input });
        return true;
      } catch (error) {
        return error.code === 'CONFLICTS';
      }
    },
    [mutateAsync],
  );

  return { run, pendingAction: pendingActions[0] ?? null, isBusy: pendingActions.length > 0 };
}
