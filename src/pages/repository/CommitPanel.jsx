import { CheckOutlined } from '@ant-design/icons';
import { Button, Checkbox, Input, Tooltip } from 'antd';
import { useState } from 'react';
import styles from './CommitPanel.module.css';
import { useRepositoryContext } from './RepositoryContext.js';
import { useCommitDraft, usePushAfterCommit } from './useCommitDraft.js';

const describeFiles = (count) => (count === 1 ? '1 file' : `${count} files`);

/** Says why committing is not possible right now, or returns null when it is. */
function findBlocker({ status, fileCount, hasMessage, amend }) {
  const isMerging = status.operation === 'merge';
  if (status.conflicted.length > 0) return 'Resolve conflicts first';
  if (status.operation === 'rebase') return 'Finish the rebase first';
  if (fileCount === 0 && !amend && !isMerging) return 'No changes to commit';
  if (!hasMessage && !amend && !isMerging) return 'Enter a commit message';
  return null;
}

function placeholderFor({ status, amend }) {
  if (status.operation === 'merge') return 'Leave empty to use the merge message';
  if (amend) return 'Leave empty to keep the previous message';
  return 'Commit message (Ctrl+Enter to commit)';
}

export function CommitPanel({ inputRef }) {
  const { repository, status, run, isBusy, pendingAction } = useRepositoryContext();
  const [message, setMessage] = useCommitDraft(repository.id);
  const [pushAfterCommit, setPushAfterCommit] = usePushAfterCommit(repository.id);
  const [amend, setAmend] = useState(false);
  // Null until the user chooses, so the default can follow what is staged.
  const [stageAllChoice, setStageAllChoice] = useState(null);

  const unstagedCount = status.unstaged.length;
  // With nothing staged, the likely intent is to commit everything.
  const stageAll = unstagedCount > 0 && (stageAllChoice ?? (status.staged.length === 0 && !amend));
  const filesToCommit = [...status.staged, ...(stageAll ? status.unstaged : [])];
  const fileCount = new Set(filesToCommit.map((file) => file.path)).size;

  const hasMessage = Boolean(message.trim());
  const blocker = findBlocker({ status, fileCount, hasMessage, amend });
  const canCommit = !blocker && !isBusy;
  const buttonLabel = [
    amend ? 'Amend' : 'Commit',
    pushAfterCommit && '& push',
    status.branch && `to ${status.branch}`,
  ]
    .filter(Boolean)
    .join(' ');

  const commit = async () => {
    if (!canCommit) return;
    const committed = await run('commit', { message, amend, stageAll });
    if (committed) {
      setMessage('');
      setAmend(false);
      setStageAllChoice(null);
      // The commit stands even if this fails, and run() reports the failure.
      if (pushAfterCommit) await run('push');
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commit();
  };

  return (
    <section className={styles.panel} aria-label="Commit">
      <Input.TextArea
        ref={inputRef}
        className={styles.message}
        aria-label="Commit message"
        placeholder={placeholderFor({ status, amend })}
        autoSize={{ minRows: 2, maxRows: 6 }}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.options}>
        {unstagedCount > 0 && (
          <Checkbox
            checked={stageAll}
            onChange={(event) => setStageAllChoice(event.target.checked)}
          >
            Stage {describeFiles(unstagedCount)} too
          </Checkbox>
        )}
        <Checkbox checked={amend} onChange={(event) => setAmend(event.target.checked)}>
          Amend previous
        </Checkbox>
      </div>
      <div className={styles.submit}>
        <Checkbox
          checked={pushAfterCommit}
          onChange={(event) => setPushAfterCommit(event.target.checked)}
        >
          Push after commit
        </Checkbox>
        {/* It opens over the checkbox above, so it must never catch a click meant for it. */}
        <Tooltip
          title={blocker ?? describeFiles(fileCount)}
          classNames={{ root: styles.commitTooltip }}
          mouseLeaveDelay={0}
        >
          {/* A disabled button fires no hover events, so the wrapper carries the tooltip. */}
          <span className={styles.commitButton}>
            <Button
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
      </div>
    </section>
  );
}
