import { Input, Spin } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useCommitDetails } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';

/** Edits the latest commit's message, leaving its changes, and anything staged, alone. */
export function RewordCommitDialog({ hash, shortHash, onClose }) {
  const { repository, run } = useRepositoryContext();
  const { data: commit } = useCommitDetails(repository.id, hash);
  // Null until edited, showing the commit's own message until then.
  const [edited, setMessage] = useState(null);
  const message = edited ?? commit?.message.trim() ?? null;

  const trimmed = message?.trim() ?? '';
  const changed = Boolean(trimmed) && trimmed !== commit?.message.trim();

  return (
    <ActionDialog
      title={`Edit message of ${shortHash}`}
      okText="Save message"
      canSubmit={changed}
      onSubmit={() => run('rewordLastCommit', { hash, message: trimmed })}
      onClose={onClose}
    >
      {message === null ? (
        <Spin />
      ) : (
        <Input.TextArea
          autoFocus
          aria-label="Commit message"
          autoSize={{ minRows: 3, maxRows: 12 }}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      )}
    </ActionDialog>
  );
}
