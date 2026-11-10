import { Checkbox, Flex } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { BranchHelper } from '../../../utils/BranchHelper.js';
import { useRepositoryContext } from '../RepositoryContext.js';

function describeDelete({ isMono, upstream, deleteRemote }) {
  if (isMono) {
    return deleteRemote
      ? 'This removes the local branch from every repository here, and each one’s copy on its remote for everyone using it.'
      : 'This removes the local branch from every repository here. Any copy on a remote stays.';
  }
  if (deleteRemote) return `This removes the local branch, and ${upstream} for everyone using it.`;
  return upstream
    ? `This removes the local branch. ${upstream} stays.`
    : 'This removes the local branch.';
}

/** `upstream` is the branch's copy on a remote, such as origin/topic, if it still exists. */
export function DeleteBranchDialog({ name, upstream, onClose }) {
  const { repository, run } = useRepositoryContext();
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
        <span>{describeDelete({ isMono: repository.isMono, upstream, deleteRemote })}</span>
        <Checkbox checked={force} onChange={(event) => setForce(event.target.checked)}>
          Delete even if it has unmerged commits
        </Checkbox>
        {upstream && !BranchHelper.isProtectedUpstream(upstream) && (
          <Checkbox
            checked={deleteRemote}
            onChange={(event) => setDeleteRemote(event.target.checked)}
          >
            {/* Each repository tracks its own remote, which may not share this name. */}
            {repository.isMono
              ? 'Also delete it from each repository’s remote'
              : `Also delete ${upstream} from the remote`}
          </Checkbox>
        )}
      </Flex>
    </ActionDialog>
  );
}
