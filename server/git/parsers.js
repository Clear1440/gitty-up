import { avatarUrl } from './avatar.js';
import { GitRefHelper } from './GitRefHelper.js';

/** What git's one-letter change codes stand for, in status and diff output alike. */
const STATUS_NAMES = {
  A: 'added',
  C: 'copied',
  D: 'deleted',
  M: 'modified',
  R: 'renamed',
  T: 'typechange',
};

/** Returns what follows the first `count` space-separated fields. */
function afterFields(record, count) {
  let index = -1;
  for (let field = 0; field < count; field += 1) {
    index = record.indexOf(' ', index + 1);
  }
  return record.slice(index + 1);
}

function fileEntry(path, status, originalPath = null) {
  return { path, originalPath, status };
}

function applyBranchHeader(status, record) {
  const [, key, value, behind] = record.split(' ');
  if (key === 'branch.oid') {
    status.headHash = value === '(initial)' ? null : value;
  } else if (key === 'branch.head') {
    status.detached = value === '(detached)';
    status.branch = status.detached ? null : value;
  } else if (key === 'branch.upstream') {
    status.upstream = value;
    // Git only compares with an upstream it can still find, so branch.ab clears this.
    status.upstreamGone = true;
  } else if (key === 'branch.ab') {
    status.upstreamGone = false;
    status.ahead = Number(value);
    status.behind = Math.abs(Number(behind));
  }
}

function addTrackedChange(status, [indexCode, worktreeCode], path, originalPath) {
  if (indexCode !== '.') {
    status.staged.push(fileEntry(path, STATUS_NAMES[indexCode], originalPath));
  }
  if (worktreeCode !== '.') {
    status.unstaged.push(fileEntry(path, STATUS_NAMES[worktreeCode], originalPath));
  }
}

/** Parses `git status --porcelain=v2 --branch -z`. */
export function parseStatus(output) {
  const status = {
    branch: null,
    detached: false,
    headHash: null,
    upstream: null,
    upstreamGone: false,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    conflicted: [],
  };

  const records = output.split('\0');
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const kind = record[0];

    if (kind === '#') {
      applyBranchHeader(status, record);
    } else if (kind === '1') {
      addTrackedChange(status, record.slice(2, 4), afterFields(record, 8), null);
    } else if (kind === '2') {
      // A rename carries its original path as the next NUL-separated record.
      index += 1;
      addTrackedChange(status, record.slice(2, 4), afterFields(record, 9), records[index]);
    } else if (kind === 'u') {
      status.conflicted.push(fileEntry(afterFields(record, 10), 'conflicted'));
    } else if (kind === '?') {
      status.unstaged.push(fileEntry(record.slice(2), 'untracked'));
    }
  }
  return status;
}

// for-each-ref spells a NUL byte %00, while the log family spells it %x00.
export const BRANCH_FORMAT = [
  '%(refname)',
  '%(objectname:short)',
  '%(upstream:short)',
  '%(upstream:track,nobracket)',
  '%(HEAD)',
  '%(committerdate:iso-strict)',
  '%(authorname)',
  '%(subject)',
  '%(symref)',
].join('%00');

function parseTracking(track) {
  return {
    ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
    upstreamGone: track === 'gone',
  };
}

/** Parses `git for-each-ref` output produced with BRANCH_FORMAT. */
export function parseBranches(output, remoteNames) {
  const branches = { local: [], remote: [] };

  for (const line of output.split('\n').filter(Boolean)) {
    const [ref, shortHash, upstream, track, head, date, author, subject, symref] =
      line.split('\0');
    // Skip aliases such as refs/remotes/origin/HEAD.
    if (symref) continue;

    const lastCommit = { shortHash, date, author, subject };
    if (GitRefHelper.isLocalRef(ref)) {
      branches.local.push({
        name: GitRefHelper.fromLocalRef(ref),
        isCurrent: head === '*',
        upstream: upstream || null,
        ...parseTracking(track),
        lastCommit,
      });
    } else {
      const name = GitRefHelper.fromRemoteRef(ref);
      const { remote, localName } = GitRefHelper.splitRemoteName(name, remoteNames);
      branches.remote.push({ name, remote, localName, lastCommit });
    }
  }
  return branches;
}

const CHECKOUT_ENTRY = /^checkout: moving from (.+) to (.+)$/;

// The selector carries the entry's own time, unlike %ct, which is its commit's.
export const CHECKOUT_FORMAT = ['%gd', '%gs'].join('%x00');

/**
 * Parses `git reflog --date=unix` output produced with CHECKOUT_FORMAT into a map of
 * branch name to when it was last left or switched to, as an ISO date.
 */
