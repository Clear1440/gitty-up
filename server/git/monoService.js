import { ApiError, badRequest, gitFailure } from '../errors.js';
import { mapWithLimit } from '../utils/mapWithLimit.js';
import * as git from './gitService.js';
import {
  assignPrefixes,
  interleaveCommits,
  mergeBranches,
  mergeStatuses,
  toMonoCommit,
} from './monoMerge.js';

/**
 * A mono repo makes a group of repositories look like one repository. Every function
 * here matches the one of the same name in gitService, taking a mono repo where that
 * takes a path, so the routes and the client can treat the two alike.
 *
 * Its members are the group's repositories that have its branch checked out, worked out
 * afresh on every request. So a repository that moves to another branch simply leaves,
 * and one that moves to this branch joins. Files appear under a folder per member.
 */

const ID_PREFIX = 'mono-';
const GIT_CONCURRENCY = 8;

const COMMIT_HASH = /^([0-9a-f]+)-([0-9a-f]+)$/;

export const isMonoId = (id) => id.startsWith(ID_PREFIX);
export const groupIdOf = (monoId) => monoId.slice(ID_PREFIX.length);

function listNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

const namesOf = (members) => listNames(members.map(({ name }) => name));

/** Reads a group as a mono repo on `group.monoBranch`, or null if it was never opened. */
export async function resolveMono(store, group) {
  if (!group.monoBranch) return null;

  const linked = (await store.list()).filter(({ groupId }) => groupId === group.id);
  const repositories = await mapWithLimit(
    assignPrefixes(linked),
    GIT_CONCURRENCY,
    async (repository) => {
      // A stub has no folder, and git would otherwise run in the server's own.
      if (!repository.path) return { ...repository, branch: null, missing: true };
      try {
        return { ...repository, branch: await git.getCurrentBranch(repository.path) };
      } catch {
        return { ...repository, branch: null, missing: true };
      }
    },
  );

  return {
    id: `${ID_PREFIX}${group.id}`,
    name: group.name,
    branch: group.monoBranch,
    repositories,
    members: repositories.filter(({ branch }) => branch === group.monoBranch),
    leftOut: repositories.filter(({ branch }) => branch !== group.monoBranch),
    setBranch: (branch) => store.setMonoBranch(group.id, branch),
  };
}

/** What a mono repo is called in place of a repository entry. */
export function describeMono({ id, name, branch, members }) {
  return { id, name, branch, path: null, isMono: true, available: members.length > 0, summary: null };
}

/** Points a group at `branch`, which at least one of its repositories must be on. */
export async function openMono(store, group, branch) {
  const mono = await resolveMono(store, { ...group, monoBranch: branch });
  if (mono.members.length === 0) {
    throw badRequest(`No repository in ${group.name} has ${branch} checked out.`);
  }
  await store.setMonoBranch(group.id, branch);
  return describeMono(mono);
}

const readEach = (members, read) => mapWithLimit(members, GIT_CONCURRENCY, read);

function readStatuses(members) {
  return readEach(members, async (member) => ({
    member,
    status: await git.getStatus(member.path),
  }));
}

/**
 * Runs an action on each member, carrying on past failures so one repository cannot
 * hold up the others, then reports what happened to each, a line apiece. Stopping on
 * conflicts stays a CONFLICTS error, so that the conflict banner takes over as it does
 * for one repository. PARTIAL means some members did finish, so it is not a plain failure.
 */
async function forEachMember(members, action, { doneIn = 'Done in', nextStep = '' } = {}) {
  const results = await mapWithLimit(members, GIT_CONCURRENCY, async (member) => {
    try {
      return { member, value: await action(member) };
    } catch (error) {
      return { member, error };
    }
  });

  const failures = results.filter(({ error }) => error);
  if (failures.length > 0) {
    const succeeded = results.filter(({ error }) => !error).map(({ member }) => member);
    const message = [
      succeeded.length > 0 && `${doneIn} ${namesOf(succeeded)}.`,
      ...failures.map(({ member, error }) => `${member.name}: ${error.message}`),
      nextStep,
    ]
      .filter(Boolean)
      .join('\n');
    const details = failures.map(({ error }) => error.details).filter(Boolean).join('\n');
    if (failures.every(({ error }) => error.code === 'CONFLICTS')) {
      throw new ApiError(409, 'CONFLICTS', message, details);
    }
    if (succeeded.length > 0) throw new ApiError(409, 'PARTIAL', message, details);
    throw gitFailure(message, details);
  }
  return results.map(({ value }) => value);
}

