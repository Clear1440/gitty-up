import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

/** Merges the checked out branch into another, which has to be checked out first. */
export function MergeIntoDialog({ target, onClose }) {
  const { status, run } = useRepositoryContext();
  const [noFastForward, setNoFastForward] = useState(false);
  const source = status.branch;

  return (
    <ActionDialog
      title={`Merge ${source} into ${target}`}
      okText="Merge"
      onSubmit={() => run('mergeInto', { source, target, noFastForward })}
      onClose={onClose}
    >
      <Flex vertical gap={12} align="flex-start">
        <p style={{ margin: 0 }}>
          This checks out {target} and merges {source} into it. You stay on {target} afterwards.
        </p>
        <Checkbox
          checked={noFastForward}
          onChange={(event) => setNoFastForward(event.target.checked)}
        >
          Always create a merge commit
        </Checkbox>
      </Flex>
    </ActionDialog>
  );
}
