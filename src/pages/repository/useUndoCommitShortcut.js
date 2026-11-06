import { App } from 'antd';
import { useEffect, useRef } from 'react';
import { gitApi } from '../../api';
import { useRepositoryContext } from './RepositoryContext.js';
import { restoreCommitMessage } from './useCommitDraft.js';

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/** Whether a key press means undo for the app, rather than for the field being typed in. */
export function isUndoCommitKey(event) {
  const { key, ctrlKey, metaKey, shiftKey, altKey, repeat, target } = event;
  if (key.toLowerCase() !== 'z' || !(ctrlKey || metaKey) || shiftKey || altKey || repeat) {
    return false;
  }
  return !target.closest?.(EDITABLE);
}

/**
 * Ctrl+Z, or Cmd+Z, undoes the latest commit, keeping its changes staged and putting its
 * message back in the commit box. Git can still reach the commit, so this goes straight
 * ahead. The exception is a commit that is already on a remote, as undoing that one
 * means force pushing later.
 */
export function useUndoCommitShortcut() {
  const { repository, run, isBusy } = useRepositoryContext();
  const { message, modal } = App.useApp();
  const isChecking = useRef(false);

  useEffect(() => {
    const undo = async () => {
      const commit = await gitApi.getLastCommit(repository.id);
      if (!commit) {
        message.info('There is no commit to undo');
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
      modal.confirm({
        title: `Undo "${subject}"?`,
        content:
          'This commit is already on a remote. Undoing it here leaves it there, so you would need to force push to replace it.',
        okText: 'Undo commit',
        okButtonProps: { danger: true },
        focusable: { autoFocusButton: 'cancel' },
        onOk: () => undoCommit({ allowPushed: true }),
      });
    };

    const handleKeyDown = async (event) => {
      // An open dialog owns the keyboard, even with nothing in it focused.
      const hasDialog = Boolean(document.querySelector('.ant-modal'));
      if (!isUndoCommitKey(event) || hasDialog || isBusy || isChecking.current) return;
      event.preventDefault();

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
  }, [repository.id, run, isBusy, message, modal]);
}
