import { Checkbox, Flex, Segmented } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchSelect } from './BranchSelect.jsx';

const MODES = [
  { label: 'Merge', value: 'merge' },
  { label: 'Rebase', value: 'rebase' },
];

export function MergeDialog({ branch: initialBranch, mode: initialMode = 'merge', onClose }) {
  const { status, run } = useRepositoryContext();
  const [mode, setMode] = useState(initialMode);
  const [branch, setBranch] = useState(initialBranch);
  const [noFastForward, setNoFastForward] = useState(false);

  const current = status.branch ?? 'HEAD';
  const isMerge = mode === 'merge';

  return (
    <ActionDialog
      title={isMerge ? `Merge into ${current}` : `Rebase ${current}`}
      okText={isMerge ? 'Merge' : 'Rebase'}
      canSubmit={Boolean(branch)}
      onSubmit={() => (isMerge ? run('merge', { branch, noFastForward }) : run('rebase', { branch }))}
      onClose={onClose}
    >
      <Flex vertical gap={12} align="flex-start">
        <Segmented options={MODES} value={mode} onChange={setMode} />
        <BranchSelect
          autoFocus
          excludeCurrent
          aria-label={isMerge ? 'Branch to merge' : 'Branch to rebase onto'}
          value={branch}
          onChange={setBranch}
        />
        {isMerge && (
          <Checkbox
            checked={noFastForward}
            onChange={(event) => setNoFastForward(event.target.checked)}
          >
            Always create a merge commit
          </Checkbox>
        )}
      </Flex>
    </ActionDialog>
  );
}
