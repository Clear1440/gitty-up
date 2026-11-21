import { ApiError } from '../errors.js';
import { groupIdsOf } from '../store/repositoryStore.js';
import { AsyncHelper } from '../utils/AsyncHelper.js';
import { TextHelper } from '../utils/TextHelper.js';
import { GitRefHelper } from './GitRefHelper.js';
import * as git from './gitService.js';
import { MonoIdHelper } from './MonoIdHelper.js';
import {
  assignPrefixes,
  interleaveCommits,
  mergeBranches,
  mergeStatuses,
  toMonoCommit,
} from './monoMerge.js';
import { GIT_CONCURRENCY } from './runGit.js';

/**
 * A mono repo makes a group of repositories look like one repository. Every function
 * here matches the one of the same name in gitService, taking a mono repo where that
 * takes a path, so the routes and the client can treat the two alike.
 *
 * Its members are the group's repositories that have its branch checked out, worked out
 * afresh on every request. So a repository that moves to another branch simply leaves,
 * and one that moves to this branch joins. Files appear under a folder per member.
 */

const COMMIT_HASH = /^([0-9a-f]+)-([0-9a-f]+)$/;

/** @deprecated Use MonoIdHelper.isMonoId. */
export const isMonoId = MonoIdHelper.isMonoId;

/** @deprecated Use MonoIdHelper.toGroupId. */
export const groupIdOf = MonoIdHelper.toGroupId;

const namesOf = (members) => TextHelper.joinWithAnd(members.map(({ name }) => name));

/** Reads a group as a mono repo on `group.monoBranch`, or null if it was never opened. */
export async function resolveMono(store, group) {
  if (!group.monoBranch) return null;

  const linked = (await store.list()).filter((entry) => groupIdsOf(entry).includes(group.id));
  // A slot is a repository's lasting place in the group, so the page can give each a color
  // that stays put as others join or leave.
  const placed = assignPrefixes(linked).map((repository, slot) => ({ ...repository, slot }));
  const repositories = await readEach(placed, async (repository) => {
    const missing = { ...repository, branch: null, missing: true };
    // A stub has no folder, and git would otherwise run in the server's own.
    if (!repository.path) return missing;
    try {
      return { ...repository, branch: await git.getCurrentBranch(repository.path) };
    } catch {
      return missing;
    }
  });

  return {
    id: MonoIdHelper.fromGroupId(group.id),
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
  return {
    id,
    name,
    branch,
    path: null,
    isMono: true,
    available: members.length > 0,
    summary: null,
  };
}

/** Points a group at `branch`, which at least one of its repositories must be on. */
export async function openMono(store, group, branch) {
  const mono = await resolveMono(store, { ...group, monoBranch: branch });
  if (mono.members.length === 0) {
    throw ApiError.badRequest(`No repository in ${group.name} has ${branch} checked out.`);
  }
  await store.setMonoBranch(group.id, branch);
  return describeMono(mono);
}

/** Runs `read` on every member, a few at a time, with results in the members' order. */
function readEach(members, read) {
  return AsyncHelper.mapWithLimit(members, GIT_CONCURRENCY, read);
}

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
  const results = await readEach(members, async (member) => {
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
      throw ApiError.conflicts(message, details);
    }
    if (succeeded.length > 0) throw ApiError.partial(message, details);
    throw ApiError.gitFailure(message, details);
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
      throw ApiError.gitFailure(`${describeFailure(member)} ${error.message}`, error.details);
    }
  }
}

function findMember(mono, monoPath) {
  const separator = monoPath.indexOf('/');
  const prefix = monoPath.slice(0, separator);
  const member = mono.members.find((candidate) => candidate.prefix === prefix);
  if (separator === -1 || !member) {
    throw ApiError.badRequest(`${monoPath} is not in this mono repo.`);
  }
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
  if (!member || member.missing) throw ApiError.badRequest(`Invalid commit: ${monoHash}`);
  return { member, hash };
}

/** Says why a repository is left out, and whether switching branch would bring it in. */
async function describeLeftOut(mono, repository) {
  const { id, name, slot, branch, missing, path } = repository;
  if (missing) return { id, name, slot, branch: null, missing: true, canJoin: false };
  const canJoin = await git.hasLocalBranch(path, mono.branch).catch(() => false);
  return { id, name, slot, branch, missing: false, canJoin };
}

/**
 * A repository with no copy of the branch, sitting on its own main line, is where a
 * branch across some of the group puts it. That is no reason to warn: it rides along.
 */
