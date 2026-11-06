import { useState } from 'react';
import { ActionDialog } from '../../../components/ActionDialog.jsx';
import { useBranches } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { BranchSelect } from './BranchSelect.jsx';

export function CheckoutDialog({ onClose }) {
  const { repository, run } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);
  const [branch, setBranch] = useState();

  const handleSubmit = () => {
    const remote = branches.remote.some((candidate) => candidate.name === branch);
    return run('checkout', { branch, remote });
  };

  return (
    <ActionDialog
      title="Checkout a branch"
      okText="Checkout"
      canSubmit={Boolean(branch)}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <BranchSelect autoFocus excludeCurrent value={branch} onChange={setBranch} />
    </ActionDialog>
  );
}