/**
 * For steps that only make sense everywhere at once: a member left behind on the old
 * branch would drop out of the mono repo. So the first failure undoes the rest.
 */
async function allOrNone(members, action, undo, describeFailure) {
  const done = [];
  for (const member of members) {
    try {
      await action(member);
      done.push(member);
    } catch (error) {
      await Promise.allSettled(done.map(undo));
      throw gitFailure(`${describeFailure(member)} ${error.message}`, error.details);
    }
  }
}

function findMember(mono, monoPath) {
  const separator = monoPath.indexOf('/');
  const prefix = monoPath.slice(0, separator);
  const member = mono.members.find((candidate) => candidate.prefix === prefix);
  if (separator === -1 || !member) throw badRequest(`${monoPath} is not in this mono repo.`);
  return { member, path: monoPath.slice(separator + 1) };
}

/** Runs an action per member with that member's own paths, or on all with no paths. */
function onPaths(mono, paths, action) {
  if (!paths) return forEachMember(mono.members, (member) => action(member, undefined));

  const byMember = new Map();
  for (const monoPath of paths) {
    const { member, path } = findMember(mono, monoPath);
    byMember.set(member, [...(byMember.get(member) ?? []), path]);
  }
  return forEachMember([...byMember.keys()], (member) => action(member, byMember.get(member)));
}

/** Splits a mono hash. Any repository of the group will do, as old commits outlive a checkout. */
function resolveCommit(mono, monoHash) {
  const [, id, hash] = COMMIT_HASH.exec(monoHash) ?? [];
  const member = mono.repositories.find((repository) => repository.id === id);
  if (!member || member.missing) throw badRequest(`Invalid commit: ${monoHash}`);
  return { member, hash };
}

/** Says why a repository is left out, and whether switching branch would bring it in. */
async function describeLeftOut(mono, repository) {
  const { id, name, branch, missing, path } = repository;
  if (missing) return { id, name, branch: null, missing: true, canJoin: false };
  const canJoin = await git.hasLocalBranch(path, mono.branch).catch(() => false);
  return { id, name, branch, missing: false, canJoin };
}

export async function getStatus(mono) {
  const [results, leftOut] = await Promise.all([
    readStatuses(mono.members),
    readEach(mono.leftOut, (repository) => describeLeftOut(mono, repository)),
  ]);
  return {
    ...mergeStatuses(mono.branch, results),
    mono: {
      members: mono.members.map(({ id, name }) => ({ id, name })),
      leftOut,
    },
  };
}

export async function getBranches(mono) {
  return mergeBranches(await readEach(mono.members, ({ path }) => git.getBranches(path)));
}

export async function getRemoteOptions(mono) {
  const options = await readEach(mono.members, ({ path }) => git.getRemoteOptions(path));
  const [first, ...rest] = options.map(({ remotes }) => remotes);
  const remotes = (first ?? []).filter((remote) => rest.every((list) => list.includes(remote)));
  return { remotes, defaultRemote: remotes.includes('origin') ? 'origin' : (remotes[0] ?? null) };
}

/** Labels on commits can't say which repository a pull request belongs to, so none show. */
export async function getPullRequests() {
  return [];
}

/**
 * Lists commits from every member, newest first. All branches means all shared branches,
 * as the mono repo has no others. Each page merges from the start, because where one
 * page ends in a member's history depends on all the others.
 */
export async function getCommits(mono, { ref, limit = 100, skip = 0 } = {}) {
  const branches = await getBranches(mono);
  const revisions = [
    'HEAD',
    ...branches.local.map(({ name }) => `refs/heads/${name}`),
    ...branches.remote.map(({ name }) => `refs/remotes/${name}`),
  ];

  const lists = await readEach(mono.members, async (member) => {
    const commits = await git.getCommits(member.path, {
      ...(ref ? { ref } : { revisions }),
      limit: skip + limit,
    });
    return commits.map((commit) => toMonoCommit(member, commit, branches));
  });
  return interleaveCommits(lists).slice(skip, skip + limit);
}

export async function getCommitDetails(mono, monoHash) {
  const { member, hash } = resolveCommit(mono, monoHash);
  return toMonoCommit(member, await git.getCommitDetails(member.path, hash));
}

export function getCommitDiff(mono, { hash: monoHash, ...options }) {
  const { member, hash } = resolveCommit(mono, monoHash);
  return git.getCommitDiff(member.path, { ...options, hash });
}

