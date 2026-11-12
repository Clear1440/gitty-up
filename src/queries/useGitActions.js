import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useCallback } from 'react';
import { gitApi } from '../api';
import { MonoIdHelper } from '../utils/MonoIdHelper.js';
import { TextHelper } from '../utils/TextHelper.js';
import { mutationKeys, queryKeys } from './queryKeys.js';
import { refreshTogether } from './refreshTogether.js';
import { statusQuery } from './git.js';
import { recordAction, recordFailedAction, takeUndoStep } from './undoHistory.js';

/** A mono repo reports on each of its repositories, a line apiece. */
const MULTILINE = { whiteSpace: 'pre-line' };

/** Every git action the UI can run, with the message shown when it succeeds. */
const GIT_ACTIONS = {
  fetch: { run: gitApi.fetch, title: 'Fetch', success: () => 'Fetched from all remotes' },
  // A pull or push can legitimately do nothing, so these don't claim anything moved.
  pull: { run: gitApi.pull, title: 'Pull', success: () => 'Pull complete' },
  push: {
    run: gitApi.push,
    title: 'Push',
    success: ({ toUpstream, target }) => (toUpstream && target ? `Pushed into ${target}` : 'Push complete'),
  },
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
    success: ({ name, upstream }) => (upstream ? `Deleted ${name} and ${upstream}` : `Deleted ${name}`),
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
        `Deleted ${TextHelper.countOf(deleted.length, 'branch', 'branches')}.`,
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
  checkoutCommit: {
    run: gitApi.checkoutCommit,
    title: 'Checkout',
    success: ({ shortHash }) => `Checked out ${shortHash}, on no branch`,
  },
  cherryPick: {
    run: gitApi.cherryPick,
    title: 'Cherry-pick',
    success: ({ subject }) => `Cherry-picked "${subject}"`,
  },
  resetToCommit: {
    run: gitApi.resetToCommit,
    title: 'Reset',
    success: ({ shortHash, mode }) =>
      mode === 'soft' ? `Reset to ${shortHash}. Later changes are staged.` : `Reset to ${shortHash}`,
  },
  abortOperation: { run: gitApi.abortOperation, title: 'Abort', success: () => 'Aborted' },
  continueOperation: { run: gitApi.continueOperation, title: 'Continue', success: () => 'Done' },
  stage: { run: gitApi.stage, title: 'Stage' },
  unstage: { run: gitApi.unstage, title: 'Unstage' },
  stageLines: { run: gitApi.stageLines, title: 'Stage lines' },
  resolveConflict: {
    run: gitApi.resolveConflict,
    title: 'Resolve conflict',
    success: ({ path, remove }) => (remove ? `Deleted ${path}` : `Resolved ${path}`),
  },
  unresolveConflict: { run: gitApi.unresolveConflict, title: 'Undo resolving' },
  discard: { run: gitApi.discard, title: 'Discard', success: () => 'Changes discarded' },
  discardAll: {
    run: gitApi.discardAll,
    title: 'Discard all',
    success: () => 'All changes discarded',
  },
  ignore: {
    run: gitApi.ignore,
    title: 'Ignore',
    success: ({ paths, kind }) =>
      kind === 'file' && paths.length === 1
        ? `Added ${paths[0]} to .gitignore`
        : 'Updated .gitignore',
  },
  rewordLastCommit: {
    run: gitApi.rewordLastCommit,
    title: 'Edit message',
    success: () => 'Commit message updated',
  },
  commit: {
    run: gitApi.commit,
    title: 'Commit',
    success: ({ repositoryCount = 1 }) =>
      repositoryCount > 1 ? `Committed to ${repositoryCount} repositories` : 'Committed',
  },
  undoCommit: {
    run: gitApi.undoCommit,
    title: 'Undo commit',
    success: ({ subject }) => `Undid "${subject}". Its changes and message are ready to commit.`,
  },
  stash: { run: gitApi.stash, title: 'Stash', success: () => 'Changes stashed' },
  stashApply: { run: gitApi.stashApply, title: 'Apply stash', success: () => 'Stash applied' },
  stashPop: { run: gitApi.stashPop, title: 'Pop stash', success: () => 'Stash restored' },
  stashDrop: { run: gitApi.stashDrop, title: 'Delete stash', success: () => 'Stash deleted' },
  addWorktree: {
    run: gitApi.addWorktree,
    title: 'Create worktree',
    success: ({ path }) => `Created a worktree at ${path}`,
  },
  removeWorktree: {
    run: gitApi.removeWorktree,
    title: 'Remove worktree',
    success: ({ name }) => `Removed ${name}`,
  },
  lockWorktree: { run: gitApi.lockWorktree, title: 'Lock worktree', success: () => 'Locked' },
  unlockWorktree: { run: gitApi.unlockWorktree, title: 'Unlock worktree', success: () => 'Unlocked' },
  pruneWorktrees: {
    run: gitApi.pruneWorktrees,
    title: 'Prune worktrees',
    success: () => 'Cleared away missing worktrees',
  },
  applyPatch: {
    run: gitApi.applyPatch,
    title: 'Apply patch',
    success: ({ mode, name }) =>
      mode === 'commit' ? `Committed ${name}` : `Applied ${name} to your working tree`,
  },
  /** Runs on the repository being brought in, not on the mono repo that asked. */
  joinMono: {
    run: (_monoId, { repositoryId, branch }) => gitApi.checkout(repositoryId, { branch }),
    title: 'Switch branch',
    success: ({ name, branch }) => `${name} is now on ${branch} and part of this tab`,
  },
};

