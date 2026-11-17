import { CheckOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Checkbox, Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { gitApi } from '../../api';
import { queryKeys } from '../../queries/queryKeys.js';
import { KeyboardHelper } from '../../utils/KeyboardHelper.js';
import { ListHelper } from '../../utils/ListHelper.js';
import { TextHelper } from '../../utils/TextHelper.js';
import styles from './CommitPanel.module.css';
import { useRepositoryContext } from './RepositoryContext.js';
import { StatusHelper } from './StatusHelper.js';
import { useCommitDraft } from './useCommitDraft.js';
import { usePush } from './usePush.js';

/** Says why committing is not possible right now, or returns null when it is. */
function findBlocker({ status, fileCount, hasMessage, amend }) {
  // Git has a message ready for a merge, cherry-pick or revert.
  const isMerging = ['merge', 'cherry-pick', 'revert'].includes(status.operation);
  if (status.conflicted.length > 0) return 'Resolve the conflicts first';
  if (status.operation === 'rebase') return 'Finish the rebase first';
  if (fileCount === 0 && !amend && !isMerging) return 'No changes to commit';
  if (!hasMessage && !amend && !isMerging) return 'Enter a commit message to commit';
  return null;
}

function placeholderFor({ status, amend }) {
  if (status.operation === 'merge') return 'Leave empty to use the merge message';
  if (status.operation === 'cherry-pick') return "Leave empty to use the commit's message";
  if (status.operation === 'revert') return 'Leave empty to use the revert message';
  if (amend) return 'Leave empty to keep the previous message';
  return 'Commit message (Ctrl+Enter to commit)';
}

/** Says in words which files the commit takes, so staging rules never need guessing. */
function describeScope({ status, stageAll, fileCount, amend, repositories }) {
  // An amend has its own note, which says what it adds.
  if (fileCount === 0 || amend) return null;
  const where = repositories.length > 0 ? ` in ${repositories.join(', ')}` : '';
  if (stageAll) {
    const all = fileCount === 1 ? 'the 1 changed file' : `all ${fileCount} changed files`;
    return `Nothing is staged, so ${all}${where} will be committed.`;
  }
  const unstagedCount = status.unstaged.length;
  const leftOut =
    unstagedCount > 0
      ? ` ${TextHelper.countOf(unstagedCount, 'file')} with unstaged changes ${TextHelper.pluralize(unstagedCount, 'is', 'are')} left out.`
      : '';
  return `${TextHelper.countOf(fileCount, 'staged file')}${where} will be committed.${leftOut}`;
}

/** `onClean` fires after a commit that left nothing else to commit. */
export function CommitPanel({ onClean }) {
  const { repository, status, run, isBusy, pendingAction } = useRepositoryContext();
  const push = usePush();
  const queryClient = useQueryClient();
  const { state: navigationState } = useLocation();
  const inputRef = useRef(null);
  const [draft, setDraft] = useCommitDraft(repository.id);
  // While amending, the box holds the previous commit's message, apart from the draft.
  const [amending, setAmending] = useState(null);
  const amend = Boolean(amending);
  const message = amending ? amending.message : draft;
  const setMessage = amending
    ? (text) => setAmending((current) => ({ ...current, message: text }))
    : setDraft;
  const { message: toast } = App.useApp();

  const setAmend = async (checked) => {
    if (!checked) {
      setAmending(null);
      return;
    }
    try {
      const last = await gitApi.getLastCommit(repository.id);
      if (!last) {
        toast.info('There is no commit to amend yet');
        return;
      }
      setAmending({ message: last.message.trim(), pushed: last.pushed, shortHash: last.shortHash });
      inputRef.current?.focus();
    } catch (error) {
      toast.error(error.message);
    }
  };
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
  const fileCount = ListHelper.countUnique(filesToCommit, (file) => file.path);
  // Only mono repo files say which repository they are in.
  const repositories = ListHelper.unique(
    filesToCommit.map((file) => file.repository).filter(Boolean),
  );

  const hasMessage = Boolean(message.trim());
  const blocker = findBlocker({ status, fileCount, hasMessage, amend });
  const canCommit = !blocker && !isBusy;
  const buttonLabel = [
    amend ? 'Amend' : 'Commit',
    pushAfterCommit && '& push',
    status.branch && `to ${status.branch}`,
    repositories.length > 0 &&
      `in ${TextHelper.countOf(repositories.length, 'repository', 'repositories')}`,
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
      // An amend leaves the draft alone, as it was written for a commit still to come.
      if (amend) setAmending(null);
      else setDraft('');
      setStageAllChoice(null);

      if (pushAfterCommit) {
        // The commit stands even if this fails, and run() reports the failure.
        await push();
        // It applies to one commit, so the next one never pushes by surprise.
        setPushAfterCommit(false);
      }

      // run() waits for the refetch, so unlike `status` this is what the commit left.
      const statusAfter = queryClient.getQueryData(queryKeys.status(repository.id));
      if (StatusHelper.isClean(statusAfter)) onClean();
    }
  };

  const handleKeyDown = (event) => {
    if (KeyboardHelper.isSubmitShortcut(event)) commit();
  };

  const scope = describeScope({ status, stageAll, fileCount, amend, repositories });

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
      {amending && (
        <p className={styles.amendNote}>
          Editing {amending.shortHash}
          {fileCount > 0 ? `, adding ${TextHelper.countOf(fileCount, 'file')}` : ''}.
          {amending.pushed && ' It is already pushed, so this needs a force push.'}
        </p>
      )}
      {/* Always on show, so a greyed out button says why without needing a hover. */}
      {(blocker || scope) && (
        <p className={styles.summary} role="status">
          {blocker && <span className={styles.blocker}>{blocker}. </span>}
          {scope}
        </p>
      )}
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
    </section>
  );
}
