import { ListHelper } from '../../utils/ListHelper.js';

/** Questions about a repository's status, as useStatus returns it. */
export class StatusHelper {
  /** How many files have uncommitted changes. One both staged and unstaged counts once. */
  static countChangedFiles({ staged, unstaged, conflicted }) {
    return ListHelper.countUnique([...staged, ...unstaged, ...conflicted], (file) => file.path);
  }

  /** Whether nothing at all is left to commit, conflicts included. */
  static isClean({ staged, unstaged, conflicted }) {
    return staged.length + unstaged.length + conflicted.length === 0;
  }

  /** Whether a push would create the branch on a remote, rather than update it there. */
  static needsPublishing({ upstream, upstreamGone }) {
    return !upstream || upstreamGone;
  }

  /**
   * Whether the branch tracks a remote branch of another name, as one made from
   * origin/main does. Remote names can hold slashes, so this goes by the end.
   */
  static tracksOtherName({ branch, upstream }) {
    return Boolean(branch && upstream) && !upstream.endsWith(`/${branch}`);
  }

  /** The checked out branch's name, or HEAD when no branch is checked out. */
  static currentBranchName(status) {
    return status.branch ?? 'HEAD';
  }

  /**
   * Whether git actions should wait: one is already running, or a merge, rebase or
   * cherry-pick is paused on conflicts.
   */
  static isBlocked(status, isBusy) {
    return isBusy || Boolean(status.operation);
  }
}
