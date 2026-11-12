import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from '../errors.js';
import { FileSystemHelper } from '../utils/FileSystemHelper.js';
import { HashHelper } from '../utils/HashHelper.js';
import { TextHelper } from '../utils/TextHelper.js';
import { GitRefHelper } from './GitRefHelper.js';
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
  parseWorktrees,
} from './parsers.js';
import { buildPatch } from './patch.js';
import { listPullRequests } from './pullRequests.js';
import { NETWORK_TIMEOUT_MS, runGit, runGitOnPaths } from './runGit.js';

const OPERATION_MARKERS = [
  { operation: 'rebase', marker: 'rebase-merge' },
  { operation: 'rebase', marker: 'rebase-apply' },
  { operation: 'merge', marker: 'MERGE_HEAD' },
  { operation: 'cherry-pick', marker: 'CHERRY_PICK_HEAD' },
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
    throw ApiError.badRequest(`Invalid git ref: ${ref}`);
  }
}

async function assertValidBranchName(repoPath, name) {
  assertRef(name);
  try {
    await runGit(repoPath, ['check-ref-format', '--branch', name]);
  } catch {
    throw ApiError.badRequest(`"${name}" is not a valid branch name.`);
  }
}

/** Resolves a user-supplied folder to the root of its working tree. */
export async function resolveWorkingTree(folderPath) {
  try {
    const topLevel = await runGit(folderPath, ['rev-parse', '--show-toplevel']);
    return path.resolve(topLevel.trim());
  } catch {
    throw ApiError.badRequest(`${folderPath} is not inside a git working tree.`);
  }
}

/** Clones into a new folder named `folderName` and resolves with its working tree. */
export async function clone(url, parentPath, folderName) {
  const target = path.join(parentPath, folderName);
  await runGit(parentPath, ['clone', '--', url, target], { timeout: NETWORK_TIMEOUT_MS });
  return resolveWorkingTree(target);
}

/** The repository's .git folder, where git keeps the state of a merge or rebase. */
async function getGitDir(repoPath) {
  return (await runGit(repoPath, ['rev-parse', '--absolute-git-dir'])).trim();
}

/** Whether `ref` names something that exists, such as a branch or HEAD's commit. */
async function refExists(repoPath, ref) {
  const output = await runGit(repoPath, ['rev-parse', '--verify', '--quiet', ref], {
    allowedExitCodes: [0, 1],
  });
  return Boolean(output.trim());
}

/** A commit's full message: its subject, then any body. */
async function readMessage(repoPath, hash) {
  return (await runGit(repoPath, ['log', '-1', '--format=%B', hash, '--'])).trim();
}

async function getOperation(repoPath) {
  const gitDir = await getGitDir(repoPath);
  for (const { operation, marker } of OPERATION_MARKERS) {
    if (await FileSystemHelper.exists(path.join(gitDir, marker))) return operation;
  }
  return null;
}

async function requireOperation(repoPath) {
  const operation = await getOperation(repoPath);
  if (!operation) {
    throw ApiError.gitFailure('There is no merge, rebase or cherry-pick in progress.');
  }
  return operation;
}

