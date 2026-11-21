/** Questions about reflog entries, as useReflog returns them. */
export class ReflogHelper {
  /** The entries no branch or tag reaches any more: the ones that can be lost for good. */
  static onlyLost(entries) {
    return entries.filter(({ reachable }) => !reachable);
  }

  /** How many different commits are lost. A commit checked out twice is listed twice. */
  static countLost(entries) {
    return new Set(ReflogHelper.onlyLost(entries).map(({ hash }) => hash)).size;
  }

  /** The entries to list: all of them, or only the lost ones. */
  static visible(entries, lostOnly) {
    return lostOnly ? ReflogHelper.onlyLost(entries) : entries;
  }

  /** The word shown for what was done, as in "Commit" or "Cherry-pick". */
  static actionLabel(action) {
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  /** What an entry says happened, using the action when the message is empty. */
  static describe({ action, message }) {
    return message || ReflogHelper.actionLabel(action);
  }
}
