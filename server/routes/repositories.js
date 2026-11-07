import fs from 'node:fs/promises';
import { Router } from 'express';
import { badRequest, notFound } from '../errors.js';
import * as git from '../git/gitService.js';
import * as mono from '../git/monoService.js';
import { parseRemoteUrl } from '../git/remoteUrl.js';
import { mapWithLimit } from '../utils/mapWithLimit.js';

const DEFAULT_COMMIT_PAGE_SIZE = 100;
const MAX_COMMIT_PAGE_SIZE = 500;
/** How many repositories to run git on at once. */
const GIT_CONCURRENCY = 8;

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(`"${name}" is required.`);
  }
  return value;
}

function requirePaths(paths) {
  const isValid =
    Array.isArray(paths) && paths.length > 0 && paths.every((path) => typeof path === 'string');
  if (!isValid) throw badRequest('"paths" must be a non-empty list of file paths.');
  return paths;
}

function optionalString(value, name) {
  if (value === undefined || value === null) return undefined;
  return requireString(value, name).trim();
}

const optionalPaths = (paths) => (paths === undefined ? undefined : requirePaths(paths));

function requireLines(lines) {
  const isValid = Array.isArray(lines) && lines.length > 0 && lines.every(Number.isInteger);
  if (!isValid) throw badRequest('"lines" must be a non-empty list of line numbers.');
  return lines;
}

function toCount(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const count = Number.parseInt(value, 10);
  return Number.isNaN(count) || count < 0 ? fallback : Math.min(count, max);
}

async function withSummary(repository) {
  if (!repository.path) return { ...repository, available: false, summary: null };
  try {
    return { ...repository, available: true, summary: await git.getSummary(repository.path) };
  } catch {
    // The folder may have been moved or deleted. Keep it listed so it can be unlinked.
    return { ...repository, available: false, summary: null };
  }
}

async function assertDirectory(folderPath) {
  const stats = await fs.stat(folderPath).catch(() => null);
  if (!stats?.isDirectory()) throw badRequest(`${folderPath} is not a folder.`);
}

async function resolveFolder(folderPath) {
  await assertDirectory(folderPath);
  return git.resolveWorkingTree(folderPath);
}

/** Resolves each folder on its own, so one bad folder cannot fail the rest. */
async function resolveFolders(folderPaths) {
  const results = await mapWithLimit(folderPaths, GIT_CONCURRENCY, async (folderPath) => {
    try {
      return { workingTree: await resolveFolder(folderPath.trim()) };
    } catch (error) {
      return { failure: { path: folderPath, message: error.message } };
    }
  });
  return {
    workingTrees: results.flatMap(({ workingTree }) => workingTree ?? []),
    failures: results.flatMap(({ failure }) => failure ?? []),
  };
}

function requireStub(repository) {
  if (repository.path || repository.isMono) {
    throw badRequest(`${repository.name} is already on this machine.`);
  }
  return repository;
}

/** A stub has no folder. Without this guard git would run in the server's own folder. */
function requireWorkingCopy(request, _response, next) {
  if (!request.repository.path && !request.repository.isMono) {
    throw badRequest(`${request.repository.name} has not been cloned or located yet.`);
  }
  next();
}

