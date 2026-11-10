import fs from 'node:fs/promises';
import { Router } from 'express';
import { ApiError } from '../errors.js';
import * as git from '../git/gitService.js';
import { MonoIdHelper } from '../git/MonoIdHelper.js';
import * as mono from '../git/monoService.js';
import { parseRemoteUrl } from '../git/remoteUrl.js';
import { GIT_CONCURRENCY } from '../git/runGit.js';
import { describeScript, loadGittyConfig } from '../scripts/gittyConfig.js';
import { runScript } from '../scripts/runScript.js';
import { AsyncHelper } from '../utils/AsyncHelper.js';
import { ValidationHelper } from '../utils/ValidationHelper.js';

const DEFAULT_COMMIT_PAGE_SIZE = 100;
const MAX_COMMIT_PAGE_SIZE = 500;
/** The labels a repository can be colored with. The page picks the shade for each. */
const REPOSITORY_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];

async function assertGroupsExist(store, groupIds) {
  const groups = await store.listGroups();
  if (!groupIds.every((id) => groups.some((group) => group.id === id))) {
    throw ApiError.notFound('That group does not exist.');
  }
}

/** Adds what the repositories page shows about a repository: its branch, changes and so on. */
async function withSummary(repository) {
  const unavailable = { ...repository, available: false, summary: null };
  if (!repository.path) return unavailable;
  try {
    return { ...repository, available: true, summary: await git.getSummary(repository.path) };
  } catch {
    // The folder may have been moved or deleted. Keep it listed so it can be unlinked.
    return unavailable;
  }
}

async function assertDirectory(folderPath) {
  const stats = await fs.stat(folderPath).catch(() => null);
  if (!stats?.isDirectory()) throw ApiError.badRequest(`${folderPath} is not a folder.`);
}

async function resolveFolder(folderPath) {
  await assertDirectory(folderPath);
  return git.resolveWorkingTree(folderPath);
}

/** Resolves each folder on its own, so one bad folder cannot fail the rest. */
async function resolveFolders(folderPaths) {
  const results = await AsyncHelper.mapWithLimit(folderPaths, GIT_CONCURRENCY, async (folder) => {
    try {
      return { workingTree: await resolveFolder(folder.trim()) };
    } catch (error) {
      return { failure: { path: folder, message: error.message } };
    }
  });
  return {
    workingTrees: results.flatMap(({ workingTree }) => workingTree ?? []),
    failures: results.flatMap(({ failure }) => failure ?? []),
  };
}

function requireStub(repository) {
  if (repository.path || repository.isMono) {
    throw ApiError.badRequest(`${repository.name} is already on this machine.`);
  }
  return repository;
}

/** A stub has no folder. Without this guard git would run in the server's own folder. */
function requireWorkingCopy(request, _response, next) {
  if (!request.repository.path && !request.repository.isMono) {
    throw ApiError.badRequest(`${request.repository.name} has not been cloned or located yet.`);
  }
  next();
}

/**
 * Registers a POST route that runs a git action and replies 204 on success. `run` gets
 * the service and target that the repositoryId param chose: gitService and a folder for
 * a repository, or monoService and the mono repo for a group.
 */
function action(router, route, run) {
  router.post(route, async (request, response) => {
    await run(request.service, request.target, request.body ?? {});
    response.status(204).end();
  });
}