const isFollowingMain = ({ missing, canJoin, branch }) =>
  !missing && !canJoin && GitRefHelper.isMainBranch(branch);

/** Where one member stands, so the page can say which repository a total comes from. */
function describeMember({ member, status }) {
  const { id, name, prefix, slot } = member;
  const { upstream, upstreamGone, ahead, behind, staged, unstaged, conflicted, operation } = status;
  const changes = new Set([...staged, ...unstaged, ...conflicted].map(({ path }) => path)).size;
  return { id, name, prefix, slot, upstream, upstreamGone, ahead, behind, changes, operation };
}

export async function getStatus(mono) {
  const [results, leftOut] = await Promise.all([
    readStatuses(mono.members),
    readEach(mono.leftOut, (repository) => describeLeftOut(mono, repository)),
  ]);
  return {
    ...mergeStatuses(mono.branch, results),
    mono: {
      members: results.map(describeMember),
      following: leftOut.filter(isFollowingMain),
      leftOut: leftOut.filter((repository) => !isFollowingMain(repository)),
    },
  };
}

const describeRepository = ({ id, name, slot }) => ({ id, name, slot });

/**
 * Branches that two or more of the group's repositories have, but not every member: a
 * feature that only touches some of them. The shared branches are listed already.
 */
export async function getSpanningBranches(mono) {
  const available = mono.repositories.filter(({ missing }) => !missing);
  const lists = await readEach(available, async (repository) => ({
    repository,
    names: await git.listLocalBranchNames(repository.path).catch(() => []),
  }));

  const memberIds = new Set(mono.members.map(({ id }) => id));
  const memberLists = lists.filter(({ repository }) => memberIds.has(repository.id));
  const isShared = (name) =>
    memberLists.length > 0 && memberLists.every(({ names }) => names.includes(name));

  const byName = new Map();
  for (const { repository, names } of lists) {
    for (const name of names) byName.set(name, [...(byName.get(name) ?? []), repository]);
  }

  return [...byName]
    .filter(([name, repositories]) => repositories.length > 1 && !isShared(name))
    .map(([name, repositories]) => ({
      name,
      repositories: repositories.map(describeRepository),
      total: available.length,
    }))
    .sort((a, b) => b.repositories.length - a.repositories.length || a.name.localeCompare(b.name));
}

/** Why one repository can't switch, or null when it can. */
function findSwitchProblem({ status, to, branch }) {
  if (status.operation) return `${status.operation} in progress`;
  if (status.conflicted.length > 0) return 'has conflicts';
  if (!to) return `has neither ${branch} nor a main or master branch`;
  // Staged changes would be carried to another branch, or block the switch halfway.
  if (status.staged.length > 0) {
    return TextHelper.countOf(status.staged.length, 'staged change');
  }
  return null;
}

/**
 * Where each of the group's repositories goes to work on `branch` across the group: onto
 * it if it has a copy, else onto its main line, so they all start from the same place.
 * Repositories not on this machine are left out. Nothing is changed.
 */
function readSwitchSteps(mono, branch) {
  return readEach(mono.repositories, async (repository) => {
    const described = describeRepository(repository);
    if (repository.missing) return { ...described, missing: true, from: null, to: null };

    const [names, status] = await Promise.all([
      git.listLocalBranchNames(repository.path),
      git.getStatus(repository.path),
    ]);
    const to = names.includes(branch) ? branch : GitRefHelper.pickMainBranch(names);
    const from = status.branch ?? null;
    const plan = { ...described, missing: false, from, fromHash: status.headHash, to };
    // A repository already where it should be has nothing to switch, so nothing to block.
    const problem = from === to ? null : findSwitchProblem({ status, to, branch });
    return { ...plan, problem, unstaged: status.unstaged.length };
  });
}

/** What switching the group to `branch` would do to each repository, and whether it can. */
export async function planSpan(mono, { branch }) {
  const steps = await readSwitchSteps(mono, branch);
  const present = steps.filter(({ missing }) => !missing);
  const onBranch = present.filter(({ to }) => to === branch).length;
  return {
    branch,
    repositories: steps.map(({ id, name, slot, missing, from, to, problem, unstaged }) => ({
      id,
      name,
      slot,
      missing,
      from,
      to,
      problem: problem ?? null,
      unstaged: unstaged ?? 0,
    })),
    onBranch,
    canSwitch: onBranch > 0 && present.every(({ problem }) => !problem),
  };
}

