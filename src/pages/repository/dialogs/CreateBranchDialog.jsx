import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchNameInput } from './BranchNameInput.jsx';
import { BranchSelect } from './BranchSelect.jsx';

export function CreateBranchDialog({ startPoint: initialStartPoint, onClose }) {
  const { status, run } = useRepositoryContext();
  const [name, setName] = useState('');
  const [startPoint, setStartPoint] = useState(initialStartPoint ?? status.branch ?? undefined);
  const [switchTo, setSwitchTo] = useState(true);

  return (
    <ActionDialog
      title="Create a branch"
      okText="Create branch"
      canSubmit={Boolean(name)}
      onSubmit={() => run('createBranch', { name, startPoint, switchTo })}
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <BranchNameInput
          autoFocus
          aria-label="Branch name"
          placeholder="Branch name"
          value={name}
          onChange={setName}
        />
        <BranchSelect
          aria-label="Start from"
          placeholder="Start from HEAD"
          value={startPoint}
          onChange={setStartPoint}
        />
        <Checkbox checked={switchTo} onChange={(event) => setSwitchTo(event.target.checked)}>
          Switch to the new branch
        </Checkbox>
      </Flex>
    </ActionDialog>
  );
}
