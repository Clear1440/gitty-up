import { http } from './client.js';

const route = (repositoryId, path) => `/repositories/${repositoryId}${path}`;

export const gitApi = {
  // Reads
  getStatus: (id) => http.get(route(id, '/status')),
  getBranches: (id) => http.get(route(id, '/branches')),
  getCommits: (id, { ref, limit, skip }) => http.get(route(id, '/commits'), { ref, limit, skip }),
  getCommitDetails: (id, hash) => http.get(route(id, `/commits/${hash}`)),
  getCommitDiff: (id, hash, { path, originalPath, fullFile }) =>
    http.get(route(id, `/commits/${hash}/diff`), { path, originalPath, fullFile }),
  getRemotes: (id) => http.get(route(id, '/remotes')),
  getLastCommit: (id) => http.get(route(id, '/last-commit')),
  getPullRequests: (id) => http.get(route(id, '/pull-requests')),
  getStashes: (id) => http.get(route(id, '/stashes')),
  getWorktrees: (id) => http.get(route(id, '/worktrees')),
  getStashDetails: (id, hash) => http.get(route(id, `/stashes/${hash}`)),
  getStashDiff: (id, hash, { path, originalPath, untracked, fullFile }) =>
    http.get(route(id, `/stashes/${hash}/diff`), { path, originalPath, untracked, fullFile }),
  /** `source` is "commit" with `hash`, "stash" with `ref`, or "uncommitted". */
  createPatch: (id, { source, hash, ref }) => http.get(route(id, '/patch'), { source, hash, ref }),
  getScripts: (id) => http.get(route(id, '/scripts')),
  /** Starts a script and resolves with the run at once. Follow it with `scriptRunEvents`. */
  startScript: (id, { name, params }) => http.post(route(id, '/scripts/runs'), { name, params }),
  scriptRunEvents: (id, runId) => http.events(route(id, `/scripts/runs/${runId}/events`)),
  stopScript: (id, runId) => http.post(route(id, `/scripts/runs/${runId}/stop`)),
  getDiff: (id, { path, staged, untracked, fullFile }) =>
    http.get(route(id, '/diff'), { path, staged, untracked, fullFile }),
  getConflict: (id, { path }) => http.get(route(id, '/conflict'), { path }),

  // Syncing
  fetch: (id) => http.post(route(id, '/fetch')),
  pull: (id, { mode }) => http.post(route(id, '/pull'), { mode }),
  /** `toUpstream` pushes into an upstream that belongs to another branch, on purpose. */
  push: (id, { force = false, remote, upstreamName, toUpstream } = {}) =>
    http.post(route(id, '/push'), { force, remote, upstreamName, toUpstream }),

  // Branches
  checkout: (id, { branch, remote }) => http.post(route(id, '/checkout'), { branch, remote }),
  createBranch: (id, { name, startPoint, switchTo }) =>
    http.post(route(id, '/branches'), { name, startPoint, switchTo }),
  deleteBranch: (id, { name, force, deleteRemote }) =>
    http.delete(route(id, `/branches/${encodeURIComponent(name)}`), { force, deleteRemote }),
  deleteRemoteBranch: (id, { name }) =>
    http.delete(route(id, `/remote-branches/${encodeURIComponent(name)}`)),
  pruneBranches: (id, { force }) => http.post(route(id, '/prune-branches'), { force }),
  merge: (id, { branch, noFastForward }) =>
    http.post(route(id, '/merge'), { branch, noFastForward }),
  mergeInto: (id, { target, noFastForward }) =>
    http.post(route(id, '/merge-into'), { target, noFastForward }),
  rebase: (id, { branch }) => http.post(route(id, '/rebase'), { branch }),
  checkoutCommit: (id, { hash }) => http.post(route(id, '/checkout-commit'), { hash }),
  cherryPick: (id, { hash }) => http.post(route(id, '/cherry-pick'), { hash }),
  resetToCommit: (id, { hash, mode }) => http.post(route(id, '/reset'), { hash, mode }),
  abortOperation: (id) => http.post(route(id, '/operation/abort')),
  continueOperation: (id) => http.post(route(id, '/operation/continue')),

  // Working tree
  stage: (id, { paths } = {}) => http.post(route(id, '/stage'), { paths }),
  unstage: (id, { paths } = {}) => http.post(route(id, '/unstage'), { paths }),
  stageLines: (id, selection) => http.post(route(id, '/stage-lines'), selection),
  resolveConflict: (id, { path, content, side, remove }) =>
    http.post(route(id, '/resolve-conflict'), { path, content, side, remove }),
  /** Puts a resolved file back in conflict, while its merge is still under way. */
  unresolveConflict: (id, { path }) => http.post(route(id, '/unresolve-conflict'), { path }),
  discard: (id, { paths }) => http.post(route(id, '/discard'), { paths }),
  discardAll: (id) => http.post(route(id, '/discard-all')),
  /** `kind` is "file", "folder" or "extension". */
  ignore: (id, { paths, kind }) => http.post(route(id, '/ignore'), { paths, kind }),
  rewordLastCommit: (id, { hash, message }) => http.post(route(id, '/reword'), { hash, message }),
  commit: (id, { message, amend, stageAll }) =>
    http.post(route(id, '/commit'), { message, amend, stageAll }),
  undoCommit: (id, { hash, allowPushed }) =>
    http.post(route(id, '/undo-commit'), { hash, allowPushed }),
  stash: (id, { message, paths } = {}) => http.post(route(id, '/stash'), { message, paths }),
  stashApply: (id, { ref }) => http.post(route(id, '/stash/apply'), { ref }),
  stashPop: (id, { ref } = {}) => http.post(route(id, '/stash/pop'), { ref }),
  stashDrop: (id, { ref }) => http.post(route(id, '/stash/drop'), { ref }),
  applyPatch: (id, { patch, mode }) => http.post(route(id, '/patch/apply'), { patch, mode }),

  // Worktrees. `path` is a working tree's folder.
  addWorktree: (id, { path, branch, newBranch, startPoint }) =>
    http.post(route(id, '/worktrees'), { path, branch, newBranch, startPoint }),
  removeWorktree: (id, { path, force }) => http.post(route(id, '/worktrees/remove'), { path, force }),
  lockWorktree: (id, { path, reason }) => http.post(route(id, '/worktrees/lock'), { path, reason }),
  unlockWorktree: (id, { path }) => http.post(route(id, '/worktrees/unlock'), { path }),
  pruneWorktrees: (id) => http.post(route(id, '/worktrees/prune')),
};
