import { CreateBranchDialog } from './CreateBranchDialog.jsx';
import { DeleteBranchDialog } from './DeleteBranchDialog.jsx';
import { DeleteRemoteBranchDialog } from './DeleteRemoteBranchDialog.jsx';
import { MergeDialog } from './MergeDialog.jsx';
import { MergeIntoDialog } from './MergeIntoDialog.jsx';
import { PruneBranchesDialog } from './PruneBranchesDialog.jsx';
import { StashDialog } from './StashDialog.jsx';

const DIALOGS = {
  createBranch: CreateBranchDialog,
  deleteBranch: DeleteBranchDialog,
  deleteRemoteBranch: DeleteRemoteBranchDialog,
  merge: MergeDialog,
  mergeInto: MergeIntoDialog,
  pruneBranches: PruneBranchesDialog,
  stash: StashDialog,
};

/** Renders whichever dialog `openDialog` from the repository context asked for. */
export function RepositoryDialogs({ dialog, onClose }) {
  if (!dialog) return null;
  const Dialog = DIALOGS[dialog.type];
  return <Dialog {...dialog.props} onClose={onClose} />;
}
