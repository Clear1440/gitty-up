import { App } from 'antd';
import { useEffect, useRef } from 'react';
import { gitApi } from '../../api';
import { useConfirmDanger } from '../../components/useConfirmDanger.js';
import { KeyboardHelper } from '../../utils/KeyboardHelper.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { restoreCommitMessage } from './useCommitDraft.js';

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/** Whether a key press means undo for the app, rather than for the field being typed in. */
export function isUndoCommitKey(event) {
  const { key, shiftKey, altKey, repeat, target } = event;
  const isUndo =
    key.toLowerCase() === 'z' &&
    KeyboardHelper.hasCommandKey(event) &&
    !shiftKey &&
    !altKey &&
    !repeat;
  return isUndo && !target.closest?.(EDITABLE);
}

/**
 * Why the latest commit can't be undone right now, or null if it can. A paused merge
 * or rebase has its own changes under way, which undoing a commit would tangle with.
 */
export function whyCommitUndoIsBlocked(status) {
  if (status?.operation) return `Finish or abort the ${status.operation} first`;
  if (status?.conflicted?.length > 0) return 'Resolve the conflicts first';
  return null;
}

/**
 * Ctrl+Z, or Cmd+Z, takes back the latest change made in this tab: staging or unstaging
 * files puts them back, resolving a conflict brings the conflict back, and a commit is
 * undone with its changes staged and its message back in the commit box. With nothing
 * else to take back, it undoes the latest commit, as long as no merge or rebase is under
 * way. Undoing a commit that is already on a remote asks first, as replacing it there
 * means force pushing later.
 */
export function useUndoCommitShortcut() {
  const { repository, status, run, takeUndo, isBusy } = useRepositoryContext();
  const { message } = App.useApp();
  const confirmDanger = useConfirmDanger();
  const isChecking = useRef(false);
  // Read when the key is pressed, without listening again on every status poll.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const undoLastCommit = async () => {
      if (repository.isMono) {
        message.info('To undo a commit, open its repository on its own');
        return;
      }
      const blocked = whyCommitUndoIsBlocked(statusRef.current);
      if (blocked) {
        message.info(`Nothing to undo here. ${blocked} before undoing a commit.`);
        return;
      }

      const commit = await gitApi.getLastCommit(repository.id);
      if (!commit) {
        message.info('There is nothing to undo');
        return;
      }

      const { hash, subject, message: commitMessage, pushed } = commit;
      const undoCommit = async (input) => {
        const undone = await run('undoCommit', { hash, subject, ...input });
        if (undone) restoreCommitMessage(repository.id, commitMessage);
      };

      if (!pushed) {
        await undoCommit();
        return;
      }
      confirmDanger({
        title: `Undo "${subject}"?`,
        content:
          'This commit is already on a remote. Undoing it here leaves it there, so you would need to force push to replace it.',
        okText: 'Undo commit',
        onOk: () => undoCommit({ allowPushed: true }),
      });
    };

    const undo = async () => {
      const step = takeUndo();
      if (!step || step.kind === 'commit') {
        await undoLastCommit();
        return;
      }
      for (const { name, input } of step.actions) {
        if (!(await run(name, input, { isUndo: true }))) return;
      }
      message.success(step.label);
    };

    const handleKeyDown = async (event) => {
      // An open dialog owns the keyboard, even with nothing in it focused.
      const hasDialog = Boolean(document.querySelector('.ant-modal'));
      if (!isUndoCommitKey(event) || hasDialog) return;
      // Claimed even when busy, so the key never falls through to anything else.
      event.preventDefault();
      if (isBusy || isChecking.current) return;

      isChecking.current = true;
      try {
        await undo();
      } catch (error) {
        message.error(error.message);
      } finally {
        isChecking.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [repository.id, repository.isMono, run, takeUndo, isBusy, message, confirmDanger]);
}
