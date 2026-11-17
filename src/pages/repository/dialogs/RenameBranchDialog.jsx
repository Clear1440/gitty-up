import { Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field, Outcome } from '../../../components/Field.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchNameInput } from './BranchNameInput.jsx';

/**
 * Renames a local branch, keeping its commits. In a mono repo it renames the branch in
 * every repository of the group that has it, so the names stay together.
 */
export function RenameBranchDialog({ name, upstream, onClose }) {
  const { repository, run } = useRepositoryContext();
  const [newName, setNewName] = useState(name);
  const changed = Boolean(newName) && newName !== name;

  return (
    <ActionDialog
      title={`Rename ${name}`}
      okText="Rename"
      canSubmit={changed}
      onSubmit={() => run('renameBranch', { name, newName })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <Field label="New name">
          <BranchNameInput
            autoFocus
            aria-label="New branch name"
            value={newName}
            onChange={setNewName}
            onFocus={(event) => event.target.select()}
          />
        </Field>
        {changed && (
          <Outcome>
            Renames <strong>{name}</strong> to <strong>{newName}</strong>
            {repository.isMono ? ' in every repository here that has it' : ''}, keeping its
            commits.
            {upstream && (
              <>
                {' '}
                It still pushes to and pulls from <strong>{upstream}</strong>, which keeps its
                name.
              </>
            )}
          </Outcome>
        )}
      </Flex>
    </ActionDialog>
  );
}
