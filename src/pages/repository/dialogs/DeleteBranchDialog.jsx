import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

/** `upstream` is the branch's copy on a remote, such as origin/topic, if it still exists. */
export function DeleteBranchDialog({ name, upstream, onClose }) {
  const { run } = useRepositoryContext();
  const [force, setForce] = useState(false);
  const [deleteRemote, setDeleteRemote] = useState(false);

  return (
    <ActionDialog
      title={`Delete ${name}?`}
      okText="Delete branch"
      danger
      onSubmit={() =>
        run('deleteBranch', { name, force, deleteRemote, upstream: deleteRemote ? upstream : null })
      }
      onClose={onClose}
    >
      <Flex vertical gap={12}>
        <span>
          {deleteRemote
            ? `This removes the local branch, and ${upstream} for everyone using it.`
            : upstream
              ? `This removes the local branch. ${upstream} stays.`
              : 'This removes the local branch.'}
        </span>
        <Checkbox checked={force} onChange={(event) => setForce(event.target.checked)}>
          Delete even if it has unmerged commits
        </Checkbox>
        {upstream && (
          <Checkbox
            checked={deleteRemote}
            onChange={(event) => setDeleteRemote(event.target.checked)}
          >
            Also delete {upstream} from the remote
          </Checkbox>
        )}
      </Flex>
    </ActionDialog>
  );
}
