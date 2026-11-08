import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';

/** Confirms deleting `names`, the local branches a fetch found gone from the remote. */
export function PruneBranchesDialog({ names, onClose }) {
  const { run } = useRepositoryContext();
  const [force, setForce] = useState(false);

  return (
    <ActionDialog
      title={`Delete ${TextHelper.countOf(names.length, 'local branch', 'local branches')}?`}
      okText="Delete branches"
      danger
      onSubmit={() => run('pruneBranches', { force })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <span>These no longer exist on the remote:</span>
        <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 200, overflow: 'auto' }}>
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <Checkbox checked={force} onChange={(event) => setForce(event.target.checked)}>
          Delete even if they have unmerged commits, such as squash merged branches
        </Checkbox>
      </Flex>
    </ActionDialog>
  );
}
