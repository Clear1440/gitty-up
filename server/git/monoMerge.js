/**
 * Pure helpers that fold what git says about each member of a mono repo into what one
 * repository would say. A member is `{ id, name, prefix, path }`.
 */

const sum = (items, read) => items.reduce((total, item) => total + read(item), 0);

/** Each repository's folder in the mono repo: its name, with a number if that is taken. */
export function assignPrefixes(repositories) {
  const taken = new Set();
  return repositories.map((repository) => {
    let prefix = repository.name;
    for (let copy = 2; taken.has(prefix.toLowerCase()); copy += 1) {
      prefix = `${repository.name}-${copy}`;
    }
    taken.add(prefix.toLowerCase());
    return { ...repository, prefix };
  });
}

/** Two members can hold the same commit, as forks do, so a hash alone cannot name one. */
export const toMonoHash = (member, hash) => `${member.id}-${hash}`;

const toMonoPath = (member, path) => `${member.prefix}/${path}`;

function toMonoFile(member) {
  return (file) => ({
    ...file,
    path: toMonoPath(member, file.path),
    originalPath: file.originalPath && toMonoPath(member, file.originalPath),
    repository: member.name,
  });
}

/** `results` is a list of `{ member, status }`. */
export function mergeStatuses(branch, results) {
  const statuses = results.map(({ status }) => status);
  const filesIn = (area) =>
    results.flatMap(({ member, status }) => status[area].map(toMonoFile(member)));
  const withHead = results.find(({ status }) => status.headHash);

  return {
    branch,
    detached: false,
    headHash: withHead ? toMonoHash(withHead.member, withHead.status.headHash) : null,
    // Anything less than all of them means there is still something to publish.
    upstream: statuses.every(({ upstream }) => upstream) ? (statuses[0]?.upstream ?? null) : null,
    upstreamGone: statuses.some(({ upstreamGone }) => upstreamGone),
    ahead: sum(statuses, ({ ahead }) => ahead),
    behind: sum(statuses, ({ behind }) => behind),
    staged: filesIn('staged'),
    unstaged: filesIn('unstaged'),
    conflicted: filesIn('conflicted'),
    operation: statuses.find(({ operation }) => operation)?.operation ?? null,
  };
}

function latest(items, readDate) {
  return items.reduce((newest, item) => {
    if (!newest) return item;
    return Date.parse(readDate(item)) > Date.parse(readDate(newest)) ? item : newest;
  }, null);
}

function mergeCopies(copies) {
  const checkouts = copies.map(({ lastCheckout }) => lastCheckout).filter(Boolean);
  return {
    ...copies[0],
    lastCommit: latest(
      copies.map(({ lastCommit }) => lastCommit),
      ({ date }) => date,
    ),
    lastCheckout: latest(checkouts, (date) => date),
  };
}

function mergeLocalCopies(copies) {
  return {
    ...mergeCopies(copies),
    isCurrent: copies.every(({ isCurrent }) => isCurrent),
    upstream: copies.every(({ upstream }) => upstream) ? copies[0].upstream : null,
    // Only when every copy is gone, as pruning must not take a branch some still track.
    upstreamGone: copies.every(({ upstreamGone }) => upstreamGone),
    ahead: sum(copies, ({ ahead }) => ahead),
    behind: sum(copies, ({ behind }) => behind),
  };
}

/** Keeps the names found in every list, folding each name's copies into one branch. */
function intersectByName(lists, merge) {
  const [first = [], ...rest] = lists;
  const others = rest.map((list) => new Map(list.map((branch) => [branch.name, branch])));

  return first.flatMap((branch) => {
    const copies = others.map((other) => other.get(branch.name));
    return copies.every(Boolean) ? [merge([branch, ...copies])] : [];
  });
}

/** The branches of a mono repo: only those every member has. `lists` are from getBranches. */
export function mergeBranches(lists) {
  return {
    local: intersectByName(
      lists.map(({ local }) => local),
      mergeLocalCopies,
    ),
    remote: intersectByName(
      lists.map(({ remote }) => remote),
      mergeCopies,
    ),
  };
}

/** Whether a commit's label stands for something the mono repo has. */
function isSharedRef({ type, name }, { local, remote }) {
  if (type === 'branch') return local.some((branch) => branch.name === name);
  if (type === 'remote') return remote.some((branch) => branch.name === name);
  return true;
}

export function toMonoCommit(member, commit, branches) {
  return {
    ...commit,
    hash: toMonoHash(member, commit.hash),
    parents: commit.parents.map((parent) => toMonoHash(member, parent)),
    refs: branches ? commit.refs.filter((ref) => isSharedRef(ref, branches)) : commit.refs,
    repository: member.name,
  };
}

/**
 * Merges commit lists, newest first. Each list keeps its own order, which matters more
 * than the dates do: the client's git tree needs children before their parents.
 */
export function interleaveCommits(lists) {
  const positions = lists.map(() => 0);
  const merged = [];

  for (;;) {
    let next = -1;
    lists.forEach((list, index) => {
      const commit = list[positions[index]];
      if (!commit) return;
      const best = next === -1 ? null : lists[next][positions[next]];
      if (!best || Date.parse(commit.date) > Date.parse(best.date)) next = index;
    });
    if (next === -1) return merged;

    merged.push(lists[next][positions[next]]);
    positions[next] += 1;
  }
}
