import { Input } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

export function StashDialog({ onClose }) {
  const { repository, run } = useRepositoryContext();
  const [message, setMessage] = useState('');

  return (
    <ActionDialog
      title="Stash changes"
      okText="Stash"
      onSubmit={() => run('stash', { message })}
      onClose={onClose}
    >
      {repository.isMono && (
        <p>Each repository with changes keeps its own stash, under this message.</p>
      )}
      <Input
        autoFocus
        aria-label="Stash message"
        placeholder="What are you setting aside? (optional)"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
    </ActionDialog>
  );
}
