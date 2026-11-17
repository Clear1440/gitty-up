import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { Outcome } from '../../../components/Field.jsx';
import { useBranches } from '../../../queries/git.js';
import { TextHelper } from '../../../utils/TextHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { findBehindBranches } from './findBehindBranches.js';
import { MergeBlockedAlert } from './MergeBlockedAlert.jsx';
import { MergePlan } from './MergePlan.jsx';

/** Merges the checked out branch into another, which has to be checked out first. */
export function MergeIntoDialog({ target, onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);
  const [noFastForward, setNoFastForward] = useState(false);
  const source = status.branch;
  const behind = findBehindBranches(branches?.local ?? [], [source, target]);
  const memberCount = status.mono?.members.length ?? 0;
  const where = status.mono
    ? ` in ${TextHelper.countOf(memberCount, 'repository', 'repositories')}`
    : '';

  return (
    <ActionDialog
      title={`Merge ${source} into ${target}${where}`}
      okText={`Merge into ${target}`}
      canSubmit={behind.length === 0}
      wide={Boolean(status.mono)}
      onSubmit={() =>
        run('mergeInto', { source, target, noFastForward, repositoryCount: memberCount })
      }
      onClose={onClose}
    >
      <Flex vertical gap={12} align="flex-start">
        <Checkbox
          checked={noFastForward}
          onChange={(event) => setNoFastForward(event.target.checked)}
        >
          Always create a merge commit, even if {target} could just move forward
        </Checkbox>
        <Outcome>
          {status.mono ? 'In each repository below, this' : 'This'} checks out{' '}
          <strong>{target}</strong> and merges <strong>{source}</strong> into it.{' '}
          {status.mono
            ? `They all stay on ${target} afterwards, and so does this tab.`
            : `You stay on ${target} afterwards.`}
        </Outcome>
        <MergePlan source={source} target={target} noFastForward={noFastForward} />
        <MergeBlockedAlert reasons={behind} />
      </Flex>
    </ActionDialog>
  );
}
