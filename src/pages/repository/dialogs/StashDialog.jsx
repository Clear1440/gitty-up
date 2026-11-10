import { Input } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';

/** Stashes every change, or with `paths` just those files. */
export function StashDialog({ paths, onClose }) {
  const { repository, run } = useRepositoryContext();
  const [message, setMessage] = useState('');

  return (
    <ActionDialog
      title={
        paths
          ? `Stash ${paths.length === 1 ? paths[0] : TextHelper.countOf(paths.length, 'file')}`
          : 'Stash changes'
      }
      okText="Stash"
      onSubmit={() => run('stash', { message, paths })}
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
