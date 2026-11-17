import { Checkbox, Flex, Segmented } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Field, Outcome } from '../../../components/Field.jsx';
import { useBranches } from '../../../queries/git.js';
import { BranchHelper } from '../../../utils/BranchHelper.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { StatusHelper } from '../StatusHelper.js';
import { BranchSelect } from './BranchSelect.jsx';
import { findBehindBranches } from './findBehindBranches.js';
import { MergeBlockedAlert } from './MergeBlockedAlert.jsx';
import { MergePlan } from './MergePlan.jsx';

const MODES = [
  { label: 'Merge', value: 'merge' },
  { label: 'Rebase', value: 'rebase' },
];

/**
 * The branch to offer when none was asked for: main, else master, as that is what a
 * branch is most often brought up to date with. None when that is the branch you're on.
 */
function pickDefaultBranch(branches, current) {
  if (!branches || BranchHelper.isMainBranch(current)) return undefined;
  const local = branches.local.map(({ name }) => name).filter((name) => name !== current);
  return (
    BranchHelper.pickMainBranch(local) ??
    BranchHelper.pickRemoteMainBranch(branches.remote.map(({ name }) => name)) ??
    undefined
  );
}

export function MergeDialog({ branch: initialBranch, mode: initialMode = 'merge', onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);
  const [mode, setMode] = useState(initialMode);
  const [chosenBranch, setBranch] = useState(initialBranch);
  const [noFastForward, setNoFastForward] = useState(false);

  const current = StatusHelper.currentBranchName(status);
  const branch = chosenBranch ?? pickDefaultBranch(branches, status.branch);
  // Rebasing rewrites history, so across a mono repo it stays with each repository.
  const canRebase = !repository.isMono;
  const isMerge = mode === 'merge' || !canRebase;
  const behind = isMerge ? findBehindBranches(branches?.local ?? [], [status.branch, branch]) : [];
  const other = branch ?? 'the branch you choose';
  const memberCount = status.mono?.members.length ?? 0;
  const where = status.mono
    ? ` in ${TextHelper.countOf(memberCount, 'repository', 'repositories')}`
    : '';

  return (
    <ActionDialog
      title={isMerge ? `Merge into ${current}${where}` : `Rebase ${current}`}
      okText={isMerge && branch ? `Merge ${branch} into ${current}` : isMerge ? 'Merge' : 'Rebase'}
      canSubmit={Boolean(branch) && behind.length === 0}
      onSubmit={() =>
        isMerge
          ? run('merge', { branch, noFastForward, into: current, repositoryCount: memberCount })
          : run('rebase', { branch })
      }
      onClose={onClose}
    >
      <Flex vertical gap={12} align="flex-start">
        {canRebase && <Segmented options={MODES} value={mode} onChange={setMode} />}
        <Field label={isMerge ? `Branch to merge into ${current}` : `Branch to rebase ${current} onto`}>
          <BranchSelect
            autoFocus
            excludeCurrent
            aria-label={isMerge ? 'Branch to merge' : 'Branch to rebase onto'}
            value={branch}
            onChange={setBranch}
          />
        </Field>
        {isMerge && (
          <Checkbox
            checked={noFastForward}
            onChange={(event) => setNoFastForward(event.target.checked)}
          >
            Always create a merge commit, even if {current} could just move forward
          </Checkbox>
        )}
        {isMerge ? (
          <Outcome>
            Brings the commits from <strong>{other}</strong> into <strong>{current}</strong>
            {status.mono ? ', in each repository below' : ''}.{' '}
            {branch ? `${branch} is not changed.` : 'That branch is not changed.'}
          </Outcome>
        ) : (
          <Outcome>
            Replays the commits that are only on <strong>{current}</strong> on top of{' '}
            <strong>{other}</strong>. This rewrites them, so if {current} is already pushed it
            will need a force push.
          </Outcome>
        )}
        {isMerge && <MergePlan source={branch} target={status.branch} noFastForward={noFastForward} />}
        <MergeBlockedAlert reasons={behind} />
      </Flex>
    </ActionDialog>
  );
}
