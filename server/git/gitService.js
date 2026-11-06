import fs from 'node:fs/promises';
import path from 'node:path';
import { ApiError, badRequest, gitFailure } from '../errors.js';
import {
  BRANCH_FORMAT,
  COMMIT_FORMAT,
  STASH_FORMAT,
  parseBranches,
  parseCommits,
  parseStashes,
  parseStatus,
} from './parsers.js';
import { NETWORK_TIMEOUT_MS, runGit, runGitOnPaths } from './runGit.js';

const OPERATION_MARKERS = [
  { operation: 'rebase', marker: 'rebase-merge' },
  { operation: 'rebase', marker: 'rebase-apply' },
  { operation: 'merge', marker: 'MERGE_HEAD' },
];

const PULL_MODE_FLAGS = { merge: '--no-rebase', rebase: '--rebase', 'ff-only': '--ff-only' };

/** A ref that begins with "-" would be read by git as an option. */
function assertRef(ref) {
  if (typeof ref !== 'string' || !ref.trim() || ref.startsWith('-')) {
    throw badRequest(`Invalid git ref: ${ref}`);
  }
}

async function assertValidBranchName(repoPath, name) {
  assertRef(name);
  try {
    await runGit(repoPath, ['check-ref-format', '--branch', name]);
  } catch {
    throw badRequest(`"${name}" is not a valid branch name.`);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Resolves a user-supplied folder to the root of its working tree. */
export async function resolveWorkingTree(folderPath) {
  try {
    const topLevel = await runGit(folderPath, ['rev-parse', '--show-toplevel']);
    return path.resolve(topLevel.trim());
  } catch {
    throw badRequest(`${folderPath} is not inside a git working tree.`);
  }
}

/** Clones into a new folder named `folderName` and resolves with its working tree. */
export async function clone(url, parentPath, folderName) {
  const target = path.join(parentPath, folderName);
  await runGit(parentPath, ['clone', '--', url, target], { timeout: NETWORK_TIMEOUT_MS });
  return resolveWorkingTree(target);
}

async function getOperation(repoPath) {
  const gitDir = (await runGit(repoPath, ['rev-parse', '--absolute-git-dir'])).trim();
  for (const { operation, marker } of OPERATION_MARKERS) {
    if (await exists(path.join(gitDir, marker))) return operation;
  }
  return null;
}

async function requireOperation(repoPath) {
  const operation = await getOperation(repoPath);
  if (!operation) throw gitFailure('There is no merge or rebase in progress.');
  return operation;
}

export async function getStatus(repoPath) {
  const [output, operation] = await Promise.all([
    runGit(repoPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
    getOperation(repoPath),
  ]);
  return { ...parseStatus(output), operation };
}

async function getRemotes(repoPath) {
  return (await runGit(repoPath, ['remote'])).split('\n').filter(Boolean);
}

async function getDefaultRemote(repoPath) {
  const remotes = await getRemotes(repoPath);
  return remotes.includes('origin') ? 'origin' : (remotes[0] ?? null);
}

async function getRemoteUrl(repoPath) {
  const remote = await getDefaultRemote(repoPath);
  if (!remote) return null;
  return (await runGit(repoPath, ['remote', 'get-url', remote])).trim();
}

export async function getBranches(repoPath) {
  const [output, remotes] = await Promise.all([
    runGit(repoPath, ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads', 'refs/remotes']),
    getRemotes(repoPath),
  ]);
  return parseBranches(output, remotes);
}

async function hasCommits(repoPath) {
  const output = await runGit(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    allowedExitCodes: [0, 1],
  });
  return Boolean(output.trim());
}

/**
 * Lists commits, newest first, always with children before their parents, which the
 * client's git tree relies on. `allBranches` walks every branch and tag instead of `ref`.
 */
export async function getCommits(
  repoPath,
  { ref = 'HEAD', allBranches = false, limit = 100, skip = 0 } = {},
) {
  assertRef(ref);
  if (!(await hasCommits(repoPath))) return [];
  const output = await runGit(repoPath, [
    'log',
    '--date-order',
    `--format=${COMMIT_FORMAT}`,
    `--max-count=${limit}`,
    `--skip=${skip}`,
    ...(allBranches ? ['--branches', '--remotes', '--tags', 'HEAD'] : [ref]),
    '--',
  ]);
  return parseCommits(output);
}

export async function getSummary(repoPath) {
  const [status, commits, branches, remoteUrl] = await Promise.all([
    getStatus(repoPath),
    getCommits(repoPath, { limit: 1 }),
    getBranches(repoPath),
    getRemoteUrl(repoPath),
  ]);
  const changedFiles = [...status.staged, ...status.unstaged, ...status.conflicted];
  return {
    branch: status.branch,
    detached: status.detached,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    changeCount: new Set(changedFiles.map((file) => file.path)).size,
    branchCount: branches.local.length,
    lastCommit: commits[0] ?? null,
    remoteUrl,
  };
}

export async function getStashes(repoPath) {
  return parseStashes(await runGit(repoPath, ['stash', 'list', `--format=${STASH_FORMAT}`]));
}

export async function getDiff(repoPath, { filePath, staged = false, untracked = false }) {
  if (untracked) {
    // Comparing against the null device is how git shows a brand-new file.
    // It exits 1 because the two sides differ.
    return runGit(repoPath, ['diff', '--no-index', '--', '/dev/null', filePath], {
      allowedExitCodes: [0, 1],
    });
  }
  return runGitOnPaths(repoPath, ['diff', ...(staged ? ['--cached'] : []), '--', filePath]);
}

/** Turns a failed command into a clearer error when it stopped on conflicts. */
async function reportingConflicts(
  repoPath,
  action,
  nextStep = 'Resolve them, then continue or abort.',
) {
  try {
    return await action();
  } catch (error) {
    const { conflicted } = await getStatus(repoPath);
    if (conflicted.length === 0) throw error;
    const files = conflicted.length === 1 ? '1 file' : `${conflicted.length} files`;
    throw new ApiError(
      409,
      'CONFLICTS',
      `Stopped with conflicts in ${files}. ${nextStep}`,
      error.details,
    );
  }
}

export async function fetchAll(repoPath) {
  await runGit(repoPath, ['fetch', '--all', '--prune'], { timeout: NETWORK_TIMEOUT_MS });
}

export async function pull(repoPath, { mode = 'merge' } = {}) {
  const flag = PULL_MODE_FLAGS[mode];
  if (!flag) throw badRequest(`Unknown pull mode: ${mode}`);
  await reportingConflicts(repoPath, () =>
    runGit(repoPath, ['pull', flag], { timeout: NETWORK_TIMEOUT_MS }),
  );
}

export async function push(repoPath, { force = false } = {}) {
  const { branch, upstream } = await getStatus(repoPath);
  if (!branch) throw gitFailure('Check out a branch before pushing.');

  const args = ['push', ...(force ? ['--force-with-lease'] : [])];
  if (!upstream) {
    const remote = await getDefaultRemote(repoPath);
    if (!remote) throw gitFailure('This repository has no remote to push to.');
    args.push('--set-upstream', remote, 'HEAD');
  }
  await runGit(repoPath, args, { timeout: NETWORK_TIMEOUT_MS });
}

export async function checkout(repoPath, { branch, remote = false }) {
  assertRef(branch);
  if (!remote) {
    await runGit(repoPath, ['switch', branch]);
    return;
  }

  const branches = await getBranches(repoPath);
  const target = branches.remote.find((candidate) => candidate.name === branch);
  if (!target) throw badRequest(`Unknown remote branch: ${branch}`);

  const hasLocalCopy = branches.local.some((candidate) => candidate.name === target.localName);
  await runGit(
    repoPath,
    hasLocalCopy ? ['switch', target.localName] : ['switch', '--track', branch],
  );
}

export async function createBranch(repoPath, { name, startPoint = 'HEAD', switchTo = true }) {
  await assertValidBranchName(repoPath, name);
  assertRef(startPoint);
  await runGit(
    repoPath,
    switchTo ? ['switch', '--create', name, startPoint] : ['branch', name, startPoint],
  );
}

export async function deleteBranch(repoPath, { name, force = false }) {
  assertRef(name);
  await runGit(repoPath, ['branch', force ? '-D' : '-d', name]);
}

export async function merge(repoPath, { branch, noFastForward = false }) {
  assertRef(branch);
  await reportingConflicts(repoPath, () =>
    runGit(repoPath, ['merge', '--no-edit', ...(noFastForward ? ['--no-ff'] : []), branch]),
  );
}

export async function rebase(repoPath, { branch }) {
  assertRef(branch);
  await reportingConflicts(repoPath, () => runGit(repoPath, ['rebase', branch]));
}

export async function abortOperation(repoPath) {
  const operation = await requireOperation(repoPath);
  await runGit(repoPath, [operation, '--abort']);
}

export async function continueOperation(repoPath) {
  const operation = await requireOperation(repoPath);
  await reportingConflicts(repoPath, () =>
    runGit(repoPath, operation === 'merge' ? ['commit', '--no-edit'] : ['rebase', '--continue']),
  );
}

export async function stage(repoPath, { paths } = {}) {
  await runGitOnPaths(repoPath, ['add', '--all', ...(paths ? ['--', ...paths] : [])]);
}

export async function unstage(repoPath, { paths } = {}) {
  await runGitOnPaths(repoPath, ['reset', '--quiet', ...(paths ? ['--', ...paths] : [])]);
}

export async function discard(repoPath, { paths }) {
  const { unstaged } = await getStatus(repoPath);
  const selected = unstaged.filter((file) => paths.includes(file.path));
  const untracked = selected.filter((file) => file.status === 'untracked');
  const tracked = selected.filter((file) => file.status !== 'untracked');

  if (tracked.length > 0) {
    const trackedPaths = tracked.map((file) => file.path);
    await runGitOnPaths(repoPath, ['restore', '--worktree', '--', ...trackedPaths]);
  }
  if (untracked.length > 0) {
    const untrackedPaths = untracked.map((file) => file.path);
    await runGitOnPaths(repoPath, ['clean', '--force', '--', ...untrackedPaths]);
  }
}

export async function commit(repoPath, { message, amend = false, stageAll = false }) {
  const trimmed = message?.trim();
  const { operation, conflicted } = await getStatus(repoPath);
  // Staging everything here would commit the conflict markers.
  if (conflicted.length > 0) throw gitFailure('Resolve the conflicts before committing.');

  // A merge already has a message, and an amend can keep the existing one.
  const canReuseMessage = operation === 'merge' || amend;
  if (!trimmed && !canReuseMessage) throw badRequest('A commit message is required.');

  if (stageAll) await stage(repoPath);
  await runGit(repoPath, [
    'commit',
    ...(amend ? ['--amend'] : []),
    ...(trimmed ? ['--message', trimmed] : ['--no-edit']),
  ]);
}

export async function stashSave(repoPath, { message }) {
  // Git exits 0 on a clean tree, which would read as a stash that never happened.
  const { staged, unstaged, conflicted } = await getStatus(repoPath);
  if (staged.length + unstaged.length + conflicted.length === 0) {
    throw gitFailure('There are no changes to stash.');
  }

  const trimmed = message?.trim();
  await runGit(repoPath, [
    'stash',
    'push',
    '--include-untracked',
    ...(trimmed ? ['--message', trimmed] : []),
  ]);
}

const STASH_CONFLICT_STEP = 'Resolve them under Changes. The stash has been kept.';

function assertStashRef(ref) {
  if (typeof ref !== 'string' || !/^stash@\{\d+\}$/.test(ref)) {
    throw badRequest(`Invalid stash: ${ref}`);
  }
}

export async function stashApply(repoPath, { ref }) {
  assertStashRef(ref);
  await reportingConflicts(
    repoPath,
    () => runGit(repoPath, ['stash', 'apply', ref]),
    STASH_CONFLICT_STEP,
  );
}

/** Restores a stash and removes it. Without `ref`, uses the latest. */
export async function stashPop(repoPath, { ref = 'stash@{0}' } = {}) {
  assertStashRef(ref);
  await reportingConflicts(
    repoPath,
    () => runGit(repoPath, ['stash', 'pop', ref]),
    STASH_CONFLICT_STEP,
  );
}

export async function stashDrop(repoPath, { ref }) {
  assertStashRef(ref);
  await runGit(repoPath, ['stash', 'drop', ref]);
}