export function parseCheckouts(output) {
  const checkouts = new Map();

  for (const line of output.split('\n').filter(Boolean)) {
    const [selector, subject] = line.split('\0');
    const moved = CHECKOUT_ENTRY.exec(subject ?? '');
    const seconds = Number(/@\{(\d+)\}$/.exec(selector)?.[1]);
    if (!moved || !seconds) continue;

    // Newest comes first, so the first sighting of a branch is its latest.
    const date = new Date(seconds * 1000).toISOString();
    for (const branch of moved.slice(1)) {
      if (!checkouts.has(branch)) checkouts.set(branch, date);
    }
  }
  return checkouts;
}

export const COMMIT_FORMAT = `${['%H', '%h', '%P', '%an', '%ae', '%aI', '%D', '%s'].join('%x00')}%x1e`;

/** Goes with COMMIT_FORMAT: full ref names are what tell a local branch from a remote one. */
export const COMMIT_LOG_FLAGS = ['--decorate=full', `--format=${COMMIT_FORMAT}`];

function parseBranchRef(ref, remoteNames) {
  if (GitRefHelper.isRemoteRef(ref)) {
    const name = GitRefHelper.fromRemoteRef(ref);
    return { type: 'remote', name, ...GitRefHelper.splitRemoteName(name, remoteNames) };
  }
  // Anything else names a local branch, with or without its refs/heads/ prefix.
  return { type: 'branch', name: GitRefHelper.fromLocalRef(ref) };
}

function parseDecoration(decoration, remoteNames) {
  if (decoration.startsWith('tag: ')) {
    return { type: 'tag', name: decoration.slice('tag: refs/tags/'.length) };
  }
  if (decoration.startsWith('HEAD -> ')) {
    const { name } = parseBranchRef(decoration.slice('HEAD -> '.length), remoteNames);
    return { type: 'head', name };
  }
  // A bare HEAD means a detached checkout.
  if (decoration === 'HEAD') return { type: 'head', name: 'HEAD' };
  return parseBranchRef(decoration, remoteNames);
}

function parseDecorations(decorations, remoteNames) {
  if (!decorations) return [];
  return (
    decorations
      .split(', ')
      // Aliases such as origin/HEAD only repeat the branch they point at.
      .filter((decoration) => !decoration.endsWith('/HEAD'))
      .map((decoration) => parseDecoration(decoration, remoteNames))
  );
}

/** Parses `git log` output produced with COMMIT_LOG_FLAGS. */
export function parseCommits(output, remoteNames = []) {
  return output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, shortHash, parents, author, email, date, refs, subject] = record.split('\0');
      return {
        hash,
        shortHash,
        parents: parents ? parents.split(' ') : [],
        author,
        email,
        avatarUrl: avatarUrl(email),
        date,
        refs: parseDecorations(refs, remoteNames),
        subject,
      };
    });
}

/** Parses `git diff-tree --name-status -z` output. */
export function parseNameStatus(output) {
  const fields = output.split('\0');
  const files = [];

  for (let index = 0; index < fields.length - 1; ) {
    // A rename or copy is followed by a similarity score, as in R100, and two paths.
    const code = fields[index][0];
    const hasOriginal = code === 'R' || code === 'C';
    const originalPath = hasOriginal ? fields[index + 1] : undefined;
    const path = fields[index + (hasOriginal ? 2 : 1)];
    files.push({ path, status: STATUS_NAMES[code] ?? 'modified', originalPath });
    index += hasOriginal ? 3 : 2;
  }

  return files;
}

export const STASH_FORMAT = ['%gs', '%cI', '%H', '%P'].join('%x00');

const NAMED_STASH = /^On ([^:]+): (.*)$/;
const UNNAMED_STASH = /^WIP on ([^:]+): \S+ (.*)$/;

/** Git records stashes as "On main: my note" or "WIP on main: abc123 last commit". */
function parseStashSubject(subject) {
  const named = NAMED_STASH.exec(subject);
  if (named) return { branch: named[1], message: named[2] };

  const unnamed = UNNAMED_STASH.exec(subject);
  if (unnamed) return { branch: unnamed[1], message: `WIP: ${unnamed[2]}` };

  return { branch: null, message: subject };
}

/** Parses `git stash list` output produced with STASH_FORMAT. Newest comes first. */
export function parseStashes(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      const [subject, date, hash = null, parents = ''] = line.split('\0');
      return {
        ref: `stash@{${index}}`,
        ...parseStashSubject(subject),
        date,
        hash,
        // The commit it was made on, then its index and, if it has any, untracked files.
        parents: parents.split(' ').filter(Boolean),
      };
    });
}
