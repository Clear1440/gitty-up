const LOCAL_PREFIX = 'refs/heads/';
const REMOTE_PREFIX = 'refs/remotes/';

/** Remote preferred whenever a repository has it, as git's own default name. */
const PREFERRED_REMOTE = 'origin';

/** Names of branches, remotes and commits, as git spells them. */
export class GitRefHelper {
  /** refs/heads/name: the full name, which can't be mistaken for a tag or an option. */
  static toLocalRef(branch) {
    return `${LOCAL_PREFIX}${branch}`;
  }

  /** refs/remotes/name, for a remote branch such as origin/main. */
  static toRemoteRef(branch) {
    return `${REMOTE_PREFIX}${branch}`;
  }

  static isLocalRef(ref) {
    return ref.startsWith(LOCAL_PREFIX);
  }

  static isRemoteRef(ref) {
    return ref.startsWith(REMOTE_PREFIX);
  }

  /** A local branch's name from its full ref. Anything else comes back unchanged. */
  static fromLocalRef(ref) {
    return GitRefHelper.isLocalRef(ref) ? ref.slice(LOCAL_PREFIX.length) : ref;
  }

  /**
   * A remote branch's name, such as origin/main, from its full ref. Anything else comes
   * back unchanged.
   */
  static fromRemoteRef(ref) {
    return GitRefHelper.isRemoteRef(ref) ? ref.slice(REMOTE_PREFIX.length) : ref;
  }

  /** Splits "origin/feature/x" into its remote and the branch's name on that remote. */
  static splitRemoteName(name, remoteNames) {
    const remote = remoteNames.find((candidate) => name.startsWith(`${candidate}/`));
    return { remote: remote ?? null, localName: remote ? name.slice(remote.length + 1) : name };
  }

  /** The remote to use when none is named: origin if there is one, else the first. */
  static pickDefaultRemote(remotes) {
    return remotes.includes(PREFERRED_REMOTE) ? PREFERRED_REMOTE : (remotes[0] ?? null);
  }

  /** The abbreviated hash git shows by default. */
  static shortHash(hash) {
    return hash.slice(0, 7);
  }
}
