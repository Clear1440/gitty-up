import { Checkbox, Flex, Input, Select } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field, Outcome } from '../../../components/Field.jsx';
import { useRemotes, useTags } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { TagHelper } from '../TagHelper.js';
import { BranchNameInput } from './BranchNameInput.jsx';

/**
 * Tags a commit. A message makes the tag annotated, and it can be pushed straight away
 * when the repository has a remote.
 */
export function CreateTagDialog({ hash, shortHash, onClose }) {
  const { repository, run } = useRepositoryContext();
  const { data: tags } = useTags(repository.id);
  const { data: remoteOptions } = useRemotes(repository.id);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [push, setPush] = useState(false);
  const [chosenRemote, setChosenRemote] = useState(null);

  const remotes = remoteOptions?.remotes ?? [];
  const remote = chosenRemote ?? remoteOptions?.defaultRemote;
  const exists = TagHelper.exists(tags, name);
  const pushing = push && remotes.length > 0;

  return (
    <ActionDialog
      title={`Tag ${shortHash}`}
      okText="Create tag"
      canSubmit={Boolean(name) && !exists}
      onSubmit={() =>
        run('createTag', {
          name,
          hash,
          message: message.trim() || undefined,
          push: pushing,
          remote: pushing ? remote : undefined,
        })
      }
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Field label="Tag name" hint={exists ? `A tag called ${name} already exists.` : undefined}>
          <BranchNameInput
            autoFocus
            aria-label="Tag name"
            placeholder="v1.2.0"
            status={exists ? 'error' : undefined}
            value={name}
            onChange={setName}
          />
        </Field>
        <Field
          label="Message (optional)"
          hint="With a message, this is an annotated tag, which records who made it and when. Without one, it is a plain tag."
        >
          <Input.TextArea
            aria-label="Tag message"
            autoSize={{ minRows: 2, maxRows: 6 }}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        {remotes.length > 0 && (
          <Checkbox checked={push} onChange={(event) => setPush(event.target.checked)}>
            Push the tag to the remote straight away
          </Checkbox>
        )}
        {pushing && remotes.length > 1 && (
          <Field label="Remote">
            <Select
              aria-label="Remote"
              value={remote}
              options={remotes.map((option) => ({ value: option, label: option }))}
              onChange={setChosenRemote}
            />
          </Field>
        )}
        {name && !exists && (
          <Outcome>
            Creates {message.trim() ? 'an annotated tag' : 'a tag'} called <strong>{name}</strong> on{' '}
            <strong>{shortHash}</strong>
            {pushing ? <> and pushes it to {remote}.</> : '. It stays here until you push it.'}
          </Outcome>
        )}
      </Flex>
    </ActionDialog>
  );
}