/**
 * Switches the whole group as planSpan says, then makes `branch` the mono repo's. All or
 * nothing: any problem stops it before it starts, and a switch that fails puts every
 * repository already switched back where it was.
 */
export async function switchSpan(mono, { branch }) {
  const steps = await readSwitchSteps(mono, branch);
  if (!steps.some(({ to }) => to === branch)) {
    throw ApiError.badRequest(`No repository in ${mono.name} has ${branch}.`);
  }
  const blocked = steps.filter(({ problem }) => problem);
  if (blocked.length > 0) {
    const lines = blocked.map(({ name, problem }) => `${name}: ${problem}`);
    throw ApiError.badRequest(
      [`Nothing was switched, because ${namesOf(blocked)} can't switch yet.`, ...lines].join('\n'),
    );
  }

  const byId = new Map(mono.repositories.map((repository) => [repository.id, repository]));
  const moves = steps
    .filter(({ missing, from, to }) => !missing && from !== to)
    .map((step) => ({ ...step, path: byId.get(step.id).path }));

  await allOrNone(
    moves,
    ({ path, to }) => git.checkout(path, { branch: to }),
    ({ path, from, fromHash }) =>
      from ? git.checkout(path, { branch: from }) : git.checkoutCommit(path, { hash: fromHash }),
    ({ name, to }) => `Nothing was switched, because ${name} could not switch to ${to}.`,
  );
  await mono.setBranch(branch);
}

export async function getBranches(mono) {
  return mergeBranches(await readEach(mono.members, ({ path }) => git.getBranches(path)));
}

export async function getRemoteOptions(mono) {
  const options = await readEach(mono.members, ({ path }) => git.getRemoteOptions(path));
  // Only remotes every member has, as one push goes to the same remote name in each.
  const [first, ...rest] = options.map(({ remotes }) => remotes);
  const remotes = (first ?? []).filter((remote) => rest.every((list) => list.includes(remote)));
  return { remotes, defaultRemote: GitRefHelper.pickDefaultRemote(remotes) };
}

/** Labels on commits can't say which repository a pull request belongs to, so none show. */
export async function getPullRequests() {
  return [];
}

/** Pull requests stay with each repository's own tab, so none of the remotes offer them. */
export async function getRemoteHosts(mono) {
  const { defaultRemote } = await getRemoteOptions(mono);
  return { defaultRemote, hosts: {} };
}

const PULL_REQUESTS_ELSEWHERE =
  "Pull requests aren't offered in a mono repo. Open the repository on its own to make one.";

export async function getPullRequestDraft() {
  throw ApiError.badRequest(PULL_REQUESTS_ELSEWHERE);
}

