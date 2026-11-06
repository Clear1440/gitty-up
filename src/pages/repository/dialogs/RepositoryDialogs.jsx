import { CheckoutDialog } from './CheckoutDialog.jsx';
import { CreateBranchDialog } from './CreateBranchDialog.jsx';
import { DeleteBranchDialog } from './DeleteBranchDialog.jsx';
import { MergeDialog } from './MergeDialog.jsx';
import { MergeIntoDialog } from './MergeIntoDialog.jsx';
import { StashDialog } from './StashDialog.jsx';

const DIALOGS = {
  checkout: CheckoutDialog,
  createBranch: CreateBranchDialog,
  deleteBranch: DeleteBranchDialog,
  merge: MergeDialog,
  mergeInto: MergeIntoDialog,
  stash: StashDialog,
};

/** Renders whichever dialog `openDialog` from the repository context asked for. */
export function RepositoryDialogs({ dialog, onClose }) {
  if (!dialog) return null;
  const Dialog = DIALOGS[dialog.type];
  return <Dialog {...dialog.props} onClose={onClose} />;
}
