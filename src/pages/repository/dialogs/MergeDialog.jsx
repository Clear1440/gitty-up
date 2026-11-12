import { Checkbox, Flex, Segmented } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useBranches } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';
import { BranchSelect } from './BranchSelect.jsx';
import { findBehindBranches } from './findBehindBranches.js';
import { MergeBlockedAlert } from './MergeBlockedAlert.jsx';

const MODES = [
  { label: 'Merge', value: 'merge' },
  { label: 'Rebase', value: 'rebase' },
];

export function MergeDialog({ branch: initialBranch, mode: initialMode = 'merge', onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);
  const [mode, setMode] = useState(initialMode);
  const [branch, setBranch] = useState(initialBranch);
  const [noFastForward, setNoFastForward] = useState(false);

  const current = StatusHelper.currentBranchName(status);
  // Rebasing rewrites history, so across a mono repo it stays with each repository.
  const canRebase = !repository.isMono;
  const isMerge = mode === 'merge' || !canRebase;
  const behind = isMerge ? findBehindBranches(branches?.local ?? [], [status.branch, branch]) : [];
  const mergeTitle = repository.isMono
    ? `Merge into ${current}, in every repository`
    : `Merge into ${current}`;

  return (
    <ActionDialog
      title={isMerge ? mergeTitle : `Rebase ${current}`}
      okText={isMerge ? 'Merge' : 'Rebase'}
      canSubmit={Boolean(branch) && behind.length === 0}
      onSubmit={() => (isMerge ? run('merge', { branch, noFastForward }) : run('rebase', { branch }))}
      onClose={onClose}
    >
      <Flex vertical gap={12} align="flex-start">
        {canRebase && <Segmented options={MODES} value={mode} onChange={setMode} />}
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
        <MergeBlockedAlert reasons={behind} />
      </Flex>
    </ActionDialog>
  );
}
