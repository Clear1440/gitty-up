import { Input } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

export function StashDialog({ onClose }) {
  const { run } = useRepositoryContext();
  const [message, setMessage] = useState('');

  return (
    <ActionDialog
      title="Stash changes"
      okText="Stash"
      onSubmit={() => run('stash', { message })}
      onClose={onClose}
    >
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
