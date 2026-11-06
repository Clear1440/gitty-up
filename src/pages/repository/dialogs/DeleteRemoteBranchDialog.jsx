import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useRepositoryContext } from '../RepositoryContext.js';

export function DeleteRemoteBranchDialog({ name, remote, localName, onClose }) {
  const { run } = useRepositoryContext();

  return (
    <ActionDialog
      title={`Delete ${name}?`}
      okText="Delete from remote"
      danger
      onSubmit={() => run('deleteRemoteBranch', { name })}
      onClose={onClose}
    >
      This removes {localName} from {remote} for everyone using it. Any local branch stays.
    </ActionDialog>
  );
}
