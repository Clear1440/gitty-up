/** Compares folders loosely, as Windows ignores case and slash style. */
export function samePath(a, b) {
  const normalize = (folder) =>
    (folder ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(a) === normalize(b);
}

/** A branch name made fit for a folder name, as in feature/login → feature-login. */
const folderSafe = (text) =>
  text
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/**
 * Where a new working tree for `branch` goes unless told otherwise: beside the main
 * one, named after both, as in D:\code\app-feature-login.
 */
export function suggestWorktreeFolder(mainPath, branch) {
  if (!mainPath) return '';
  const separator = mainPath.includes('\\') ? '\\' : '/';
  const trimmed = mainPath.replace(/[\\/]+$/, '');
  const cut = trimmed.lastIndexOf(separator);
  const parent = trimmed.slice(0, cut);
  const name = trimmed.slice(cut + 1);
  const suffix = branch ? folderSafe(branch) : 'worktree';
  return `${parent}${separator}${name}-${suffix || 'worktree'}`;
}

/** The name of the local branch a branch name would check out: origin/x becomes x. */
export function localNameOf(branchName, remoteBranches = []) {
  return remoteBranches.find(({ name }) => name === branchName)?.localName ?? branchName;
}