function createGitRouter() {
  const router = Router({ mergeParams: true });

  router.get('/status', async (request, response) => {
    response.json(await request.service.getStatus(request.target));
  });

  router.get('/branches', async (request, response) => {
    response.json(await request.service.getBranches(request.target));
  });

  router.get('/remotes', async (request, response) => {
    response.json(await request.service.getRemoteOptions(request.target));
  });

  router.get('/last-commit', async (request, response) => {
    response.json(await request.service.getLastCommit(request.target));
  });

  router.get('/pull-requests', async (request, response) => {
    response.json(await request.service.getPullRequests(request.target));
  });

  router.get('/commits', async (request, response) => {
    const { ref, limit, skip } = request.query;
    response.json(
      await request.service.getCommits(request.target, {
        // Without a ref, history covers every branch.
        ref: ref || undefined,
        allBranches: !ref,
        limit: ValidationHelper.toCount(limit, DEFAULT_COMMIT_PAGE_SIZE, MAX_COMMIT_PAGE_SIZE),
        skip: ValidationHelper.toCount(skip, 0),
      }),
    );
  });

  router.get('/commits/:hash', async (request, response) => {
    response.json(await request.service.getCommitDetails(request.target, request.params.hash));
  });

  router.get('/commits/:hash/diff', async (request, response) => {
    const { path: filePath, originalPath, fullFile } = request.query;
    const diff = await request.service.getCommitDiff(request.target, {
      hash: request.params.hash,
      filePath: ValidationHelper.requireString(filePath, 'path'),
      originalPath: originalPath || undefined,
      fullFile: fullFile === 'true',
    });
    response.json({ diff });
  });

  // Scripts from the repository's .gitty file. A mono repo spans many folders, so has none.
  router.get('/scripts', async (request, response) => {
    if (request.repository.isMono) {
      response.json({ found: false, scripts: [], errors: [] });
      return;
    }
    const { found, scripts, errors } = await loadGittyConfig(request.target);
    response.json({ found, scripts: scripts.map(describeScript), errors });
  });

  router.post('/scripts/run', async (request, response) => {
    if (request.repository.isMono) {
      throw ApiError.badRequest('Scripts are not available in a mono repo.');
    }
    const name = ValidationHelper.requireString(request.body?.name, 'name');
    // Read afresh, so only what .gitty lists right now can run.
    const { scripts } = await loadGittyConfig(request.target);
    const script = scripts.find((candidate) => candidate.name === name);
    if (!script) throw ApiError.notFound(`.gitty has no script named "${name}".`);
    response.json(await runScript(request.target, script));
  });

  router.get('/stashes', async (request, response) => {
    response.json(await request.service.getStashes(request.target));
  });

  router.get('/stashes/:hash', async (request, response) => {
    response.json(await request.service.getStashDetails(request.target, request.params.hash));
  });

  router.get('/stashes/:hash/diff', async (request, response) => {
    const { path: filePath, originalPath, untracked, fullFile } = request.query;
    const diff = await request.service.getStashDiff(request.target, {
      hash: request.params.hash,
      filePath: ValidationHelper.requireString(filePath, 'path'),
      originalPath: originalPath || undefined,
      untracked: untracked === 'true',
      fullFile: fullFile === 'true',
    });
    response.json({ diff });
  });

  // A GET, as making a patch only reads the repository.
  router.get('/patch', async (request, response) => {
    const { source, hash, ref } = request.query;
    response.json(await request.service.createPatch(request.target, { source, hash, ref }));
  });

  router.get('/diff', async (request, response) => {
    const { path: filePath, staged, untracked, fullFile } = request.query;
    const diff = await request.service.getDiff(request.target, {
      filePath: ValidationHelper.requireString(filePath, 'path'),
      staged: staged === 'true',
      untracked: untracked === 'true',
      fullFile: fullFile === 'true',
    });
    response.json({ diff, hash: git.hashDiff(diff) });
  });

  router.get('/conflict', async (request, response) => {
    const filePath = ValidationHelper.requireString(request.query.path, 'path');
    response.json(await request.service.getConflict(request.target, { filePath }));
  });

  router.delete('/branches/:branch', async (request, response) => {
    await request.service.deleteBranch(request.target, {
      name: request.params.branch,
      force: request.query.force === 'true',
      deleteRemote: request.query.deleteRemote === 'true',
    });
    response.status(204).end();
  });

  router.delete('/remote-branches/:branch', async (request, response) => {
    await request.service.deleteRemoteBranch(request.target, { name: request.params.branch });
    response.status(204).end();
  });

  router.post('/prune-branches', async (request, response) => {
    const force = request.body?.force === true;
    response.json(await request.service.pruneGoneBranches(request.target, { force }));
  });

  // Syncing
  action(router, '/fetch', (service, target) => service.fetchAll(target));
  action(router, '/pull', (service, target, { mode }) => service.pull(target, { mode }));
  action(router, '/push', (service, target, { force, remote, upstreamName, toUpstream }) =>
    service.push(target, {
      force: force === true,
      remote,
      upstreamName,
      toUpstream: toUpstream === true,
    }),
  );

  // Branches and commits
  action(router, '/branches', (service, target, { name, startPoint, switchTo }) =>
    service.createBranch(target, {
      name: ValidationHelper.requireString(name, 'name'),
      startPoint: startPoint || undefined,
      switchTo: switchTo !== false,
    }),
  );
  action(router, '/checkout', (service, target, { branch, remote }) =>
    service.checkout(target, {
      branch: ValidationHelper.requireString(branch, 'branch'),
      remote: remote === true,
    }),
  );
  action(router, '/checkout-commit', (service, target, { hash }) =>
    service.checkoutCommit(target, { hash: ValidationHelper.requireString(hash, 'hash') }),
  );
  action(router, '/cherry-pick', (service, target, { hash }) =>
    service.cherryPick(target, { hash: ValidationHelper.requireString(hash, 'hash') }),
  );
  action(router, '/reset', (service, target, { hash, mode }) =>
    service.resetToCommit(target, { hash: ValidationHelper.requireString(hash, 'hash'), mode }),
  );
  action(router, '/merge', (service, target, { branch, noFastForward }) =>
    service.merge(target, {
      branch: ValidationHelper.requireString(branch, 'branch'),
      noFastForward: noFastForward === true,
    }),
  );
  action(router, '/merge-into', (service, target, { target: into, noFastForward }) =>
    service.mergeInto(target, {
      target: ValidationHelper.requireString(into, 'target'),
      noFastForward: noFastForward === true,
    }),
  );
  action(router, '/rebase', (service, target, { branch }) =>
    service.rebase(target, { branch: ValidationHelper.requireString(branch, 'branch') }),
  );
  action(router, '/operation/abort', (service, target) => service.abortOperation(target));
  action(router, '/operation/continue', (service, target) => service.continueOperation(target));

  // Working tree
  action(router, '/stage', (service, target, { paths }) =>
    service.stage(target, { paths: ValidationHelper.optionalPaths(paths) }),
  );
  action(router, '/unstage', (service, target, { paths }) =>
    service.unstage(target, { paths: ValidationHelper.optionalPaths(paths) }),
  );
  action(router, '/stage-lines', (service, target, body) =>
    service.stageLines(target, {
      filePath: ValidationHelper.requireString(body.path, 'path'),
      staged: body.staged === true,
      untracked: body.untracked === true,
      fullFile: body.fullFile === true,
      hash: ValidationHelper.requireString(body.hash, 'hash'),
      lines: ValidationHelper.requireLines(body.lines),
    }),
  );
  action(router, '/resolve-conflict', (service, target, { path, content, side, remove }) =>
    service.resolveConflict(target, {
      filePath: ValidationHelper.requireString(path, 'path'),
      content,
      side: side ?? undefined,
      remove: remove === true,
    }),
  );
  action(router, '/discard', (service, target, { paths }) =>
    service.discard(target, { paths: ValidationHelper.requirePaths(paths) }),
  );
  action(router, '/commit', (service, target, { message, amend, stageAll }) =>
    service.commit(target, { message, amend: amend === true, stageAll: stageAll === true }),
  );
  action(router, '/undo-commit', (service, target, { hash, allowPushed }) =>
    service.undoCommit(target, {
      hash: ValidationHelper.requireString(hash, 'hash'),
      allowPushed: allowPushed === true,
    }),
  );

  // Stashes
  action(router, '/stash', (service, target, { message }) =>
    service.stashSave(target, { message }),
  );
  action(router, '/stash/apply', (service, target, { ref }) => service.stashApply(target, { ref }));
  action(router, '/stash/pop', (service, target, { ref }) => service.stashPop(target, { ref }));
  action(router, '/stash/drop', (service, target, { ref }) => service.stashDrop(target, { ref }));

  // Patches
  action(router, '/patch/apply', (service, target, { patch, mode }) =>
    service.applyPatch(target, {
      patch: ValidationHelper.requireString(patch, 'patch'),
      mode: mode === 'commit' ? 'commit' : 'changes',
    }),
  );

  return router;
}