export function getDiff(mono, { filePath, ...options }) {
  const { member, path } = findMember(mono, filePath);
  return git.getDiff(member.path, { ...options, filePath: path });
}

export function stageLines(mono, { filePath, ...options }) {
  const { member, path } = findMember(mono, filePath);
  return git.stageLines(member.path, { ...options, filePath: path });
}

export async function getConflict(mono, { filePath, ...options }) {
  const { member, path } = findMember(mono, filePath);
  // The client knows the file by its mono path, so it gets that back.
  return { ...(await git.getConflict(member.path, { ...options, filePath: path })), path: filePath };
}

export function resolveConflict(mono, { filePath, ...options }) {
  const { member, path } = findMember(mono, filePath);
  return git.resolveConflict(member.path, { ...options, filePath: path });
}

export async function fetchAll(mono) {
  await forEachMember(mono.members, ({ path }) => git.fetchAll(path));
}

export async function pull(mono, options) {
  const results = await readStatuses(mono.members);
  // A branch that was never pushed has nothing to pull, which is no reason to fail.
  const tracking = results.filter(({ status }) => status.upstream).map(({ member }) => member);
  if (tracking.length === 0) throw gitFailure('None of these branches are on a remote yet.');
  await forEachMember(tracking, ({ path }) => git.pull(path, options));
}

export async function push(mono, options) {
  await forEachMember(mono.members, ({ path }) => git.push(path, options), {
    doneIn: 'Pushed',
    nextStep: 'Fix that, then push again. Repositories already pushed are not affected.',
  });
}

export async function checkout(mono, options) {
  const { members, branch: previous } = mono;
  await allOrNone(
    members,
    ({ path }) => git.checkout(path, options),
    ({ path }) => git.checkout(path, { branch: previous }),
    ({ name }) => `Everything stayed on ${previous}, because ${name} could not switch.`,
  );
  if (members.length > 0) await mono.setBranch(await git.getCurrentBranch(members[0].path));
}

export async function createBranch(mono, options) {
  const { name, switchTo = true } = options;
  await allOrNone(
    mono.members,
    ({ path }) => git.createBranch(path, options),
    async ({ path }) => {
      if (switchTo) await git.checkout(path, { branch: mono.branch });
      await git.deleteBranch(path, { name, force: true });
    },
    (member) => `No branch was created, because ${member.name} could not create ${name}.`,
  );
  if (switchTo) await mono.setBranch(name);
}

export async function deleteBranch(mono, options) {
  await forEachMember(mono.members, ({ path }) => git.deleteBranch(path, options), {
    doneIn: 'Deleted in',
  });
}

export async function deleteRemoteBranch(mono, options) {
  await forEachMember(mono.members, ({ path }) => git.deleteRemoteBranch(path, options), {
    doneIn: 'Deleted in',
  });
}

/** Only shared branches: the rest were never shown, so they were never agreed to. */
export async function pruneGoneBranches(mono, { force = false } = {}) {
  const { local } = await getBranches(mono);
  const names = local.filter(({ upstreamGone }) => upstreamGone).map(({ name }) => name);
  const results = await forEachMember(mono.members, ({ path }) =>
    git.pruneGoneBranches(path, { force, names }),
  );

  // A branch kept anywhere still exists, so it can't also count as deleted.
  const kept = new Set(results.flatMap((result) => result.kept));
  const deleted = new Set(results.flatMap((result) => result.deleted));
  return { deleted: [...deleted].filter((name) => !kept.has(name)), kept: [...kept] };
}

export async function merge(mono, options) {
  await forEachMember(mono.members, ({ path }) => git.merge(path, options), {
    doneIn: 'Merged in',
  });
}

/** Leaves `target` checked out, so the mono repo follows it for as long as any member did. */
export async function mergeInto(mono, options) {
  try {
    await forEachMember(mono.members, ({ path }) => git.mergeInto(path, options), {
      doneIn: 'Merged in',
    });
  } finally {
    const current = await readEach(mono.members, ({ path }) => git.getCurrentBranch(path));
    if (current.includes(options.target)) await mono.setBranch(options.target);
  }
}

export async function rebase(mono, options) {
  await forEachMember(mono.members, ({ path }) => git.rebase(path, options), {
    doneIn: 'Rebased in',
  });
}

async function membersInOperation(mono) {
  const results = await readStatuses(mono.members);
  const active = results.filter(({ status }) => status.operation).map(({ member }) => member);
  if (active.length === 0) throw gitFailure('There is no merge or rebase in progress.');
  return active;
}

