import { PathHelper } from '../../utils/PathHelper.js';

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
  const suffix = (branch && folderSafe(branch)) || 'worktree';
  return `${PathHelper.trimEnd(mainPath)}-${suffix}`;
}

/** The name of the local branch a branch name would check out: origin/x becomes x. */
export function localNameOf(branchName, remoteBranches = []) {
  return remoteBranches.find(({ name }) => name === branchName)?.localName ?? branchName;
}