/**
 * Registers a POST route that runs a git action and replies 204 on success. `run` is
 * given the service and target from the repositoryId param, as either kind of repository
 * has its own.
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
        limit: toCount(limit, DEFAULT_COMMIT_PAGE_SIZE, MAX_COMMIT_PAGE_SIZE),
        skip: toCount(skip, 0),
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
      filePath: requireString(filePath, 'path'),
      originalPath: originalPath || undefined,
      fullFile: fullFile === 'true',
    });
    response.json({ diff });
  });

  router.get('/stashes', async (request, response) => {
    response.json(await request.service.getStashes(request.target));
  });

  router.get('/diff', async (request, response) => {
    const { path: filePath, staged, untracked, fullFile } = request.query;
    const diff = await request.service.getDiff(request.target, {
      filePath: requireString(filePath, 'path'),
      staged: staged === 'true',
      untracked: untracked === 'true',
      fullFile: fullFile === 'true',
    });
    response.json({ diff, hash: git.hashDiff(diff) });
  });

  router.get('/conflict', async (request, response) => {
    const filePath = requireString(request.query.path, 'path');
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

  action(router, '/branches', (service, path, { name, startPoint, switchTo }) =>
    service.createBranch(path, {
      name: requireString(name, 'name'),
      startPoint: startPoint || undefined,
      switchTo: switchTo !== false,
    }),
  );
  action(router, '/fetch', (service, path) => service.fetchAll(path));
  action(router, '/pull', (service, path, { mode }) => service.pull(path, { mode }));
  action(router, '/push', (service, path, { force, remote, upstreamName }) =>
    service.push(path, { force: force === true, remote, upstreamName }),
  );
  action(router, '/checkout', (service, path, { branch, remote }) =>
    service.checkout(path, { branch: requireString(branch, 'branch'), remote: remote === true }),
  );
  action(router, '/merge', (service, path, { branch, noFastForward }) =>
    service.merge(path, {
      branch: requireString(branch, 'branch'),
      noFastForward: noFastForward === true,
    }),
  );
  action(router, '/merge-into', (service, path, { target, noFastForward }) =>
    service.mergeInto(path, {
      target: requireString(target, 'target'),
      noFastForward: noFastForward === true,
    }),
  );
  action(router, '/rebase', (service, path, { branch }) =>
    service.rebase(path, { branch: requireString(branch, 'branch') }),
  );
  action(router, '/operation/abort', (service, path) => service.abortOperation(path));
  action(router, '/operation/continue', (service, path) => service.continueOperation(path));
  action(router, '/stage', (service, path, { paths }) =>
    service.stage(path, { paths: optionalPaths(paths) }),
  );
  action(router, '/unstage', (service, path, { paths }) =>
    service.unstage(path, { paths: optionalPaths(paths) }),
  );
  action(router, '/stage-lines', (service, repoPath, body) =>
    service.stageLines(repoPath, {
      filePath: requireString(body.path, 'path'),
      staged: body.staged === true,
      untracked: body.untracked === true,
      fullFile: body.fullFile === true,
      hash: requireString(body.hash, 'hash'),
      lines: requireLines(body.lines),
    }),
  );
  action(router, '/resolve-conflict', (service, repoPath, { path, content, side, remove }) =>
    service.resolveConflict(repoPath, {
      filePath: requireString(path, 'path'),
      content,
      side: side ?? undefined,
      remove: remove === true,
    }),
  );
  action(router, '/discard',(service, path, { paths }) =>
    service.discard(path, { paths: requirePaths(paths) }),
  );
  action(router, '/commit', (service, path, { message, amend, stageAll }) =>
    service.commit(path, { message, amend: amend === true, stageAll: stageAll === true }),
  );
  action(router, '/undo-commit', (service, path, { hash, allowPushed }) =>
    service.undoCommit(path, {
      hash: requireString(hash, 'hash'),
      allowPushed: allowPushed === true,
    }),
  );
  action(router, '/stash', (service, path, { message }) => service.stashSave(path, { message }));
  action(router, '/stash/apply', (service, path, { ref }) => service.stashApply(path, { ref }));
  action(router, '/stash/pop', (service, path, { ref }) => service.stashPop(path, { ref }));
  action(router, '/stash/drop', (service, path, { ref }) => service.stashDrop(path, { ref }));

  return router;
}

function createGroupsRouter(store) {
  const router = Router();

  router.param('groupId', async (request, _response, next, id) => {
    if (await store.getGroup(id)) next();
    else next(notFound('That group does not exist.'));
  });

  router.get('/', async (_request, response) => {
    response.json(await store.listGroups());
  });

  router.post('/', async (request, response) => {
    const name = requireString(request.body?.name, 'name').trim();
    response.status(201).json(await store.addGroup(name));
  });

  router.patch('/:groupId', async (request, response) => {
    const name = requireString(request.body?.name, 'name').trim();
    response.json(await store.renameGroup(request.params.groupId, name));
  });

  router.post('/:groupId/mono', async (request, response) => {
    const branch = requireString(request.body?.branch, 'branch').trim();
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

  router.param('repositoryId', async (request, _response, next, id) => {
    if (mono.isMonoId(id)) {
      const group = await store.getGroup(mono.groupIdOf(id));
      const target = group && (await mono.resolveMono(store, group));
      if (!target) {
        next(notFound('That group has not been opened as a mono repo.'));
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
      next(notFound('That repository is not linked.'));
      return;
    }
    request.repository = repository;
    request.service = git;
    request.target = repository.path;
    next();
  });

  router.get('/', async (_request, response) => {
    response.json(await mapWithLimit(await store.list(), GIT_CONCURRENCY, withSummary));
  });

  router.post('/', async (request, response) => {
    const workingTree = await resolveFolder(requireString(request.body?.path, 'path').trim());
    response.status(201).json(await withSummary(await store.add(workingTree)));
  });

  router.post('/bulk', async (request, response) => {
    const groupName = optionalString(request.body?.groupName, 'groupName');
    const { workingTrees, failures } = await resolveFolders(requirePaths(request.body?.paths));
    await store.addMany(workingTrees, { groupName });
    response.status(201).json({ linkedCount: new Set(workingTrees).size, failures });
  });

  /** Fetches every linked folder. One failing remote cannot stop the rest. */
  router.post('/fetch', async (_request, response) => {
    const repositories = (await store.list()).filter((repository) => repository.path);
    const results = await mapWithLimit(repositories, GIT_CONCURRENCY, async ({ id, name, path }) => {
      try {
        await git.fetchAll(path);
        return null;
      } catch (error) {
        return { id, name, message: error.message };
      }
    });
    const failures = results.filter(Boolean);
    response.json({ fetchedCount: repositories.length - failures.length, failures });
  });

  router.use('/groups', createGroupsRouter(store));

  router.post('/stubs', async (request, response) => {
    const remote = parseRemoteUrl(requireString(request.body?.url, 'url'));
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

  router.put('/:repositoryId/group', async (request, response) => {
    const groupId = request.body?.groupId ?? null;
    if (groupId !== null && !(await store.getGroup(groupId))) {
      throw notFound('That group does not exist.');
    }
    await store.setGroup(request.repository.id, groupId);
    response.status(204).end();
  });

  router.post('/:repositoryId/clone', async (request, response) => {
    const { id, name, remoteUrl } = requireStub(request.repository);
    const parentPath = requireString(request.body?.parentPath, 'parentPath').trim();
    await assertDirectory(parentPath);
    const workingTree = await git.clone(remoteUrl, parentPath, name);
    response.status(201).json(await withSummary(await store.resolveStub(id, workingTree)));
  });

  router.post('/:repositoryId/locate', async (request, response) => {
    const { id } = requireStub(request.repository);
    const workingTree = await resolveFolder(requireString(request.body?.path, 'path').trim());
    response.json(await withSummary(await store.resolveStub(id, workingTree)));
  });

  router.use('/:repositoryId', requireWorkingCopy, createGitRouter());

  return router;
}