export async function abortOperation(mono) {
  await forEachMember(await membersInOperation(mono), ({ path }) => git.abortOperation(path));
}

export async function continueOperation(mono) {
  await forEachMember(await membersInOperation(mono), ({ path }) => git.continueOperation(path));
}

export async function stage(mono, { paths } = {}) {
  await onPaths(mono, paths, ({ path }, ownPaths) => git.stage(path, { paths: ownPaths }));
}

export async function unstage(mono, { paths } = {}) {
  await onPaths(mono, paths, ({ path }, ownPaths) => git.unstage(path, { paths: ownPaths }));
}

export async function discard(mono, { paths }) {
  await onPaths(mono, paths, ({ path }, ownPaths) => git.discard(path, { paths: ownPaths }));
}

/**
 * Commits to every member with something to commit, all with the same message. Whatever
 * can be checked is checked first, so a commit only ever stops halfway on a hook. Then
 * the failed members keep their staged changes, so committing again picks up just those.
 */
export async function commit(mono, { message, amend = false, stageAll = false }) {
  if (amend) throw badRequest('Amending is not available across repositories.');

  const results = await readStatuses(mono.members);
  const conflicted = results.filter(({ status }) => status.conflicted.length > 0);
  if (conflicted.length > 0) {
    const names = namesOf(conflicted.map(({ member }) => member));
    throw gitFailure(`Resolve the conflicts in ${names} before committing.`);
  }

  const targets = results.filter(
    ({ status }) =>
      status.staged.length > 0 ||
      status.operation === 'merge' ||
      (stageAll && status.unstaged.length > 0),
  );
  if (targets.length === 0) throw gitFailure('There is nothing to commit.');

  const needsMessage = targets.some(({ status }) => status.operation !== 'merge');
  if (!message?.trim() && needsMessage) throw badRequest('A commit message is required.');

  await forEachMember(
    targets.map(({ member }) => member),
    ({ path }) => git.commit(path, { message, stageAll }),
    {
      doneIn: 'Committed to',
      nextStep: 'The rest are still staged, so commit again once that is fixed.',
    },
  );
}

/** One commit per member can't be taken back as one, so undo stays with each repository. */
export async function getLastCommit() {
  return null;
}

export async function checkoutCommit() {
  throw badRequest('Open the repository on its own to check out a commit.');
}

export async function cherryPick() {
  throw badRequest('Open the repository on its own to cherry-pick a commit.');
}

export async function resetToCommit() {
  throw badRequest('Open the repository on its own to reset to a commit.');
}

export async function undoCommit() {
  throw badRequest('Open the repository on its own to undo a commit.');
}

export async function getStashes(mono) {
  const lists = await readEach(mono.members, async (member) => {
    const stashes = await git.getStashes(member.path);
    return stashes.map((stash) => ({
      ...stash,
      ref: `${member.id}:${stash.ref}`,
      repository: member.name,
    }));
  });
  return lists.flat().sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

function resolveStash(mono, monoRef) {
  const separator = monoRef?.indexOf(':') ?? -1;
  const member = mono.members.find(({ id }) => id === monoRef?.slice(0, separator));
  if (separator === -1 || !member) throw badRequest(`Invalid stash: ${monoRef}`);
  return { member, ref: monoRef.slice(separator + 1) };
}

export async function stashSave(mono, options) {
  const results = await readStatuses(mono.members);
  const changed = results
    .filter(({ status }) => status.staged.length + status.unstaged.length > 0)
    .map(({ member }) => member);
  if (changed.length === 0) throw gitFailure('There are no changes to stash.');
  await forEachMember(changed, ({ path }) => git.stashSave(path, options), {
    doneIn: 'Stashed in',
  });
}

export async function stashApply(mono, { ref: monoRef }) {
  const { member, ref } = resolveStash(mono, monoRef);
  await git.stashApply(member.path, { ref });
}

/** Restores a stash and removes it. Without `ref`, uses the newest of any member's. */
export async function stashPop(mono, { ref: monoRef } = {}) {
  const newest = monoRef ?? (await getStashes(mono))[0]?.ref;
  if (!newest) throw gitFailure('There are no stashes to restore.');
  const { member, ref } = resolveStash(mono, newest);
  await git.stashPop(member.path, { ref });
}

export async function stashDrop(mono, { ref: monoRef }) {
  const { member, ref } = resolveStash(mono, monoRef);
  await git.stashDrop(member.path, { ref });
}
