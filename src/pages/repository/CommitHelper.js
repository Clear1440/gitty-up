/** Questions about a commit from the history, as useCommits returns them. */
export class CommitHelper {
  /** The abbreviated hash git shows by default. */
  static shortHash(hash) {
    return hash?.slice(0, 7);
  }

  /** Whether the checked out branch, or a detached HEAD, is on this commit. */
  static isHead(commit) {
    return commit.refs.some((ref) => ref.type === 'head');
  }

  /** Whether the commit joins two or more lines of history. */
  static isMerge(commit) {
    return commit.parents.length > 1;
  }
}
