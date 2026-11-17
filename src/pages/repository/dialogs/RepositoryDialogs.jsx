import { ApplyPatchDialog } from './ApplyPatchDialog.jsx';
import { CreateBranchDialog } from './CreateBranchDialog.jsx';
import { CreateWorktreeDialog } from './CreateWorktreeDialog.jsx';
import { DeleteBranchDialog } from './DeleteBranchDialog.jsx';
import { DeleteRemoteBranchDialog } from './DeleteRemoteBranchDialog.jsx';
import { MergeDialog } from './MergeDialog.jsx';
import { MergeIntoDialog } from './MergeIntoDialog.jsx';
import { PruneBranchesDialog } from './PruneBranchesDialog.jsx';
import { PublishBranchDialog } from './PublishBranchDialog.jsx';
import { PushTargetDialog } from './PushTargetDialog.jsx';
import { RevertCommitDialog } from './RevertCommitDialog.jsx';
import { RewordCommitDialog } from './RewordCommitDialog.jsx';
import { StashDialog } from './StashDialog.jsx';
import { SwitchSpanDialog } from './SwitchSpanDialog.jsx';

const DIALOGS = {
  applyPatch: ApplyPatchDialog,
  createBranch: CreateBranchDialog,
  createWorktree: CreateWorktreeDialog,
  deleteBranch: DeleteBranchDialog,
  deleteRemoteBranch: DeleteRemoteBranchDialog,
  merge: MergeDialog,
  mergeInto: MergeIntoDialog,
  pruneBranches: PruneBranchesDialog,
  publishBranch: PublishBranchDialog,
  pushTarget: PushTargetDialog,
  revertCommit: RevertCommitDialog,
  rewordCommit: RewordCommitDialog,
  stash: StashDialog,
  switchSpan: SwitchSpanDialog,
};

/** Renders whichever dialog `openDialog` from the repository context asked for. */
export function RepositoryDialogs({ dialog, onClose }) {
  if (!dialog) return null;
  const Dialog = DIALOGS[dialog.type];
  return <Dialog {...dialog.props} onClose={onClose} />;
}
