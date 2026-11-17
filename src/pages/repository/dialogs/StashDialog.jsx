import { Flex, Input } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field, Outcome } from '../../../components/Field.jsx';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';

/** Stashes every change, or with `paths` just those files. */
export function StashDialog({ paths, onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const fileCount = paths ? paths.length : StatusHelper.countChangedFiles(status);
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
      <Flex vertical gap={12}>
        <Field label="Message (optional)" hint="A note to recognize this stash by later.">
          <Input
            autoFocus
            aria-label="Stash message"
            placeholder="What are you setting aside?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        <Outcome>
          Sets aside the changes to <strong>{TextHelper.countOf(fileCount, 'file')}</strong>, new
          files included, and puts {fileCount === 1 ? 'it' : 'them'} back to the last commit.
          Bring the changes back from Stashes in the sidebar{paths ? '.' : ', or with Pop.'}
        </Outcome>
      </Flex>
    </ActionDialog>
  );
}