export async function getStatus(repoPath) {
  const [output, operation] = await Promise.all([
    runGit(repoPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
    getOperation(repoPath),
  ]);
  return { ...parseStatus(output), operation };
}

/** The checked out branch's name, or null on a detached HEAD. */
export async function getCurrentBranch(repoPath) {
  return (await runGit(repoPath, ['branch', '--show-current'])).trim() || null;
}

/** Whether a local branch of exactly this name exists. */
export async function hasLocalBranch(repoPath, name) {
  assertRef(name);
  return refExists(repoPath, GitRefHelper.toLocalRef(name));
}

async function getRemotes(repoPath) {
  return (await runGit(repoPath, ['remote'])).split('\n').filter(Boolean);
}

async function getDefaultRemote(repoPath) {
  return GitRefHelper.pickDefaultRemote(await getRemotes(repoPath));
}

/** The remotes a branch can be published to, and the one to offer first. */
export async function getRemoteOptions(repoPath) {
  const remotes = await getRemotes(repoPath);
  return { remotes, defaultRemote: GitRefHelper.pickDefaultRemote(remotes) };
}

async function getRemoteUrl(repoPath) {
  const remote = await getDefaultRemote(repoPath);
  if (!remote) return null;
  return (await runGit(repoPath, ['remote', 'get-url', remote])).trim();
}

export async function getPullRequests(repoPath) {
  return listPullRequests(repoPath, await getRemoteUrl(repoPath));
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

/**
 * The local and remote branches, without when each was last checked out. Reading the
 * reflog for that only matters to the sidebar's sort, so lookups and checks use this.
 */
async function listBranchRefs(repoPath) {
  const [output, remotes] = await Promise.all([
    runGit(repoPath, ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads', 'refs/remotes']),
    getRemotes(repoPath),
  ]);
  return parseBranches(output, remotes);
}

/** Every branch, each with `lastCheckout`, for showing and sorting the branch list. */
export async function getBranches(repoPath) {
  const [{ local, remote }, checkouts] = await Promise.all([
    listBranchRefs(repoPath),
    getCheckouts(repoPath),
  ]);
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

/**
 * Lists commits, newest first, always with children before their parents, which the
 * client's git tree relies on. `allBranches` walks every branch and tag instead of `ref`,
 * and `revisions` walks exactly those. They go in over stdin, as there can be hundreds.
 */
export async function getCommits(
  repoPath,
  { ref = 'HEAD', allBranches = false, revisions, limit = 100, skip = 0 } = {},
) {
  assertRef(ref);
  // A repository with no commits yet has no history, and git log would fail on it.
  if (!(await refExists(repoPath, 'HEAD'))) return [];
  const walk = allBranches ? ['--branches', '--remotes', '--tags', 'HEAD'] : [ref];
  const [output, remotes] = await Promise.all([
    runGit(
      repoPath,
      [
        'log',
        '--date-order',
        ...COMMIT_LOG_FLAGS,
        `--max-count=${limit}`,
        `--skip=${skip}`,
        ...(revisions ? ['--stdin'] : walk),
        '--',
      ],
      { input: revisions?.join('\n') },
    ),
    getRemotes(repoPath),
  ]);
  return parseCommits(output, remotes);
}

export async function getSummary(repoPath) {
  const [status, commits, branches, remoteUrl] = await Promise.all([
    getStatus(repoPath),
    getCommits(repoPath, { limit: 1 }),
    listBranchRefs(repoPath),
    getRemoteUrl(repoPath),
  ]);
  // A file both staged and unstaged counts once.
  const changedPaths = [...status.staged, ...status.unstaged, ...status.conflicted].map(
    (file) => file.path,
  );
  return {
    branch: status.branch,
    detached: status.detached,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    changeCount: new Set(changedPaths).size,
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
  const area = staged ? ['--cached'] : [];
  return runGitOnPaths(repoPath, ['diff', ...flags, ...area, '--', filePath]);
}

/** A hash from a request. It goes to git as an argument, so it must be nothing else. */
function assertCommitHash(hash) {
  if (!/^[0-9a-f]{7,64}$/i.test(hash)) throw ApiError.badRequest(`Invalid commit: ${hash}`);
}

/**
 * The arguments that make `git diff-tree` show one commit's own changes. A merge is
 * compared with its first parent, which shows what it brought into that branch.
 */
const commitRange = ({ hash, parents }) =>
  parents.length > 0 ? [parents[0], hash] : ['--root', hash];

async function readCommit(repoPath, hash) {
  assertCommitHash(hash);
  const output = await runGit(repoPath, ['log', '-1', ...COMMIT_LOG_FLAGS, hash, '--']);
  return parseCommits(output)[0];
}

export async function getCommitDetails(repoPath, hash) {
  const commit = await readCommit(repoPath, hash);
  const [message, files] = await Promise.all([
    readMessage(repoPath, hash),
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
  return { ...commit, message, files: parseNameStatus(files) };
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
  return HashHelper.sha256(diff);
}

/**
 * Stages or, when `staged`, unstages some lines of a file's diff. `lines` are line
 * indexes into the diff that `hash` identifies. Only the index changes.
 */
export async function stageLines(repoPath, { lines, hash, ...diffOptions }) {
  const diff = await getDiff(repoPath, diffOptions);
  if (hashDiff(diff) !== hash) {
    throw ApiError.gitFailure('This file has changed. Check the updated diff, then try again.');
  }

  const reverse = diffOptions.staged === true;
  const patch = buildPatch(diff, lines, { reverse });
  if (!patch) throw ApiError.badRequest('Select at least one changed line.');

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
    const files = TextHelper.countOf(conflicted.length, 'file');
    throw ApiError.conflicts(`Stopped with conflicts in ${files}. ${nextStep}`, error.details);
  }
}

export async function fetchAll(repoPath) {
  await runGit(repoPath, ['fetch', '--all', '--prune'], { timeout: NETWORK_TIMEOUT_MS });
}

export async function pull(repoPath, { mode = 'merge' } = {}) {
  const flag = PULL_MODE_FLAGS[mode];
  if (!flag) throw ApiError.badRequest(`Unknown pull mode: ${mode}`);
  await reportingConflicts(repoPath, () =>
    runGit(repoPath, ['pull', flag], { timeout: NETWORK_TIMEOUT_MS }),
  );
}

async function resolvePushRemote(repoPath, requested) {
  const { remotes, defaultRemote } = await getRemoteOptions(repoPath);
  if (requested !== undefined && !remotes.includes(requested)) {
    throw ApiError.badRequest(`Unknown remote: ${requested}`);
  }
  const remote = requested ?? defaultRemote;
  if (!remote) throw ApiError.gitFailure('This repository has no remote to push to.');
  return remote;
}

/** The branch a remote's HEAD points at, such as main, or null if it doesn't say. */
async function remoteDefaultBranch(repoPath, remote) {
  const output = await runGit(
    repoPath,
    ['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`],
    { allowedExitCodes: [0, 1, 128] },
  );
  const name = output.trim();
  return name.startsWith(`${remote}/`) ? name.slice(remote.length + 1) : null;
}

/**
 * Whether an upstream named differently from its branch looks taken by mistake rather
 * than chosen: a branch made from origin/main tracks main, which belongs to the local
 * main branch and is the remote's default. A name chosen when publishing, as in
 * topic → shared/topic, is neither, and is pushed to as usual.
 */
async function isOtherBranchesUpstream(repoPath, { branch, remote, upstreamName }) {
  if (upstreamName === branch) return false;
  if (await hasLocalBranch(repoPath, upstreamName)) return true;
  return remote !== '.' && (await remoteDefaultBranch(repoPath, remote)) === upstreamName;
}

/**
 * Pushes the current branch. Naming `upstreamName` publishes it under that name, as does
 * having no upstream at all, which uses the branch's own name.
 *
 * A branch tracking a remote branch that belongs to another, such as feature tracking
 * origin/main, is refused with UPSTREAM_MISMATCH rather than pushed into main. Pushing
 * there anyway takes `toUpstream`, and pushing to its own name takes `upstreamName`.
 */
export async function push(
  repoPath,
  { force = false, remote, upstreamName, toUpstream = false } = {},
) {
  const { branch, upstream } = await getStatus(repoPath);
  if (!branch) throw ApiError.gitFailure('Check out a branch before pushing.');
  if (upstreamName !== undefined) await assertValidBranchName(repoPath, upstreamName);

  const args = ['push', ...(force ? ['--force-with-lease'] : [])];
  if (!upstream || upstreamName !== undefined) {
    const target = await resolvePushRemote(repoPath, remote);
    args.push('--set-upstream', target, `HEAD:${GitRefHelper.toLocalRef(upstreamName ?? branch)}`);
  } else {
    const [merge, trackedRemote] = await Promise.all(
      ['merge', 'remote'].map((key) =>
        runGit(repoPath, ['config', `branch.${branch}.${key}`]).then((value) => value.trim()),
      ),
    );
    if (merge !== GitRefHelper.toLocalRef(branch)) {
      const mismatch = { branch, remote: trackedRemote, upstreamName: GitRefHelper.fromLocalRef(merge) };
      if (!toUpstream && (await isOtherBranchesUpstream(repoPath, mismatch))) {
        throw ApiError.upstreamMismatch(
          `${branch} tracks ${upstream}, so pushing would update ${upstream} instead of a branch of its own.`,
          mismatch,
        );
      }
      // By default git refuses to push to an upstream named differently from the branch.
      args.unshift('-c', 'push.default=upstream');
    }
  }
  await runGit(repoPath, args, { timeout: NETWORK_TIMEOUT_MS });
}

export async function checkout(repoPath, { branch, remote = false }) {
  assertRef(branch);
  if (!remote) {
    await runGit(repoPath, ['switch', branch]);
    return;
  }

  const branches = await listBranchRefs(repoPath);
  const target = branches.remote.find((candidate) => candidate.name === branch);
  if (!target) throw ApiError.badRequest(`Unknown remote branch: ${branch}`);

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

/** With `deleteRemote`, also deletes the branch's upstream, once the local branch is gone. */
export async function deleteBranch(repoPath, { name, force = false, deleteRemote = false }) {
  assertRef(name);
  // Read first, as git forgets the upstream along with the branch.
  const upstream = deleteRemote ? await findLiveUpstream(repoPath, name) : null;
  // Checked before the local branch goes, so a refusal leaves everything as it was.
  if (upstream) await findDeletableRemoteBranch(repoPath, upstream);
  await runGit(repoPath, ['branch', force ? '-D' : '-d', name]);
  if (!upstream) return;

  try {
    await deleteRemoteBranch(repoPath, { name: upstream });
  } catch (error) {
    throw ApiError.gitFailure(
      `Deleted ${name}, but could not delete ${upstream}. ${error.message}`,
      error.details,
    );
  }
}

async function findLiveUpstream(repoPath, name) {
  const { local } = await listBranchRefs(repoPath);
  const branch = local.find((candidate) => candidate.name === name);
  if (!branch?.upstream || branch.upstreamGone) {
    throw ApiError.badRequest(`${name} has no branch on a remote to delete.`);
  }
  return branch.upstream;
}

/** A remote branch by its name, such as origin/topic, as long as it may be deleted. */
async function findDeletableRemoteBranch(repoPath, name) {
  const { remote: remoteBranches } = await listBranchRefs(repoPath);
  const target = remoteBranches.find((candidate) => candidate.name === name);
  if (!target?.remote) throw ApiError.badRequest(`Unknown remote branch: ${name}`);
  if (GitRefHelper.isProtectedOnRemote(target.localName)) {
    throw ApiError.badRequest(
      `${target.localName} is protected and can't be deleted from ${target.remote}.`,
    );
  }
  return target;
}

/** Deletes a branch from its remote, which also removes the local tracking ref. */
export async function deleteRemoteBranch(repoPath, { name }) {
  assertRef(name);
  const target = await findDeletableRemoteBranch(repoPath, name);

  // The full ref can't be mistaken for a tag of the same name, or for an option.
  const ref = GitRefHelper.toLocalRef(target.localName);
  await runGit(repoPath, ['push', target.remote, '--delete', ref], { timeout: NETWORK_TIMEOUT_MS });
}

/**
 * Deletes the local branches whose remote branch is gone, as left behind once a pull
 * request is merged. Branches that never had an upstream are not touched. Without
 * `force`, git keeps any with unmerged commits, and those are reported as kept. `names`
 * limits it to those branches.
 */
export async function pruneGoneBranches(repoPath, { force = false, names } = {}) {
  const { local } = await listBranchRefs(repoPath);
  const result = { deleted: [], kept: [] };

  for (const { name, upstreamGone, isCurrent } of local) {
    if (!upstreamGone || isCurrent || (names && !names.includes(name))) continue;
    try {
      await deleteBranch(repoPath, { name, force });
      result.deleted.push(name);
    } catch {
      result.kept.push(name);
    }
  }
  return result;
}

/** A merge from or into a stale branch would leave out what is already on the remote. */
export async function assertNotBehind(repoPath, names) {
  const { local } = await listBranchRefs(repoPath);
  const stale = local.filter(({ name, behind }) => names.includes(name) && behind > 0);
  if (stale.length === 0) return;

  const summary = stale
    .map(({ name, behind, upstream }) => {
      return `${name} is ${TextHelper.countOf(behind, 'commit')} behind ${upstream}`;
    })
    .join(' and ');
  throw ApiError.branchBehind(`Merge cancelled: ${summary}. Pull first.`);
}

function runMerge(repoPath, { branch, noFastForward }) {
  return reportingConflicts(repoPath, () =>
    runGit(repoPath, ['merge', '--no-edit', ...(noFastForward ? ['--no-ff'] : []), branch]),
  );
}

export async function merge(repoPath, { branch, noFastForward = false }) {
  assertRef(branch);
  const { branch: current } = await getStatus(repoPath);
  await assertNotBehind(repoPath, [current, branch]);
  await runMerge(repoPath, { branch, noFastForward });
}

/**
 * Merges the checked out branch into `target`, leaving `target` checked out. Git can
 * only merge into the current branch, so this has to switch first. A merge that stops
 * on conflicts stays there to be resolved, and any other failure switches back.
 */
export async function mergeInto(repoPath, { target, noFastForward = false }) {
  assertRef(target);
  const { branch: source } = await getStatus(repoPath);
  if (!source) throw ApiError.gitFailure('Check out a branch before merging it into another.');
  await assertNotBehind(repoPath, [source, target]);

  await runGit(repoPath, ['switch', target]);
  try {
    await runMerge(repoPath, { branch: source, noFastForward });
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
    // A merge or cherry-pick finishes by committing, with the message git prepared.
    runGit(repoPath, operation === 'rebase' ? ['rebase', '--continue'] : ['commit', '--no-edit']),
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

/**
 * Throws away every uncommitted change, staged or not, and deletes untracked files.
 * Ignored files stay, as they are usually builds and local settings, not changes.
 */
export async function discardAll(repoPath) {
  const { operation } = await getStatus(repoPath);
  if (operation) {
    throw ApiError.gitFailure(`Abort the ${operation} instead, to go back to before it started.`);
  }
  if (await refExists(repoPath, 'HEAD')) {
    await runGit(repoPath, ['reset', '--hard', '--quiet', 'HEAD']);
  } else {
    // Before the first commit there is nothing to go back to, only an index to empty.
    await runGit(repoPath, ['read-tree', '--empty']);
  }
  await runGit(repoPath, ['clean', '--force', '-d', '--quiet']);
}

const IGNORE_KINDS = ['file', 'folder', 'extension'];

/** The .gitignore line that covers `filePath` in the way `kind` says, or null if none can. */
export function ignorePattern(filePath, kind) {
  // Ignore files treat these as special, so they are escaped to mean themselves.
  const escape = (text) => text.replace(/[\\*?[\]!#]/g, (char) => `\\${char}`);
  // Git also drops spaces at the end of a line unless each is escaped.
  const keepTrailingSpaces = (line) => line.replace(/ +$/, (spaces) => '\\ '.repeat(spaces.length));
  const slash = filePath.lastIndexOf('/');
  if (kind === 'file') return keepTrailingSpaces(`/${escape(filePath)}`);
  if (kind === 'folder') return slash === -1 ? null : `/${escape(filePath.slice(0, slash))}/`;
  if (kind === 'extension') {
    const name = filePath.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    return dot > 0 ? keepTrailingSpaces(`*${escape(name.slice(dot))}`) : null;
  }
  throw ApiError.badRequest(`Unknown kind of ignore: ${kind}`);
}

/**
 * Adds lines to the repository's top .gitignore so these paths stop showing as changes.
 * `kind` ignores just each file, its whole folder, or every file with its extension.
 * Lines already in the file are not added twice.
 */
export async function ignore(repoPath, { paths, kind = 'file' }) {
  if (!IGNORE_KINDS.includes(kind)) throw ApiError.badRequest(`Unknown kind of ignore: ${kind}`);
  // Each pattern is one line, so a line break in a path could add a rule of its own.
  if (paths.some((filePath) => /[\r\n]/.test(filePath))) {
    throw ApiError.badRequest('A path with a line break cannot be ignored.');
  }
  const patterns = [...new Set(paths.map((filePath) => ignorePattern(filePath, kind)))];
  if (patterns.includes(null)) {
    throw ApiError.badRequest(
      kind === 'folder'
        ? 'A file at the top of the repository has no folder to ignore.'
        : 'That file has no extension to ignore.',
    );
  }

  const ignorePath = path.join(repoPath, '.gitignore');
  const current = await fs.readFile(ignorePath, 'utf8').catch(() => '');
  // Compared without trailing whitespace, which git ignores, but with any leading, which
  // it keeps. Both sides are trimmed the same way, so an escaped trailing space matches.
  const existing = new Set(current.split(/\r?\n/).map((line) => line.trimEnd()));
  const added = patterns.filter((pattern) => !existing.has(pattern.trimEnd()));
  if (added.length === 0) return;

  const newline = current.includes('\r\n') ? '\r\n' : '\n';
  const separator = current && !current.endsWith('\n') ? newline : '';
  await fs.appendFile(ignorePath, `${separator}${added.join(newline)}${newline}`);
}

/**
 * Rewrites the latest commit's message and nothing else, even with changes staged.
 * `hash` is the commit the user meant, so one made elsewhere since is never touched.
 */
export async function rewordLastCommit(repoPath, { hash, message }) {
  assertCommitHash(hash);
  const trimmed = message?.trim();
  if (!trimmed) throw ApiError.badRequest('A commit message is required.');
  await assertNoOperation(repoPath, 'editing a commit message');

  const head = (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim();
  if (!head.startsWith(hash.toLowerCase())) {
    throw ApiError.gitFailure('Only the latest commit can have its message edited here.');
  }
  // --only with no paths leaves whatever is staged out of the amended commit.
  await runGit(repoPath, ['commit', '--amend', '--only', '--allow-empty', '--message', trimmed]);
}

export async function commit(repoPath, { message, amend = false, stageAll = false }) {
  const trimmed = message?.trim();
  const { operation, conflicted } = await getStatus(repoPath);
  // Staging everything here would commit the conflict markers.
  if (conflicted.length > 0) throw ApiError.gitFailure('Resolve the conflicts before committing.');

  // A merge or cherry-pick already has a message, and an amend can keep the existing one.
  const canReuseMessage = operation === 'merge' || operation === 'cherry-pick' || amend;
  if (!trimmed && !canReuseMessage) throw ApiError.badRequest('A commit message is required.');

  if (stageAll) await stage(repoPath);
  await runGit(repoPath, [
    'commit',
    ...(amend ? ['--amend'] : []),
    ...(trimmed ? ['--message', trimmed] : ['--no-edit']),
  ]);
}

async function assertNoOperation(repoPath, doing) {
  const { operation } = await getStatus(repoPath);
  if (operation) throw ApiError.gitFailure(`Finish the ${operation} before ${doing}.`);
}

/** Checks out a commit on its own, without a branch. */
export async function checkoutCommit(repoPath, { hash }) {
  assertCommitHash(hash);
  await runGit(repoPath, ['switch', '--detach', hash]);
}

/**
 * Copies a commit onto the checked out branch. When git gives up for any reason other
 * than conflicts, such as the branch already having those changes, nothing is left
 * half done.
 */
export async function cherryPick(repoPath, { hash }) {
  assertCommitHash(hash);
  await assertNoOperation(repoPath, 'cherry-picking');
  const [, ...parents] = (await runGit(repoPath, ['rev-list', '--parents', '-n', '1', hash]))
    .trim()
    .split(' ');
  if (parents.length > 1) throw ApiError.badRequest('A merge commit cannot be cherry-picked.');

  try {
    await reportingConflicts(repoPath, () => runGit(repoPath, ['cherry-pick', hash]));
  } catch (error) {
    if (error.code !== 'CONFLICTS' && (await getOperation(repoPath)) === 'cherry-pick') {
      await runGit(repoPath, ['cherry-pick', '--abort']);
    }
    throw error;
  }
}

const RESET_MODES = new Set(['soft', 'hard']);

/**
 * Moves the checked out branch to a commit. `soft` keeps every change since then,
 * staged. `hard` throws them away, uncommitted ones included, though files git has
 * never tracked stay.
 */
export async function resetToCommit(repoPath, { hash, mode }) {
  assertCommitHash(hash);
  if (!RESET_MODES.has(mode)) throw ApiError.badRequest(`Unknown reset mode: ${mode}`);
  await assertNoOperation(repoPath, 'resetting');
  await runGit(repoPath, ['reset', `--${mode}`, hash]);
}

/** The commit HEAD is on, and whether any remote branch has it. Null with no commits yet. */
export async function getLastCommit(repoPath) {
  const [commit] = await getCommits(repoPath, { limit: 1 });
  if (!commit) return null;

  const { hash, shortHash, subject, parents } = commit;
  const [message, remoteBranches] = await Promise.all([
    readMessage(repoPath, hash),
    runGit(repoPath, ['branch', '--remotes', '--contains', hash]),
  ]);
  return { hash, shortHash, subject, message, parents, pushed: Boolean(remoteBranches.trim()) };
}

/**
 * Takes back the latest commit, leaving its changes staged. Anything else in the index
 * or working tree stays as it was. `hash` is the commit the user meant to undo, so a
 * commit made elsewhere since then is never the one taken back. Undoing a commit a
 * remote already has means force pushing later, so that takes `allowPushed`.
 */
export async function undoCommit(repoPath, { hash, allowPushed = false }) {
  assertCommitHash(hash);
  const { operation, conflicted } = await getStatus(repoPath);
  if (operation) throw ApiError.gitFailure(`Finish the ${operation} before undoing a commit.`);
  if (conflicted.length > 0) {
    throw ApiError.gitFailure('Resolve the conflicts before undoing a commit.');
  }

  const last = await getLastCommit(repoPath);
  if (last?.hash !== hash) throw ApiError.gitFailure('The latest commit has changed. Try again.');
  if (last.pushed && !allowPushed) {
    throw ApiError.gitFailure('This commit is already on a remote.');
  }

  // A first commit has no parent to go back to, so its branch stops existing instead.
  await runGit(
    repoPath,
    last.parents.length > 0 ? ['reset', '--soft', 'HEAD~1'] : ['update-ref', '-d', 'HEAD'],
  );
}

/** Stashes every change, or with `paths` only those files' changes. */
export async function stashSave(repoPath, { message, paths }) {
  // Git exits 0 on a clean tree, which would read as a stash that never happened.
  const { staged, unstaged, conflicted } = await getStatus(repoPath);
  const changed = [...staged, ...unstaged, ...conflicted].filter(
    (file) => !paths || paths.includes(file.path),
  );
  if (changed.length === 0) {
    throw ApiError.gitFailure(
      paths ? 'Those files have no changes to stash.' : 'There are no changes to stash.',
    );
  }

  const trimmed = message?.trim();
  await runGit(repoPath, [
    'stash',
    'push',
    '--include-untracked',
    ...(trimmed ? ['--message', trimmed] : []),
    // Per path rather than --literal-pathspecs, which would break stash's own ":/".
    ...(paths ? ['--', ...paths.map((filePath) => `:(literal)${filePath}`)] : []),
  ]);
}

const STASH_CONFLICT_STEP = 'Resolve them under Uncommitted changes. The stash has been kept.';

function assertStashRef(ref) {
  if (typeof ref !== 'string' || !/^stash@\{\d+\}$/.test(ref)) {
    throw ApiError.badRequest(`Invalid stash: ${ref}`);
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

/**
 * A stash commit's parents: the commit it was made on, its index, and with
 * --include-untracked a third, parentless commit holding the untracked files.
 */
async function readStashParents(repoPath, hash) {
  assertCommitHash(hash);
  const output = await runGit(repoPath, ['log', '-1', '--format=%P', hash, '--']);
  const [base, , untracked] = output.trim().split(' ');
  if (!base) throw ApiError.badRequest(`${hash} is not a stash.`);
  return { base, untracked };
}

/** What a stash holds: its tracked changes, then any untracked files it took. */
export async function getStashDetails(repoPath, hash) {
  const { base, untracked } = await readStashParents(repoPath, hash);
  const nameStatus = (args) =>
    runGit(repoPath, ['diff-tree', '-r', '--no-commit-id', '--name-status', '-z', ...args]);
  const [tracked, added] = await Promise.all([
    nameStatus(['-M', base, hash]),
    untracked ? nameStatus(['--root', untracked]) : '',
  ]);
  return {
    hash,
    files: [
      ...parseNameStatus(tracked),
      ...parseNameStatus(added).map((file) => ({ ...file, status: 'untracked', untracked: true })),
    ],
  };
}

export async function getStashDiff(
  repoPath,
  { hash, filePath, originalPath, untracked = false, fullFile = false },
) {
  const parents = await readStashParents(repoPath, hash);
  if (untracked && !parents.untracked) {
    throw ApiError.badRequest('This stash has no untracked files.');
  }
  const range = untracked ? ['--root', parents.untracked] : ['-M', parents.base, hash];
  return runGitOnPaths(repoPath, [
    'diff-tree',
    '-p',
    '--no-commit-id',
    ...diffFlags(fullFile),
    ...range,
    '--',
    ...(originalPath ? [originalPath] : []),
    filePath,
  ]);
}

// Worktrees

/** Compares folders the way the file system does: Windows ignores case and slash style. */
function samePath(a, b) {
  const normalize = (folder) => {
    const resolved = path.resolve(folder);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

/**
 * Every working tree of the repository, the main one first. `isCurrent` marks the one
 * at `repoPath`, and `name` is its folder's name. `parent` is the main working tree's
 * own folder, where new ones go by default, beside it.
 */
export async function getWorktrees(repoPath) {
  const worktrees = parseWorktrees(await runGit(repoPath, ['worktree', 'list', '--porcelain']));
  return worktrees
    .filter((worktree) => !worktree.isBare)
    .map((worktree) => ({
      ...worktree,
      // Git prints forward slashes everywhere, which Windows folders are shown without.
      path: path.resolve(worktree.path),
      name: path.basename(worktree.path),
      isCurrent: samePath(worktree.path, repoPath),
    }));
}

/** One of the repository's own working trees, so nothing else on disk can be touched. */
async function requireWorktree(repoPath, folder) {
  if (typeof folder !== 'string' || !folder.trim()) {
    throw ApiError.badRequest('"path" must be a working tree folder.');
  }
  const worktree = (await getWorktrees(repoPath)).find((candidate) =>
    samePath(candidate.path, folder),
  );
  if (!worktree) throw ApiError.badRequest(`${folder} is not a working tree of this repository.`);
  return worktree;
}

/**
 * Adds a working tree at `folder`, which must be new or empty. It checks out `branch`,
 * or with `newBranch` creates that branch from `startPoint`. A remote branch gets a
 * local branch that tracks it, as a checkout would. Resolves with its full path.
 */
export async function addWorktree(repoPath, { folder, branch, newBranch, startPoint }) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) {
    throw ApiError.badRequest('Choose a full folder path for the working tree.');
  }
  const target = path.resolve(folder);
  const entries = await fs.readdir(target).catch((error) => (error.code === 'ENOENT' ? [] : null));
  if (entries === null) throw ApiError.badRequest(`${target} is not a folder that can be used.`);
  if (entries.length > 0) throw ApiError.badRequest(`${target} already has files in it.`);

  let args;
  if (newBranch) {
    await assertValidBranchName(repoPath, newBranch);
    if (startPoint) assertRef(startPoint);
    args = ['-b', newBranch, '--', target, ...(startPoint ? [startPoint] : [])];
  } else {
    assertRef(branch);
    const remote = (await listBranchRefs(repoPath)).remote.find(({ name }) => name === branch);
    // Checking out a remote branch by its local name makes git set up tracking.
    const local = remote?.localName;
    args =
      local && !(await hasLocalBranch(repoPath, local))
        ? ['--track', '-b', local, '--', target, branch]
        : ['--', target, local ?? branch];
  }
  await runGit(repoPath, ['worktree', 'add', ...args]);
  return { path: target };
}

/**
 * Deletes a working tree's folder and forgets it. Git refuses when it has changes,
 * unless `force`. The main working tree, and the one open here, can't be removed.
 */
export async function removeWorktree(repoPath, { folder, force = false }) {
  const worktree = await requireWorktree(repoPath, folder);
  if (worktree.isMain) throw ApiError.badRequest('The main working tree cannot be removed.');
  if (worktree.isCurrent) {
    throw ApiError.badRequest('Open another working tree to remove this one.');
  }
  try {
    await runGit(repoPath, [
      'worktree',
      'remove',
      // Twice, as a locked working tree needs it doubled.
      ...(force ? ['--force', '--force'] : []),
      worktree.path,
    ]);
  } catch (error) {
    if (!force && /modified or untracked|is dirty|locked/i.test(error.details ?? error.message)) {
      throw ApiError.gitFailure(
        `${worktree.name} has uncommitted changes or is locked. Remove it anyway to delete them.`,
        error.details,
      );
    }
    throw error;
  }
}

/** Locking keeps git from pruning a working tree whose folder is away, such as on a USB drive. */
export async function lockWorktree(repoPath, { folder, reason }) {
  const worktree = await requireWorktree(repoPath, folder);
  if (worktree.isMain) throw ApiError.badRequest('The main working tree cannot be locked.');
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  await runGit(repoPath, [
    'worktree',
    'lock',
    ...(trimmed ? ['--reason', trimmed] : []),
    worktree.path,
  ]);
}

export async function unlockWorktree(repoPath, { folder }) {
  const worktree = await requireWorktree(repoPath, folder);
  await runGit(repoPath, ['worktree', 'unlock', worktree.path]);
}

/** Forgets working trees whose folders were deleted without git. */
export async function pruneWorktrees(repoPath) {
  await runGit(repoPath, ['worktree', 'prune']);
}

// Patches

/** A file name made from free text, such as a commit subject. */
function patchFileName(...parts) {
  const slug = parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${slug || 'changes'}.patch`;
}

/**
 * Every uncommitted change, untracked files included, as one diff against HEAD.
 * Staging everything into a throwaway copy of the index leaves the real one alone.
 */
async function diffUncommitted(repoPath) {
  const indexPath = await runGit(repoPath, [
    'rev-parse',
    '--path-format=absolute',
    '--git-path',
    'index',
  ]);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-patch-'));
  const tempIndex = path.join(tempDir, 'index');
  try {
    await fs.copyFile(indexPath.trim(), tempIndex).catch(() => {});
    const env = { GIT_INDEX_FILE: tempIndex };
    await runGit(repoPath, ['add', '--all'], { env });
    // With no commit named, --cached compares with HEAD, or before the first commit
    // with nothing at all, whichever hash function the repository uses.
    return await runGit(repoPath, ['diff', '--cached', '--binary', ...diffFlags(false)], { env });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * A patch file's name and text. `source` is "commit" (with `hash`), "stash" (with
 * `ref`) or "uncommitted". A commit's patch keeps its author and message, for git am.
 */
export async function createPatch(repoPath, { source, hash, ref }) {
  let patch;
  let fileName;
  if (source === 'commit') {
    const commit = await readCommit(repoPath, hash);
    patch = await runGit(repoPath, [
      'format-patch',
      '-1',
      '--stdout',
      '--binary',
      '--no-color',
      ...(commit.parents.length === 0 ? ['--root'] : []),
      commit.hash,
    ]);
    fileName = patchFileName(commit.shortHash, commit.subject);
  } else if (source === 'stash') {
    assertStashRef(ref);
    const show = (extra) =>
      runGit(repoPath, ['stash', 'show', '-p', '--binary', ...diffFlags(false), ...extra, ref]);
    // Older git cannot show a stash's untracked files.
    patch = await show(['--include-untracked']).catch(() => show([]));
    fileName = patchFileName('stash', ref.match(/\d+/)[0]);
  } else if (source === 'uncommitted') {
    patch = await diffUncommitted(repoPath);
    fileName = patchFileName('uncommitted', await getCurrentBranch(repoPath));
  } else {
    throw ApiError.badRequest(`Unknown patch source: ${source}`);
  }
  if (!patch.trim()) throw ApiError.gitFailure('There are no changes to put in a patch.');
  return { fileName, patch };
}

/** Whether a patch came from git format-patch, which git am can turn back into commits. */
export function isMailboxPatch(patch) {
  // 40 hex digits for SHA-1 repositories, 64 for SHA-256 ones.
  return /^From (?:[0-9a-f]{40}|[0-9a-f]{64}) /m.test(patch);
}

/**
 * The patch with CRLF line endings turned to LF, but only when every line has them,
 * as when an editor saved the whole file that way. A patch that mixes the two is left
 * alone: its CRs belong to the files it changes, and removing them would break it.
 */
function normalizeLineEndings(patch) {
  const hasBareLf = /(^|[^\r])\n/.test(patch);
  return patch.includes('\r\n') && !hasBareLf ? patch.replace(/\r\n/g, '\n') : patch;
}

/**
 * Applies a patch. "commit" mode makes commits from a format-patch file with git am,
 * and gives up cleanly if it can't. "changes" mode only changes the working tree,
 * falling back to a three-way merge that leaves conflicts to resolve.
 */
export async function applyPatch(repoPath, { patch, mode = 'changes' }) {
  if (typeof patch !== 'string' || !patch.trim()) {
    throw ApiError.badRequest('The patch is empty.');
  }
  // Windows editors may have saved it with CRLF, which git apply would reject.
  const input = normalizeLineEndings(patch);

  if (mode === 'commit') {
    if (!isMailboxPatch(input)) {
      throw ApiError.badRequest(
        'This patch has no commit details. Apply it as changes, then commit them.',
      );
    }
    // The abort below would otherwise end a git am or rebase that was already under way.
    await assertNoOperation(repoPath, 'applying a patch');
    try {
      await runGit(repoPath, ['am', '--3way', '--keep-cr'], { input });
    } catch (error) {
      // Left paused, git am would look like a rebase that the rebase buttons can't end.
      await runGit(repoPath, ['am', '--abort']).catch(() => {});
      throw ApiError.gitFailure(
        'The patch does not apply here as commits. Nothing was changed. Try applying it as changes instead.',
        error.details ?? error.message,
      );
    }
    return;
  }

  const apply = (extra) =>
    runGit(repoPath, ['apply', '--whitespace=nowarn', ...extra, '-'], { input });
  try {
    await apply(['--check']);
  } catch {
    await reportingConflicts(
      repoPath,
      () => apply(['--3way']),
      'Resolve them under Uncommitted changes.',
    );
    return;
  }
  await apply([]);
}

/** Which version of a conflicted file each index stage holds. */
const CONFLICT_STAGES = { 1: 'base', 2: 'ours', 3: 'theirs' };

async function readGitFile(gitDir, name) {
  try {
    return (await fs.readFile(path.join(gitDir, name), 'utf8')).trim();
  } catch {
    return null;
  }
}

/** A commit's branch name where git can find one, or else its short hash. */
async function nameCommit(repoPath, hash) {
  if (!hash) return null;
  const name = await runGit(
    repoPath,
    ['name-rev', '--name-only', '--no-undefined', '--refs=refs/heads/*', hash],
    { allowedExitCodes: [0, 128] },
  );
  return name.trim() || GitRefHelper.shortHash(hash);
}

/**
 * What to call the two sides of a conflict. Stage 2 is always the branch being merged
 * into: during a rebase that is the branch being rebased onto, as git replays the
 * branch's own commits on top of it.
 */
async function getConflictLabels(repoPath) {
  const gitDir = await getGitDir(repoPath);
  const operation = await getOperation(repoPath);

  if (operation === 'rebase') {
    const isMergeBackend = await FileSystemHelper.exists(path.join(gitDir, 'rebase-merge'));
    const folder = isMergeBackend ? 'rebase-merge' : 'rebase-apply';
    const onto = await readGitFile(gitDir, `${folder}/onto`);
    const headName = await readGitFile(gitDir, `${folder}/head-name`);
    return {
      ours: (await nameCommit(repoPath, onto)) ?? 'HEAD',
      theirs: headName === null ? 'Commit being rebased' : GitRefHelper.fromLocalRef(headName),
    };
  }

  const ours = (await getCurrentBranch(repoPath)) ?? 'HEAD';
  if (operation === 'merge') {
    // "Merge branch 'topic'" or "Merge remote-tracking branch 'origin/topic'".
    const message = await readGitFile(gitDir, 'MERGE_MSG');
    const named = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(message ?? '')?.[1];
    const theirs = named ?? (await nameCommit(repoPath, await readGitFile(gitDir, 'MERGE_HEAD')));
    return { ours, theirs: theirs ?? 'Incoming' };
  }

  const cherryPick = await readGitFile(gitDir, 'CHERRY_PICK_HEAD');
  if (cherryPick) return { ours, theirs: await nameCommit(repoPath, cherryPick) };
  // Applying a stash is the other way to end up with conflicts.
  return { ours, theirs: 'Stashed changes' };
}

async function requireConflicted(repoPath, filePath) {
  const { conflicted } = await getStatus(repoPath);
  if (!conflicted.some((file) => file.path === filePath)) {
    throw ApiError.badRequest(`${filePath} has no conflict to resolve.`);
  }
}

/** The file on disk, which must stay inside the working tree whatever the path says. */
function workingFilePath(repoPath, filePath) {
  const root = path.resolve(repoPath);
  const target = path.resolve(root, filePath);
  if (!target.startsWith(root + path.sep)) throw ApiError.badRequest(`Invalid path: ${filePath}`);
  return target;
}

/**
 * The versions of a conflicted file: the common ancestor, each side, and the file on
 * disk. A side the other one deleted is null, as is the ancestor when both added the
 * file. Each is converted as a checkout would, so line endings match the working tree.
 */
export async function getConflict(repoPath, { filePath }) {
  await requireConflicted(repoPath, filePath);

  const entries = await runGitOnPaths(repoPath, ['ls-files', '--unmerged', '-z', '--', filePath]);
  const stages = new Set(
    entries
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.split('\t')[0].split(' ')[2]),
  );

  const versions = { base: null, ours: null, theirs: null };
  await Promise.all(
    Object.entries(CONFLICT_STAGES).map(async ([stage, side]) => {
      if (!stages.has(stage)) return;
      versions[side] = await runGit(repoPath, ['cat-file', '--filters', `:${stage}:${filePath}`]);
    }),
  );

  const [working, labels] = await Promise.all([
    fs.readFile(workingFilePath(repoPath, filePath), 'utf8').catch(() => null),
    getConflictLabels(repoPath),
  ]);
  const binary = [versions.base, versions.ours, versions.theirs].some((text) =>
    text?.includes('\0'),
  );
  return { path: filePath, ...versions, working, labels, binary };
}

const RESOLVE_SIDES = { ours: '--ours', theirs: '--theirs' };

/**
 * Writes `content` as the resolved file and marks it resolved. Or `side` takes one side's
 * version whole, which is the way to resolve a binary file, and `remove` deletes the file,
 * which is how a conflict between a change and a deletion ends up siding with the deletion.
 */
export async function resolveConflict(repoPath, { filePath, content, side, remove = false }) {
  await requireConflicted(repoPath, filePath);
  if (remove) {
    await runGitOnPaths(repoPath, ['rm', '--quiet', '--force', '--', filePath]);
    return;
  }
  if (side !== undefined) {
    if (!RESOLVE_SIDES[side]) throw ApiError.badRequest(`Unknown side: ${side}`);
    await runGitOnPaths(repoPath, ['checkout', RESOLVE_SIDES[side], '--', filePath]);
    await stage(repoPath, { paths: [filePath] });
    return;
  }
  if (typeof content !== 'string') throw ApiError.badRequest('"content" is required.');
  const target = workingFilePath(repoPath, filePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  await stage(repoPath, { paths: [filePath] });
}

/**
 * Takes back resolving a conflict, putting the file back as git first left it, with its
 * conflict markers. Git remembers each side of a resolved file for this until the merge
 * is committed, so this only works while it is still under way.
 */
export async function unresolveConflict(repoPath, { filePath }) {
  const { operation, conflicted } = await getStatus(repoPath);
  if (!operation) throw ApiError.gitFailure('There is no merge under way to undo this in.');
  if (conflicted.some((file) => file.path === filePath)) return;
  await runGitOnPaths(repoPath, ['checkout', '--merge', '--', filePath]);
}
