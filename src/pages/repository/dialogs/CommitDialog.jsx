import { Checkbox, Flex, Input } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

function describeFiles(count) {
  return count === 1 ? '1 file' : `${count} files`;
}

export function CommitDialog({ onClose }) {
  const { status, run } = useRepositoryContext();
  const stagedCount = status.staged.length;
  const unstagedCount = status.unstaged.length;
  const isMerging = status.operation === 'merge';

  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  // With nothing staged, the likely intent is to commit everything.
  const [stageAll, setStageAll] = useState(stagedCount === 0);

  const includesChanges = stagedCount > 0 || (stageAll && unstagedCount > 0);
  const hasMessage = Boolean(message.trim()) || amend || isMerging;
  const canSubmit = hasMessage && (includesChanges || amend || isMerging);

  const placeholder = isMerging
    ? 'Leave empty to use the merge message'
    : amend
      ? 'Leave empty to keep the previous message'
      : 'Commit message';

  return (
    <ActionDialog
      title={`Commit to ${status.branch ?? 'detached HEAD'}`}
      okText={amend ? 'Amend commit' : 'Commit'}
      canSubmit={canSubmit}
      onSubmit={() => run('commit', { message, amend, stageAll })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Input.TextArea
          autoFocus
          aria-label="Commit message"
          placeholder={placeholder}
          autoSize={{ minRows: 3, maxRows: 10 }}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        {unstagedCount > 0 && (
          <Checkbox checked={stageAll} onChange={(event) => setStageAll(event.target.checked)}>
            Also stage {describeFiles(unstagedCount)} with unstaged changes
          </Checkbox>
        )}
        <Checkbox checked={amend} onChange={(event) => setAmend(event.target.checked)}>
          Amend the previous commit
        </Checkbox>
      </Flex>
    </ActionDialog>
  );
}
