/**
 * Branch names that are never deleted from a remote, matched without regard to case.
 * The server keeps its own copy in server/git/GitRefHelper.js and has the final say.
 */
const PROTECTED_REMOTE_BRANCHES = new Set(['main', 'master', 'prod', 'production']);

export class BranchHelper {
  /** Whether a branch, named as it is on its remote (main, not origin/main), is protected there. */
  static isProtectedOnRemote(localName) {
    return Boolean(localName) && PROTECTED_REMOTE_BRANCHES.has(localName.toLowerCase());
  }

  /** Whether an upstream such as origin/main names a protected branch on its remote. */
  static isProtectedUpstream(upstream) {
    if (!upstream) return false;
    const slash = upstream.indexOf('/');
    return BranchHelper.isProtectedOnRemote(slash < 0 ? upstream : upstream.slice(slash + 1));
  }
}
