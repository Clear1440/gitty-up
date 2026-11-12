import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useBranches } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { findBehindBranches } from './findBehindBranches.js';
import { MergeBlockedAlert } from './MergeBlockedAlert.jsx';

/** Merges the checked out branch into another, which has to be checked out first. */
export function MergeIntoDialog({ target, onClose }) {
  const { repository, status, run } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);
  const [noFastForward, setNoFastForward] = useState(false);
  const source = status.branch;
  const behind = findBehindBranches(branches?.local ?? [], [source, target]);

  return (
    <ActionDialog
      title={`Merge ${source} into ${target}`}
      okText="Merge"
      canSubmit={behind.length === 0}
      onSubmit={() => run('mergeInto', { source, target, noFastForward })}
      onClose={onClose}
    >
      <Flex vertical gap={12} align="flex-start">
        <p style={{ margin: 0 }}>
          {repository.isMono
            ? `In every repository here, this checks out ${target} and merges ${source} into it. They all stay on ${target} afterwards.`
            : `This checks out ${target} and merges ${source} into it. You stay on ${target} afterwards.`}
        </p>
        <Checkbox
          checked={noFastForward}
          onChange={(event) => setNoFastForward(event.target.checked)}
        >
          Always create a merge commit
        </Checkbox>
        <MergeBlockedAlert reasons={behind} />
      </Flex>
    </ActionDialog>
  );
}
