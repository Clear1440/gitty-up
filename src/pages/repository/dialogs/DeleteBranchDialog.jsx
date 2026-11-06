import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

export function DeleteBranchDialog({ name, onClose }) {
  const { run } = useRepositoryContext();
  const [force, setForce] = useState(false);

  return (
    <ActionDialog
      title={`Delete ${name}?`}
      okText="Delete branch"
      danger
      onSubmit={() => run('deleteBranch', { name, force })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <span>This removes the local branch. Any copy on a remote stays.</span>
        <Checkbox checked={force} onChange={(event) => setForce(event.target.checked)}>
          Delete even if it has unmerged commits
        </Checkbox>
      </Flex>
    </ActionDialog>
  );
}
