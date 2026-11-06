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
  getPullRequests: (id) => http.get(route(id, '/pull-requests')),
  getStashes: (id) => http.get(route(id, '/stashes')),
  getDiff: (id, { path, staged, untracked, fullFile }) =>
    http.get(route(id, '/diff'), { path, staged, untracked, fullFile }),

  // Syncing
  fetch: (id) => http.post(route(id, '/fetch')),
  pull: (id, { mode }) => http.post(route(id, '/pull'), { mode }),
  push: (id, { force = false } = {}) => http.post(route(id, '/push'), { force }),

  // Branches
  checkout: (id, { branch, remote }) => http.post(route(id, '/checkout'), { branch, remote }),
  createBranch: (id, { name, startPoint, switchTo }) =>
    http.post(route(id, '/branches'), { name, startPoint, switchTo }),
  deleteBranch: (id, { name, force }) =>
    http.delete(route(id, `/branches/${encodeURIComponent(name)}`), { force }),
  deleteRemoteBranch: (id, { name }) =>
    http.delete(route(id, `/remote-branches/${encodeURIComponent(name)}`)),
  pruneBranches: (id, { force }) => http.post(route(id, '/prune-branches'), { force }),
  merge: (id, { branch, noFastForward }) =>
    http.post(route(id, '/merge'), { branch, noFastForward }),
  mergeInto: (id, { target, noFastForward }) =>
    http.post(route(id, '/merge-into'), { target, noFastForward }),
  rebase: (id, { branch }) => http.post(route(id, '/rebase'), { branch }),
  abortOperation: (id) => http.post(route(id, '/operation/abort')),
  continueOperation: (id) => http.post(route(id, '/operation/continue')),

  // Working tree
  stage: (id, { paths } = {}) => http.post(route(id, '/stage'), { paths }),
  unstage: (id, { paths } = {}) => http.post(route(id, '/unstage'), { paths }),
  stageLines: (id, selection) => http.post(route(id, '/stage-lines'), selection),
  discard: (id, { paths }) => http.post(route(id, '/discard'), { paths }),
  commit: (id, { message, amend, stageAll }) =>
    http.post(route(id, '/commit'), { message, amend, stageAll }),
  stash: (id, { message } = {}) => http.post(route(id, '/stash'), { message }),
  stashApply: (id, { ref }) => http.post(route(id, '/stash/apply'), { ref }),
  stashPop: (id, { ref } = {}) => http.post(route(id, '/stash/pop'), { ref }),
  stashDrop: (id, { ref }) => http.post(route(id, '/stash/drop'), { ref }),
};
