const REVIEW_TEXT = {
  approved: 'Approved',
  'changes-requested': 'Changes requested',
  'review-required': 'Review required',
};

const CHECKS_TEXT = {
  passing: 'Checks passing',
  failing: 'Checks failing',
  pending: 'Checks running',
  none: 'No checks',
};

/**
 * A local branch's live upstream, such as origin/topic, as `{ remote, name }`, or null
 * when it has none, or it is gone.
 */
function splitUpstream(branch) {
  if (!branch.upstream || branch.upstreamGone) return null;
  const slash = branch.upstream.indexOf('/');
  if (slash <= 0) return null;
  return { remote: branch.upstream.slice(0, slash), name: branch.upstream.slice(slash + 1) };
}

/** Pull requests from the server, and how a branch shows its own. */
export class PullRequestHelper {
  /**
   * The one thing to say about a pull request at a glance, or null for nothing: failing
   * checks first, then changes asked for, then checks still running, then all clear.
   */
  static summarize({ review, checks }) {
    if (checks === 'failing') return 'failing';
    if (review === 'changes-requested') return 'changes-requested';
    if (checks === 'pending') return 'pending';
    if (checks === 'passing' || review === 'approved') return 'passing';
    return null;
  }

  /** A pull request's tooltip: its number and title, then its review and checks if known. */
  static describe({ number, title, draft, review, checks }) {
    return [
      `${draft ? 'Draft pull request' : 'Pull request'} #${number}: ${title}`,
      REVIEW_TEXT[review],
      CHECKS_TEXT[checks],
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * The branch's name on its remote, which is what a pull request names: origin/topic's
   * is topic, and so is the name of a local branch tracking it. A local branch with no
   * upstream would be pushed under its own name.
   */
  static remoteNameOf(branch, kind) {
    if (kind === 'remote') return branch.localName;
    return splitUpstream(branch)?.name ?? branch.name;
  }

  /** The remote a pull request for the branch would be opened on, or null. */
  static remoteOf(branch, kind, defaultRemote) {
    if (kind === 'remote') return branch.remote ?? null;
    return splitUpstream(branch)?.remote ?? defaultRemote ?? null;
  }

  /** The open pull request for a branch, from a list of them, or null. */
  static findForBranch(pullRequests, branch, kind) {
    const name = PullRequestHelper.remoteNameOf(branch, kind);
    return (pullRequests ?? []).find((pull) => pull.branch === name) ?? null;
  }
}
