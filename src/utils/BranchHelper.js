/**
 * Branch names that are never deleted from a remote, matched without regard to case.
 * The server keeps its own copy in server/git/GitRefHelper.js and has the final say.
 */
const PROTECTED_REMOTE_BRANCHES = new Set(['main', 'master', 'prod', 'production']);

/** The names a repository's main line usually goes by, the likelier first. */
const MAIN_BRANCHES = ['main', 'master'];

export class BranchHelper {
  /** Whether a branch is a main line, by name: main or master. */
  static isMainBranch(name) {
    return MAIN_BRANCHES.includes(name);
  }

  /** main if it is among `names`, else master, else null. */
  static pickMainBranch(names) {
    return MAIN_BRANCHES.find((main) => names.includes(main)) ?? null;
  }

  /**
   * The same among remote branches: origin/main, else origin/master, else null. Only a
   * remote's own main line counts, not a branch such as origin/team/main.
   */
  static pickRemoteMainBranch(names) {
    for (const main of MAIN_BRANCHES) {
      const remote = names.find((name) => {
        const [remoteName, ...rest] = name.split('/');
        return remoteName && rest.join('/') === main;
      });
      if (remote) return remote;
    }
    return null;
  }

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