const partialKey = (repositoryId, name) => `partial-${repositoryId}-${name}`;

/**
 * Runs git actions for a repository. Results are reported to the user here, so
 * callers only need to know whether to carry on.
 */
export function useGitActions(repositoryId) {
  const queryClient = useQueryClient();
  const { message, notification } = App.useApp();
  const mutationKey = mutationKeys.gitAction(repositoryId);

  // A mono repo's actions land in its members, which have tabs of their own.
  const affectedKey = MonoIdHelper.isMonoId(repositoryId)
    ? queryKeys.allRepositories()
    : queryKeys.repository(repositoryId);

  const { mutateAsync } = useMutation({
    mutationKey,
    // A status read while the action runs could catch it halfway, as a merge into
    // another branch does by switching first, and flash that on screen.
    onMutate: async ({ name, input, isUndo }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.status(repositoryId) });
      const cached = queryClient.getQueryData(queryKeys.status(repositoryId));
      // Undoing "stage all" or "unstage all" takes back exactly the files it touched, so
      // it needs them as they are now rather than as of the last poll.
      const touchesEverything = (name === 'stage' || name === 'unstage') && !input?.paths;
      if (isUndo || !touchesEverything) return { statusBefore: cached };
      const statusBefore = await queryClient
        .fetchQuery({ ...statusQuery(repositoryId), staleTime: 0 })
        .catch(() => cached);
      return { statusBefore };
    },
    mutationFn: ({ name, input }) => GIT_ACTIONS[name].run(repositoryId, input),
    onSuccess: (result, { name, input, isUndo }, context) => {
      if (!isUndo) recordAction(repositoryId, name, input, context?.statusBefore);
      // Many actions run with no input, such as a plain push, and messages read from it.
      const text = GIT_ACTIONS[name].success?.(input ?? {}, result);
      if (text) message.success(text);
      // A retry that worked has dealt with whatever this action last left unfinished.
      notification.destroy(partialKey(repositoryId, name));
    },
    onError: (error, { name, isUndo, handledCodes = [] }) => {
      // A failed merge or pull can still have moved things, so earlier steps may no longer apply.
      if (!isUndo) recordFailedAction(repositoryId, name);
      const { title } = GIT_ACTIONS[name];
      // The caller asked to deal with this one itself, as it has a question to ask.
      if (handledCodes.includes(error.code)) return;
      if (error.code === 'CONFLICTS') {
        notification.warning({
          title: `${title} paused`,
          description: error.message,
          style: MULTILINE,
        });
      } else if (error.code === 'PARTIAL') {
        notification.warning({
          key: partialKey(repositoryId, name),
          title: `${title} finished in some repositories`,
          description: error.message,
          style: MULTILINE,
          // There is a step left to take, so this stays until it has been read.
          duration: 0,
        });
      } else {
        notification.error({ title: `${title} failed`, description: error.message });
      }
    },
    // Failed commands can still change the repository, as a conflicted merge does.
    // Everything on screen changes in one go, rather than a panel at a time.
    onSettled: () =>
      Promise.all([
        refreshTogether(queryClient, affectedKey),
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
    async (name, input, { isUndo = false } = {}) => {
      try {
        await mutateAsync({ name, input, isUndo });
        return true;
      } catch (error) {
        return error.code === 'CONFLICTS';
      }
    },
    [mutateAsync],
  );

  /**
   * Like `run`, but resolves with `{ ok, error }`, and leaves errors whose code is in
   * `handledCodes` unreported, for the caller to deal with. Others are reported as usual.
   */
  const attempt = useCallback(
    async (name, input, { handledCodes = [] } = {}) => {
      try {
        await mutateAsync({ name, input, handledCodes });
        return { ok: true, error: null };
      } catch (error) {
        return { ok: error.code === 'CONFLICTS', error };
      }
    },
    [mutateAsync],
  );

  /** Takes this repository's latest undo step, or null. See undoHistory.js. */
  const takeUndo = useCallback(() => takeUndoStep(repositoryId), [repositoryId]);

  return {
    run,
    attempt,
    takeUndo,
    pendingAction: pendingActions[0] ?? null,
    isBusy: pendingActions.length > 0,
  };
}
