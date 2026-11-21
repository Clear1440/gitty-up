import { http } from './client.js';

const route = (repositoryId, path) => `/repositories/${repositoryId}${path}`;

export const gitApi = {
  // Reads. Each takes `{ signal }` last, to call it off.
  getStatus: (id, options) => http.get(route(id, '/status'), undefined, options),
  getBranches: (id, options) => http.get(route(id, '/branches'), undefined, options),
  getCommits: (id, { ref, limit, skip }, options) =>
    http.get(route(id, '/commits'), { ref, limit, skip }, options),
  getCommitDetails: (id, hash, options) =>
    http.get(route(id, `/commits/${hash}`), undefined, options),
  getCommitDiff: (id, hash, { path, originalPath, fullFile, ignoreWhitespace }, options) =>
    http.get(
      route(id, `/commits/${hash}/diff`),
      { path, originalPath, fullFile, ignoreWhitespace },
      options,
    ),
  getRemotes: (id, options) => http.get(route(id, '/remotes'), undefined, options),
  getLastCommit: (id) => http.get(route(id, '/last-commit')),
  getPullRequests: (id, options) => http.get(route(id, '/pull-requests'), undefined, options),
  /** Which remotes are on a host that pull requests can be opened on. */
  getRemoteHosts: (id, options) => http.get(route(id, '/remote-hosts'), undefined, options),
  /** What a new pull request for `branch` starts out as. `remote` marks a remote branch. */
  getPullRequestDraft: (id, { branch, remote, base }, options) =>
    http.get(route(id, '/pull-requests/draft'), { branch, remote, base }, options),
  /**
   * Opens a pull request. Resolves `{ created, url, hostName, number, reason }`: when not
   * created, `url` is the host's page that finishes it.
   */
  createPullRequest: (id, { branch, remote, base, title, body, draft }) =>
    http.post(route(id, '/pull-requests'), { branch, remote, base, title, body, draft }),
  getStashes: (id, options) => http.get(route(id, '/stashes'), undefined, options),
  getReflog: (id, { ref, limit } = {}, options) =>
    http.get(route(id, '/reflog'), { ref, limit }, options),
  getWorktrees: (id, options) => http.get(route(id, '/worktrees'), undefined, options),
  getTags: (id, options) => http.get(route(id, '/tags'), undefined, options),
  /** The remotes that have a tag. This asks each of them, so it can take a moment. */
  getTagRemotes: (id, { name }, options) => http.get(route(id, '/tags/remotes'), { name }, options),
  getStashDetails: (id, hash, options) =>
    http.get(route(id, `/stashes/${hash}`), undefined, options),
  getStashDiff: (id, hash, { path, originalPath, untracked, fullFile, ignoreWhitespace }, options) =>
    http.get(
      route(id, `/stashes/${hash}/diff`),
      { path, originalPath, untracked, fullFile, ignoreWhitespace },
      options,
    ),
  /** `source` is "commit" with `hash`, "stash" with `ref`, or "uncommitted". */
  createPatch: (id, { source, hash, ref }) => http.get(route(id, '/patch'), { source, hash, ref }),
  getScripts: (id, options) => http.get(route(id, '/scripts'), undefined, options),
  /** Starts a script and resolves with the run at once. Follow it with `scriptRunEvents`. */
  startScript: (id, { name, params }) => http.post(route(id, '/scripts/runs'), { name, params }),
  scriptRunEvents: (id, runId) => http.events(route(id, `/scripts/runs/${runId}/events`)),
  stopScript: (id, runId) => http.post(route(id, `/scripts/runs/${runId}/stop`)),
  getDiff: (id, { path, staged, untracked, fullFile, ignoreWhitespace }, options) =>
    http.get(route(id, '/diff'), { path, staged, untracked, fullFile, ignoreWhitespace }, options),
  getConflict: (id, { path }, options) => http.get(route(id, '/conflict'), { path }, options),
  /** Branches that some, but not all, of a mono repo's group have. */
  getSpanningBranches: (id, options) =>
    http.get(route(id, '/spanning-branches'), undefined, options),
  /** Where each of a mono repo's repositories would go to work on `branch` across them. */
  getSpanPlan: (id, { branch }, options) =>
    http.get(route(id, '/span-plan'), { branch }, options),
  /** What merging `source` into `target` would bring in, per repository in a mono repo. */
  previewMerge: (id, { source, target }, options) =>
    http.get(route(id, '/merge-preview'), { source, target }, options),

  // Syncing
  fetch: (id) => http.post(route(id, '/fetch')),
  pull: (id, { mode }) => http.post(route(id, '/pull'), { mode }),
  /** `toUpstream` pushes into an upstream that belongs to another branch, on purpose. */
  push: (id, { force = false, remote, upstreamName, toUpstream } = {}) =>
    http.post(route(id, '/push'), { force, remote, upstreamName, toUpstream }),

  // Branches
  checkout: (id, { branch, remote }) => http.post(route(id, '/checkout'), { branch, remote }),
  switchSpan: (id, { branch }) => http.post(route(id, '/switch-span'), { branch }),
  createBranch: (id, { name, startPoint, switchTo }) =>
    http.post(route(id, '/branches'), { name, startPoint, switchTo }),
  renameBranch: (id, { name, newName, renameRemote }) =>
    http.post(route(id, '/branches/rename'), { name, newName, renameRemote }),
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
  revert: (id, { hash, keepMessage }) => http.post(route(id, '/revert'), { hash, keepMessage }),
  resetToCommit: (id, { hash, mode }) => http.post(route(id, '/reset'), { hash, mode }),
  abortOperation: (id) => http.post(route(id, '/operation/abort')),
  continueOperation: (id) => http.post(route(id, '/operation/continue')),

  // Working tree
  stage: (id, { paths } = {}) => http.post(route(id, '/stage'), { paths }),
  unstage: (id, { paths } = {}) => http.post(route(id, '/unstage'), { paths }),
  stageLines: (id, selection) => http.post(route(id, '/stage-lines'), selection),
  discardLines: (id, selection) => http.post(route(id, '/discard-lines'), selection),
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

  // Tags. `hash` is the commit to tag, and a `message` makes the tag annotated.
  createTag: (id, { name, hash, message, push, remote }) =>
    http.post(route(id, '/tags'), { name, hash, message, push, remote }),
  pushTag: (id, { name, remote }) => http.post(route(id, '/tags/push'), { name, remote }),
  /** `remotes` are the remotes to delete it from as well. */
  deleteTag: (id, { name, remotes }) => http.post(route(id, '/tags/delete'), { name, remotes }),

  // Worktrees. `path` is a working tree's folder.
  addWorktree: (id, { path, branch, newBranch, startPoint }) =>
    http.post(route(id, '/worktrees'), { path, branch, newBranch, startPoint }),
  removeWorktree: (id, { path, force }) => http.post(route(id, '/worktrees/remove'), { path, force }),
  lockWorktree: (id, { path, reason }) => http.post(route(id, '/worktrees/lock'), { path, reason }),
  unlockWorktree: (id, { path }) => http.post(route(id, '/worktrees/unlock'), { path }),
  pruneWorktrees: (id) => http.post(route(id, '/worktrees/prune')),
};
