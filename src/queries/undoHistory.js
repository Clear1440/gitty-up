/**
 * What Ctrl+Z takes back, per repository. Each git action that can be reversed leaves a
 * step saying how. Actions that move the branch, such as a pull or a checkout, clear the
 * steps before them, as those no longer apply to what is checked out.
 *
 * A step is `{ kind: 'actions', actions: [{ name, input }], label }`, run in order, or
 * `{ kind: 'commit' }`, which undoes the latest commit.
 */

const MAX_STEPS = 50;

/** Actions that leave the branch and its commits as they were, so earlier steps still apply. */
const KEEPS_HISTORY = new Set([
  'fetch',
  'push',
  'publishBranch',
  'deleteRemoteBranch',
  'stage',
  'unstage',
  'stageLines',
  'resolveConflict',
  'unresolveConflict',
  'discard',
  'ignore',
  'rewordLastCommit',
  'addWorktree',
  'removeWorktree',
  'lockWorktree',
  'unlockWorktree',
  'pruneWorktrees',
]);

const histories = new Map();

const describePaths = (paths) => (paths.length === 1 ? paths[0] : `${paths.length} files`);

/**
 * Splits the paths being staged into the conflicted ones, which staging resolves, and
 * the rest. `status` is the status from before staging.
 */
function splitConflicted(paths, status) {
  const conflicted = new Set((status?.conflicted ?? []).map((file) => file.path));
  return {
    resolved: paths.filter((path) => conflicted.has(path)),
    staged: paths.filter((path) => !conflicted.has(path)),
  };
}

/** The step that takes back `name` run with `input`, or null if it can't be taken back. */
export function undoStepFor(name, input = {}, statusBefore = null) {
  switch (name) {
    case 'stage': {
      const everything = [
        ...(statusBefore?.unstaged ?? []),
        ...(statusBefore?.conflicted ?? []),
      ].map((file) => file.path);
      const paths = input.paths ?? everything;
      if (paths.length === 0) return null;
      const { resolved, staged } = splitConflicted(paths, statusBefore);
      return {
        kind: 'actions',
        actions: [
          ...(staged.length > 0 ? [{ name: 'unstage', input: { paths: staged } }] : []),
          ...resolved.map((path) => ({ name: 'unresolveConflict', input: { path } })),
        ],
        label: `Undid staging ${describePaths(paths)}`,
      };
    }
    case 'unstage': {
      const staged = statusBefore?.staged ?? [];
      const paths = input.paths ?? staged.map((file) => file.path);
      if (paths.length === 0) return null;
      // A staged rename is the old path's deletion as well as the new path's addition, so
      // staging it again takes both, or the deletion would be left unstaged.
      const originals = staged
        .filter((file) => file.originalPath && paths.includes(file.path))
        .map((file) => file.originalPath)
        .filter((original) => !paths.includes(original));
      return {
        kind: 'actions',
        actions: [{ name: 'stage', input: { paths: [...paths, ...originals] } }],
        label: `Staged ${describePaths(paths)} again`,
      };
    }
    case 'resolveConflict':
      return {
        kind: 'actions',
        actions: [{ name: 'unresolveConflict', input: { path: input.path } }],
        label: `${input.path} is back in conflict`,
      };
    case 'commit':
      return { kind: 'commit' };
    default:
      return null;
  }
}

function historyOf(repositoryId) {
  if (!histories.has(repositoryId)) histories.set(repositoryId, []);
  return histories.get(repositoryId);
}

/** Notes that `name` ran with `input`, with the status from before it ran. */
export function recordAction(repositoryId, name, input, statusBefore) {
  const history = historyOf(repositoryId);
  if (!KEEPS_HISTORY.has(name)) history.length = 0;
  const step = undoStepFor(name, input, statusBefore);
  if (!step) return;
  history.push(step);
  if (history.length > MAX_STEPS) history.shift();
}

/**
 * Notes that `name` failed. A failure can still change the repository, as a merge that
 * stops on conflicts does, so one that could move the branch clears the earlier steps.
 */
export function recordFailedAction(repositoryId, name) {
  if (!KEEPS_HISTORY.has(name)) historyOf(repositoryId).length = 0;
}

/** Takes the latest step off the history, or null when there is none. */
export function takeUndoStep(repositoryId) {
  return historyOf(repositoryId).pop() ?? null;
}

/** For tests: forgets every repository's history. */
export function clearUndoHistories() {
  histories.clear();
}
