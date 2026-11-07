import { CheckOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Input, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { queryKeys } from '../../queries/queryKeys.js';
import styles from './CommitPanel.module.css';
import { useRepositoryContext } from './RepositoryContext.js';
import { useCommitDraft } from './useCommitDraft.js';
import { usePush } from './usePush.js';

const describeFiles = (count) => (count === 1 ? '1 file' : `${count} files`);

const describeRepositories = (count) => (count === 1 ? '1 repository' : `${count} repositories`);

/** Says why committing is not possible right now, or returns null when it is. */
function findBlocker({ status, fileCount, hasMessage, amend }) {
  // Git has a message ready for a merge or cherry-pick.
  const isMerging = status.operation === 'merge' || status.operation === 'cherry-pick';
  if (status.conflicted.length > 0) return 'Resolve conflicts first';
  if (status.operation === 'rebase') return 'Finish the rebase first';
  if (fileCount === 0 && !amend && !isMerging) return 'No changes to commit';
  if (!hasMessage && !amend && !isMerging) return 'Enter a commit message';
  return null;
}

function placeholderFor({ status, amend }) {
  if (status.operation === 'merge') return 'Leave empty to use the merge message';
  if (status.operation === 'cherry-pick') return "Leave empty to use the commit's message";
  if (amend) return 'Leave empty to keep the previous message';
  return 'Commit message (Ctrl+Enter to commit)';
}

/** `onClean` fires after a commit that left nothing else to commit. */
export function CommitPanel({ onClean }) {
  const { repository, status, run, isBusy, pendingAction } = useRepositoryContext();
  const push = usePush();
  const queryClient = useQueryClient();
  const { state: navigationState } = useLocation();
  const inputRef = useRef(null);
  const [message, setMessage] = useCommitDraft(repository.id);
  const [amend, setAmend] = useState(false);
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  // Null until the user chooses, so the default can follow what is staged.
  const [stageAllChoice, setStageAllChoice] = useState(null);

  const focusRequest = navigationState?.focusCommitMessage;
  useEffect(() => {
    if (focusRequest) inputRef.current?.focus();
  }, [focusRequest]);

  const unstagedCount = status.unstaged.length;
  // With nothing staged, the likely intent is to commit everything.
  const stageAll = unstagedCount > 0 && (stageAllChoice ?? (status.staged.length === 0 && !amend));
  const filesToCommit = [...status.staged, ...(stageAll ? status.unstaged : [])];
  const fileCount = new Set(filesToCommit.map((file) => file.path)).size;
  // Only mono repo files say which repository they are in.
  const repositories = [...new Set(filesToCommit.map((file) => file.repository))].filter(Boolean);

  const hasMessage = Boolean(message.trim());
  const blocker = findBlocker({ status, fileCount, hasMessage, amend });
  const canCommit = !blocker && !isBusy;
  const buttonLabel = [
    amend ? 'Amend' : 'Commit',
    pushAfterCommit && '& push',
    status.branch && `to ${status.branch}`,
    repositories.length > 0 && `in ${describeRepositories(repositories.length)}`,
  ]
    .filter(Boolean)
    .join(' ');

  const commit = async () => {
    if (!canCommit) return;
    const committed = await run('commit', {
      message,
      amend,
      stageAll,
      repositoryCount: repositories.length,
    });
    if (committed) {
      setMessage('');
      setAmend(false);
      setStageAllChoice(null);

      if (pushAfterCommit) {
        // The commit stands even if this fails, and run() reports the failure.
        await push();
        // It applies to one commit, so the next one never pushes by surprise.
        setPushAfterCommit(false);
      }

      // run() waits for the refetch, so unlike `status` this is what the commit left.
      const { staged, unstaged, conflicted } = queryClient.getQueryData(
        queryKeys.status(repository.id),
      );
      if (staged.length + unstaged.length + conflicted.length === 0) onClean();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commit();
  };

  return (
    <section className={styles.panel} aria-label="Commit">
      <Input.TextArea
        ref={inputRef}
        aria-label="Commit message"
        placeholder={placeholderFor({ status, amend })}
        autoSize={{ minRows: 2, maxRows: 6 }}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.options}>
        {/* Each repository has its own previous commit, so there is no one to amend. */}
        {!status.mono && (
          <Checkbox checked={amend} onChange={(event) => setAmend(event.target.checked)}>
            Amend previous
          </Checkbox>
        )}
        <Checkbox
          checked={pushAfterCommit}
          onChange={(event) => setPushAfterCommit(event.target.checked)}
        >
          Push after commit
        </Checkbox>
      </div>
      {/* It opens over the checkboxes above, so it must never catch a click meant for them. */}
      <Tooltip
        title={
          blocker ?? [describeFiles(fileCount), ...repositories].join(repositories.length ? ' · ' : '')
        }
        classNames={{ root: styles.commitTooltip }}
        mouseLeaveDelay={0}
      >
        {/* A disabled button fires no hover events, so the wrapper carries the tooltip. */}
        <span className={styles.commitButton}>
          <Button
            block
            type="primary"
            icon={<CheckOutlined />}
            disabled={!canCommit}
            loading={pendingAction === 'commit' || (pushAfterCommit && pendingAction === 'push')}
            onClick={commit}
          >
            {buttonLabel}
          </Button>
        </span>
      </Tooltip>
    </section>
  );
}