export async function openPullRequest() {
  throw ApiError.badRequest(PULL_REQUESTS_ELSEWHERE);
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
    ...branches.local.map(({ name }) => GitRefHelper.toLocalRef(name)),
    ...branches.remote.map(({ name }) => GitRefHelper.toRemoteRef(name)),
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

export function discardLines(mono, { filePath, ...options }) {
  const { member, path } = findMember(mono, filePath);
  return git.discardLines(member.path, { ...options, filePath: path });
}

export async function getConflict(mono, { filePath, ...options }) {
  const { member, path } = findMember(mono, filePath);
  const conflict = await git.getConflict(member.path, { ...options, filePath: path });
  // The client knows the file by its mono path, so it gets that back.
  return { ...conflict, path: filePath };
}

export function resolveConflict(mono, { filePath, ...options }) {
  const { member, path } = findMember(mono, filePath);
  return git.resolveConflict(member.path, { ...options, filePath: path });
}

export function unresolveConflict(mono, { filePath }) {
  const { member, path } = findMember(mono, filePath);
  return git.unresolveConflict(member.path, { filePath: path });
}

export async function fetchAll(mono) {
  const results = await forEachMember(mono.members, ({ path }) => git.fetchAll(path));
  return { changed: results.some(({ changed }) => changed) };
}

export async function pull(mono, options) {
  const results = await readStatuses(mono.members);
  // A branch that was never pushed has nothing to pull, which is no reason to fail.
  const tracking = results.filter(({ status }) => status.upstream).map(({ member }) => member);
  if (tracking.length === 0) {
    throw ApiError.gitFailure('None of these branches are on a remote yet.');
  }
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

/**
 * Renames a shared branch in every repository at once, so the mono repo's branches stay
 * named together. Repositories of the group that are left out, being on another branch,
 * are renamed too where they have it. If any one can't be renamed, those already done
 * are put back, so the name is never split between repositories.
 *
 * With `renameRemote`, each repository whose branch tracks a remote branch then renames
 * that too. Those go one by one, as a remote can't be put back as surely as a branch.
 */
export async function renameBranch(mono, { name, newName, renameRemote = false }) {
  const others = await readEach(
    mono.leftOut.filter(({ missing }) => !missing),
    async (repository) => ((await git.hasLocalBranch(repository.path, name)) ? repository : null),
  );
  const renamed = [...mono.members, ...others.filter(Boolean)];
  await allOrNone(
    renamed,
    ({ path }) => git.renameBranch(path, { name, newName }),
    ({ path }) => git.renameBranch(path, { name: newName, newName: name }),
    (member) => `No branch was renamed, because ${member.name} could not rename ${name}.`,
  );
  // The members are found by the branch they are on, which now has its new name.
  if (name === mono.branch) await mono.setBranch(newName);
  if (!renameRemote) return;

  const tracking = await readEach(renamed, async (repository) =>
    (await git.hasLiveUpstream(repository.path, newName)) ? repository : null,
  );
  await forEachMember(
    tracking.filter(Boolean),
    ({ path }) => git.renameUpstream(path, { name: newName }),
    { doneIn: `Renamed ${name} to ${newName} everywhere, and on the remote in` },
  );
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

/**
 * Checks every member before any of them merges, so that a reason not to merge, such as
 * a branch behind its remote or a merge already under way, stops all of them alike
 * rather than leaving some merged and some not.
 */
async function assertMembersCanMerge(mono, branches) {
  const results = await readStatuses(mono.members);
  const busy = results.filter(({ status }) => status.operation);
  if (busy.length > 0) {
    const names = namesOf(busy.map(({ member }) => member));
    throw ApiError.gitFailure(`Finish or abort what is under way in ${names} before merging.`);
  }
  const problems = await readEach(mono.members, async (member) => {
    try {
      await git.assertNotBehind(member.path, branches);
      return null;
    } catch (error) {
      if (error.code !== 'BRANCH_BEHIND') throw error;
      return `${member.name}: ${error.message}`;
    }
  });
  const behind = problems.filter(Boolean);
  if (behind.length > 0) throw ApiError.branchBehind(behind.join('\n'));
}

const MERGE_NEXT_STEP =
  'Fix that, then merge again. Repositories already merged are not affected.';

/** What merging `source` into `target` would do in each member, and in all of them. */
export async function previewMerge(mono, { source, target }) {
  const repositories = await readEach(mono.members, async (member) => ({
    id: member.id,
    name: member.name,
    slot: member.slot,
    ...(await git.previewMerge(member.path, { source, target })),
  }));
  return {
    source,
    target,
    commits: repositories.reduce((total, { commits }) => total + commits, 0),
    fastForward: repositories.every(({ commits, fastForward }) => fastForward || commits === 0),
    repositories,
  };
}

/** Merges `branch` into the mono repo's branch, in every member. */
export async function merge(mono, options) {
  await assertMembersCanMerge(mono, [mono.branch, options.branch]);
  await forEachMember(mono.members, ({ path }) => git.merge(path, options), {
    doneIn: `Merged ${options.branch} into ${mono.branch} in`,
    nextStep: MERGE_NEXT_STEP,
  });
}

/**
 * Merges the mono repo's branch into `target` in every member, leaving them on `target`.
 * The mono repo follows them there. A member that could not switch stays behind on the
 * old branch, and the report says which.
 */
export async function mergeInto(mono, options) {
  await assertMembersCanMerge(mono, [mono.branch, options.target]);
  try {
    await forEachMember(mono.members, ({ path }) => git.mergeInto(path, options), {
      doneIn: `Merged ${mono.branch} into ${options.target} in`,
      nextStep: MERGE_NEXT_STEP,
    });
  } finally {
    const branches = await readEach(mono.members, ({ path }) =>
      git.getCurrentBranch(path).catch(() => null),
    );
    if (branches.includes(options.target)) await mono.setBranch(options.target);
  }
}

/**
 * Rebasing is kept to each repository on its own, as it rewrites history and across a
 * mono repo would do so in several repositories at once.
 */
export async function rebase() {
  throw ApiError.badRequest('Open the repository on its own to rebase.');
}

async function membersInOperation(mono) {
  const results = await readStatuses(mono.members);
  const active = results.filter(({ status }) => status.operation).map(({ member }) => member);
  if (active.length === 0) throw ApiError.gitFailure('There is no merge or rebase in progress.');
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

export async function discardAll(mono) {
  await forEachMember(mono.members, ({ path }) => git.discardAll(path));
}

/** Each file goes in its own repository's .gitignore. */
export async function ignore(mono, { paths, kind }) {
  await onPaths(mono, paths, ({ path }, ownPaths) => git.ignore(path, { paths: ownPaths, kind }));
}

export async function rewordLastCommit() {
  throw ApiError.badRequest('Open the repository on its own to edit a commit message.');
}

/**
 * Commits to every member with something to commit, all with the same message. Whatever
 * can be checked is checked first, so a commit only ever stops halfway on a hook. Then
 * the failed members keep their staged changes, so committing again picks up just those.
 */
export async function commit(mono, { message, amend = false, stageAll = false }) {
  if (amend) throw ApiError.badRequest('Amending is not available across repositories.');

  const results = await readStatuses(mono.members);
  const conflicted = results.filter(({ status }) => status.conflicted.length > 0);
  if (conflicted.length > 0) {
    const names = namesOf(conflicted.map(({ member }) => member));
    throw ApiError.gitFailure(`Resolve the conflicts in ${names} before committing.`);
  }

  const targets = results.filter(
    ({ status }) =>
      status.staged.length > 0 ||
      status.operation === 'merge' ||
      (stageAll && status.unstaged.length > 0),
  );
  if (targets.length === 0) throw ApiError.gitFailure('There is nothing to commit.');

  const needsMessage = targets.some(({ status }) => status.operation !== 'merge');
  if (!message?.trim() && needsMessage) throw ApiError.badRequest('A commit message is required.');

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
  throw ApiError.badRequest('Open the repository on its own to check out a commit.');
}

export async function cherryPick() {
  throw ApiError.badRequest('Open the repository on its own to cherry-pick a commit.');
}

export async function revert() {
  throw ApiError.badRequest('Open the repository on its own to revert a commit.');
}

export async function resetToCommit() {
  throw ApiError.badRequest('Open the repository on its own to reset to a commit.');
}

export async function undoCommit() {
  throw ApiError.badRequest('Open the repository on its own to undo a commit.');
}

/**
 * Stashes are kept to each repository on its own. Across a mono repo, a stash or pop
 * touches several repositories at once, and it is easy to restore one into the wrong place.
 */
export async function getStashes() {
  return [];
}

export async function stashSave() {
  throw ApiError.badRequest('Open the repository on its own to stash changes.');
}

export async function stashApply() {
  throw ApiError.badRequest('Open the repository on its own to apply a stash.');
}

export async function stashPop() {
  throw ApiError.badRequest('Open the repository on its own to restore a stash.');
}

/**
 * Tags are kept to each repository on its own: a name can mean a different commit in each
 * repository, so tagging across a mono repo would be easy to get wrong.
 */
export async function getTags() {
  return [];
}

const tagsNotForMono = () => {
  throw ApiError.badRequest('Open the repository on its own to manage its tags.');
};
export const createTag = tagsNotForMono;
export const pushTag = tagsNotForMono;
export const deleteTag = tagsNotForMono;
export const deleteRemoteTag = tagsNotForMono;
export const getTagRemotes = tagsNotForMono;

/** Each repository has its own reflog, so a mono repo shows none. */
export async function getReflog() {
  return [];
}

/** Each repository has its own working trees, so a mono repo lists none. */
export async function getWorktrees() {
  return [];
}

const notForMono = () => {
  throw ApiError.badRequest('Open the repository on its own to manage its working trees.');
};
export const addWorktree = notForMono;
export const removeWorktree = notForMono;
export const lockWorktree = notForMono;
export const unlockWorktree = notForMono;
export const pruneWorktrees = notForMono;

export async function stashDrop() {
  throw ApiError.badRequest('Open the repository on its own to delete a stash.');
}

export async function getStashDetails() {
  throw ApiError.badRequest('Open the repository on its own to see a stash.');
}

export async function getStashDiff() {
  throw ApiError.badRequest('Open the repository on its own to see a stash.');
}

/** A patch spans one repository's files, so it belongs to that repository's own tab. */
export async function createPatch() {
  throw ApiError.badRequest('Open the repository on its own to create a patch.');
}

export async function applyPatch() {
  throw ApiError.badRequest('Open the repository on its own to apply a patch.');
}
