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
  } else if (key === 'branch.ab') {
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
    if (ref.startsWith('refs/heads/')) {
      branches.local.push({
        name: ref.slice('refs/heads/'.length),
        isCurrent: head === '*',
        upstream: upstream || null,
        ...parseTracking(track),
        lastCommit,
      });
    } else {
      const name = ref.slice('refs/remotes/'.length);
      const remote = remoteNames.find((candidate) => name.startsWith(`${candidate}/`));
      branches.remote.push({
        name,
        remote: remote ?? null,
        localName: remote ? name.slice(remote.length + 1) : name,
        lastCommit,
      });
    }
  }
  return branches;
}

export const COMMIT_FORMAT = `${['%H', '%h', '%P', '%an', '%ae', '%aI', '%D', '%s'].join('%x00')}%x1e`;

function parseDecoration(decoration) {
  if (decoration.startsWith('tag: ')) {
    return { type: 'tag', name: decoration.slice('tag: '.length) };
  }
  if (decoration.startsWith('HEAD -> ')) {
    return { type: 'head', name: decoration.slice('HEAD -> '.length) };
  }
  // A bare HEAD means a detached checkout.
  return { type: decoration === 'HEAD' ? 'head' : 'branch', name: decoration };
}

function parseDecorations(decorations) {
  if (!decorations) return [];
  return (
    decorations
      .split(', ')
      // Aliases such as origin/HEAD only repeat the branch they point at.
      .filter((decoration) => !decoration.endsWith('/HEAD'))
      .map(parseDecoration)
  );
}

/** Parses `git log` output produced with COMMIT_FORMAT. */
export function parseCommits(output) {
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
        date,
        refs: parseDecorations(refs),
        subject,
      };
    });
}

export const STASH_FORMAT = ['%gs', '%cI'].join('%x00');

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
      const [subject, date] = line.split('\0');
      return { ref: `stash@{${index}}`, ...parseStashSubject(subject), date };
    });
}