function createGroupsRouter(store) {
  const router = Router();

  router.param('groupId', async (request, _response, next, id) => {
    if (await store.getGroup(id)) next();
    else next(ApiError.notFound('That group does not exist.'));
  });

  router.get('/', async (_request, response) => {
    response.json(await store.listGroups());
  });

  router.post('/', async (request, response) => {
    const name = ValidationHelper.requireTrimmedString(request.body?.name, 'name');
    response.status(201).json(await store.addGroup(name));
  });

  router.put('/order', async (request, response) => {
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      throw ApiError.badRequest('"ids" must be a list of group ids.');
    }
    response.json(await store.reorderGroups(ids));
  });

  router.patch('/:groupId', async (request, response) => {
    const name = ValidationHelper.requireTrimmedString(request.body?.name, 'name');
    response.json(await store.renameGroup(request.params.groupId, name));
  });

  router.post('/:groupId/mono', async (request, response) => {
    const branch = ValidationHelper.requireTrimmedString(request.body?.branch, 'branch');
    const group = await store.getGroup(request.params.groupId);
    response.json(await mono.openMono(store, group, branch));
  });

  router.delete('/:groupId', async (request, response) => {
    await store.removeGroup(request.params.groupId);
    response.status(204).end();
  });

  return router;
}

export function createRepositoriesRouter(store) {
  const router = Router();

  /** Sets which service handles the request, and what it works on: a folder or a mono repo. */
  router.param('repositoryId', async (request, _response, next, id) => {
    if (MonoIdHelper.isMonoId(id)) {
      const group = await store.getGroup(MonoIdHelper.toGroupId(id));
      const target = group && (await mono.resolveMono(store, group));
      if (!target) {
        next(ApiError.notFound('That group has not been opened as a mono repo.'));
        return;
      }
      request.repository = mono.describeMono(target);
      request.service = mono;
      request.target = target;
      next();
      return;
    }

    const repository = await store.get(id);
    if (!repository) {
      next(ApiError.notFound('That repository is not linked.'));
      return;
    }
    request.repository = repository;
    request.service = git;
    request.target = repository.path;
    next();
  });

  router.get('/', async (_request, response) => {
    const repositories = await store.list();
    response.json(await AsyncHelper.mapWithLimit(repositories, GIT_CONCURRENCY, withSummary));
  });

  router.post('/', async (request, response) => {
    const folder = ValidationHelper.requireTrimmedString(request.body?.path, 'path');
    const workingTree = await resolveFolder(folder);
    response.status(201).json(await withSummary(await store.add(workingTree)));
  });

  router.post('/bulk', async (request, response) => {
    const groupName = ValidationHelper.optionalString(request.body?.groupName, 'groupName');
    const folders = ValidationHelper.requirePaths(request.body?.paths);
    const { workingTrees, failures } = await resolveFolders(folders);
    await store.addMany(workingTrees, { groupName });
    // Two of the folders can be inside the same working tree, which is linked once.
    response.status(201).json({ linkedCount: new Set(workingTrees).size, failures });
  });

  /** Fetches every linked folder. One failing remote cannot stop the rest. */
  router.post('/fetch', async (_request, response) => {
    const repositories = (await store.list()).filter((repository) => repository.path);
    const fetchOne = async ({ id, name, path }) => {
      try {
        await git.fetchAll(path);
        return null;
      } catch (error) {
        return { id, name, message: error.message };
      }
    };
    const results = await AsyncHelper.mapWithLimit(repositories, GIT_CONCURRENCY, fetchOne);
    const failures = results.filter(Boolean);
    response.json({ fetchedCount: repositories.length - failures.length, failures });
  });

  router.use('/groups', createGroupsRouter(store));

  router.post('/stubs', async (request, response) => {
    const remote = parseRemoteUrl(ValidationHelper.requireString(request.body?.url, 'url'));
    response.status(201).json(await withSummary(await store.addStub(remote)));
  });

  router.get('/:repositoryId', async (request, response) => {
    const { repository } = request;
    response.json(repository.isMono ? repository : await withSummary(repository));
  });

  router.delete('/:repositoryId', async (request, response) => {
    await store.remove(request.repository.id);
    response.status(204).end();
  });

  /** Puts a repository in exactly one group, or none when `groupId` is null. */
  router.put('/:repositoryId/group', async (request, response) => {
    const groupId = request.body?.groupId ?? null;
    const groupIds = groupId === null ? [] : [groupId];
    await assertGroupsExist(store, groupIds);
    await store.setGroups(request.repository.id, groupIds);
    response.status(204).end();
  });

  /** Puts a repository in exactly the groups listed. An empty list leaves it ungrouped. */
  router.put('/:repositoryId/groups', async (request, response) => {
    const groupIds = request.body?.groupIds;
    if (!Array.isArray(groupIds) || !groupIds.every((id) => typeof id === 'string')) {
      throw ApiError.badRequest('"groupIds" must be a list of group ids.');
    }
    await assertGroupsExist(store, groupIds);
    await store.setGroups(request.repository.id, groupIds);
    response.status(204).end();
  });

  router.put('/:repositoryId/color', async (request, response) => {
    const color = request.body?.color ?? null;
    if (color !== null && !REPOSITORY_COLORS.includes(color)) {
      throw ApiError.badRequest(`"color" must be one of ${REPOSITORY_COLORS.join(', ')}.`);
    }
    await store.setColor(request.repository.id, color);
    response.status(204).end();
  });

  router.post('/:repositoryId/clone', async (request, response) => {
    const { id, name, remoteUrl } = requireStub(request.repository);
    const parentPath = ValidationHelper.requireTrimmedString(
      request.body?.parentPath,
      'parentPath',
    );
    await assertDirectory(parentPath);
    const workingTree = await git.clone(remoteUrl, parentPath, name);
    response.status(201).json(await withSummary(await store.resolveStub(id, workingTree)));
  });

  router.post('/:repositoryId/locate', async (request, response) => {
    const { id } = requireStub(request.repository);
    const folder = ValidationHelper.requireTrimmedString(request.body?.path, 'path');
    const workingTree = await resolveFolder(folder);
    response.json(await withSummary(await store.resolveStub(id, workingTree)));
  });

  router.use('/:repositoryId', requireWorkingCopy, createGitRouter());

  return router;
}
