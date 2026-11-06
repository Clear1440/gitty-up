import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ApiError, badRequest, gitFailure } from '../errors.js';
import {
  BRANCH_FORMAT,
  CHECKOUT_FORMAT,
  COMMIT_LOG_FLAGS,
  STASH_FORMAT,
  parseBranches,
  parseCheckouts,
  parseCommits,
  parseNameStatus,
  parseStashes,
  parseStatus,
} from './parsers.js';
import { buildPatch } from './patch.js';
import { NETWORK_TIMEOUT_MS, runGit, runGitOnPaths } from './runGit.js';

const OPERATION_MARKERS = [
  { operation: 'rebase', marker: 'rebase-merge' },
  { operation: 'rebase', marker: 'rebase-apply' },
  { operation: 'merge', marker: 'MERGE_HEAD' },
];

const PULL_MODE_FLAGS = { merge: '--no-rebase', rebase: '--rebase', 'ff-only': '--ff-only' };

// Far enough back to cover the branches anyone would call recent.
const MAX_CHECKOUT_ENTRIES = 2_000;

const HUNK_CONTEXT_LINES = 3;
// More lines than any file has, which makes a diff show the whole file.
const FULL_FILE_CONTEXT_LINES = 100_000_000;

/** Pins down everything a user's config could change, so the output can be parsed and applied. */
const diffFlags = (fullFile) => [
  `--unified=${fullFile ? FULL_FILE_CONTEXT_LINES : HUNK_CONTEXT_LINES}`,
  '--inter-hunk-context=0',
  '--no-color',
  '--no-ext-diff',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

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

/** When each branch was last checked out or left. A repository with no commits has no reflog. */
async function getCheckouts(repoPath) {
  const output = await runGit(
    repoPath,
    [
      'reflog',
      'show',
      '--date=unix',
      `--format=${CHECKOUT_FORMAT}`,
      `--max-count=${MAX_CHECKOUT_ENTRIES}`,
    ],
    { allowedExitCodes: [0, 128] },
  );
  return parseCheckouts(output);
}

export async function getBranches(repoPath) {
  const [output, remotes, checkouts] = await Promise.all([
    runGit(repoPath, ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads', 'refs/remotes']),
    getRemotes(repoPath),
    getCheckouts(repoPath),
  ]);
  const { local, remote } = parseBranches(output, remotes);
  return {
    local: local.map((branch) => ({
      ...branch,
      lastCheckout: checkouts.get(branch.name) ?? null,
    })),
    // A remote branch is worked on through its local copy.
    remote: remote.map((branch) => ({
      ...branch,
      lastCheckout: checkouts.get(branch.localName) ?? null,
    })),
  };
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
  const [output, remotes] = await Promise.all([
    runGit(repoPath, [
      'log',
      '--date-order',
      ...COMMIT_LOG_FLAGS,
      `--max-count=${limit}`,
      `--skip=${skip}`,
      ...(allBranches ? ['--branches', '--remotes', '--tags', 'HEAD'] : [ref]),
      '--',
    ]),
    getRemotes(repoPath),
  ]);
  return parseCommits(output, remotes);
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

export async function getDiff(
  repoPath,
  { filePath, staged = false, untracked = false, fullFile = false },
) {
  const flags = diffFlags(fullFile);
  if (untracked) {
    // Comparing against the null device is how git shows a brand-new file.
    // It exits 1 because the two sides differ.
    return runGit(repoPath, ['diff', ...flags, '--no-index', '--', '/dev/null', filePath], {
      allowedExitCodes: [0, 1],
    });
  }
  return runGitOnPaths(repoPath, ['diff', ...flags, ...(staged ? ['--cached'] : []), '--', filePath]);
}

/** A hash from a request. It goes to git as an argument, so it must be nothing else. */
function assertCommitHash(hash) {
  if (!/^[0-9a-f]{7,64}$/i.test(hash)) throw badRequest(`Invalid commit: ${hash}`);
}

/**
 * The arguments that make `git diff-tree` show one commit's own changes. A merge is
 * compared with its first parent, which shows what it brought into that branch.
 */
const commitRange = ({ hash, parents }) => (parents.length > 0 ? [parents[0], hash] : ['--root', hash]);

async function readCommit(repoPath, hash) {
  assertCommitHash(hash);
  const output = await runGit(repoPath, ['log', '-1', ...COMMIT_LOG_FLAGS, hash, '--']);
  return parseCommits(output)[0];
}

export async function getCommitDetails(repoPath, hash) {
  const commit = await readCommit(repoPath, hash);
  const [message, files] = await Promise.all([
    runGit(repoPath, ['log', '-1', '--format=%B', hash, '--']),
    runGit(repoPath, [
      'diff-tree',
      '-r',
      '-M',
      '--no-commit-id',
      '--name-status',
      '-z',
      ...commitRange(commit),
    ]),
  ]);
  return { ...commit, message: message.trim(), files: parseNameStatus(files) };
}

export async function getCommitDiff(repoPath, { hash, filePath, originalPath, fullFile = false }) {
  const commit = await readCommit(repoPath, hash);
  return runGitOnPaths(repoPath, [
    'diff-tree',
    '-p',
    '-M',
    '--no-commit-id',
    ...diffFlags(fullFile),
    ...commitRange(commit),
    '--',
    // A rename only shows as one when git can see both of its paths.
    ...(originalPath ? [originalPath] : []),
    filePath,
  ]);
}

/** Identifies one exact diff, so a selection can't land on lines that have since moved. */
export function hashDiff(diff) {
  return createHash('sha256').update(diff).digest('hex');
}

/**
 * Stages or, when `staged`, unstages some lines of a file's diff. `lines` are line
 * indexes into the diff that `hash` identifies. Only the index changes.
 */
export async function stageLines(repoPath, { lines, hash, ...diffOptions }) {
  const diff = await getDiff(repoPath, diffOptions);
  if (hashDiff(diff) !== hash) {
    throw gitFailure('This file has changed. Check the updated diff, then try again.');
  }

  const reverse = diffOptions.staged === true;
  const patch = buildPatch(diff, lines, { reverse });
  if (!patch) throw badRequest('Select at least one changed line.');

  await runGit(
    repoPath,
    ['apply', '--cached', '--whitespace=nowarn', ...(reverse ? ['--reverse'] : []), '-'],
    { input: patch },
  );
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

/** Deletes a branch from its remote, which also removes the local tracking ref. */
export async function deleteRemoteBranch(repoPath, { name }) {
  assertRef(name);
  const { remote: remoteBranches } = await getBranches(repoPath);
  const target = remoteBranches.find((candidate) => candidate.name === name);
  if (!target?.remote) throw badRequest(`Unknown remote branch: ${name}`);

  // The full ref can't be mistaken for a tag of the same name, or for an option.
  await runGit(repoPath, ['push', target.remote, '--delete', `refs/heads/${target.localName}`], {
    timeout: NETWORK_TIMEOUT_MS,
  });
}

export async function merge(repoPath, { branch, noFastForward = false }) {
  assertRef(branch);
  await reportingConflicts(repoPath, () =>
    runGit(repoPath, ['merge', '--no-edit', ...(noFastForward ? ['--no-ff'] : []), branch]),
  );
}

/**
 * Merges the checked out branch into `target`, leaving `target` checked out. Git can
 * only merge into the current branch, so this has to switch first. A merge that stops
 * on conflicts stays there to be resolved, and any other failure switches back.
 */
export async function mergeInto(repoPath, { target, noFastForward = false }) {
  assertRef(target);
  const { branch: source } = await getStatus(repoPath);
  if (!source) throw gitFailure('Check out a branch before merging it into another.');

  await runGit(repoPath, ['switch', target]);
  try {
    await merge(repoPath, { branch: source, noFastForward });
  } catch (error) {
    if (error.code !== 'CONFLICTS') await runGit(repoPath, ['switch', source]);
    throw error;
  }
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

const STASH_CONFLICT_STEP = 'Resolve them under Uncommitted changes. The stash has been kept.';

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
