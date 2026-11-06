import fs from 'node:fs/promises';
import { Router } from 'express';
import { badRequest, notFound } from '../errors.js';
import * as git from '../git/gitService.js';
import { parseRemoteUrl } from '../git/remoteUrl.js';

const DEFAULT_COMMIT_PAGE_SIZE = 100;
const MAX_COMMIT_PAGE_SIZE = 500;

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

function requireStub(repository) {
  if (repository.path) throw badRequest(`${repository.name} is already on this machine.`);
  return repository;
}

/** A stub has no folder. Without this guard git would run in the server's own folder. */
function requireWorkingCopy(request, _response, next) {
  if (!request.repository.path) {
    throw badRequest(`${request.repository.name} has not been cloned or located yet.`);
  }
  next();
}

/** Registers a POST route that runs a git action and replies 204 on success. */
function action(router, route, run) {
  router.post(route, async (request, response) => {
    await run(request.repository.path, request.body ?? {});
    response.status(204).end();
  });
}

function createGitRouter() {
  const router = Router({ mergeParams: true });

  router.get('/status', async (request, response) => {
    response.json(await git.getStatus(request.repository.path));
  });

  router.get('/branches', async (request, response) => {
    response.json(await git.getBranches(request.repository.path));
  });

  router.get('/last-commit', async (request, response) => {
    response.json(await git.getLastCommit(request.repository.path));
  });

  router.get('/pull-requests', async (request, response) => {
    response.json(await git.getPullRequests(request.repository.path));
  });

  router.get('/commits', async (request, response) => {
    const { ref, limit, skip } = request.query;
    response.json(
      await git.getCommits(request.repository.path, {
        // Without a ref, history covers every branch.
        ref: ref || undefined,
        allBranches: !ref,
        limit: toCount(limit, DEFAULT_COMMIT_PAGE_SIZE, MAX_COMMIT_PAGE_SIZE),
        skip: toCount(skip, 0),
      }),
    );
  });

  router.get('/commits/:hash', async (request, response) => {
    response.json(await git.getCommitDetails(request.repository.path, request.params.hash));
  });

  router.get('/commits/:hash/diff', async (request, response) => {
    const { path: filePath, originalPath, fullFile } = request.query;
    const diff = await git.getCommitDiff(request.repository.path, {
      hash: request.params.hash,
      filePath: requireString(filePath, 'path'),
      originalPath: originalPath || undefined,
      fullFile: fullFile === 'true',
    });
    response.json({ diff });
  });

  router.get('/stashes', async (request, response) => {
    response.json(await git.getStashes(request.repository.path));
  });

  router.get('/diff', async (request, response) => {
    const { path: filePath, staged, untracked, fullFile } = request.query;
    const diff = await git.getDiff(request.repository.path, {
      filePath: requireString(filePath, 'path'),
      staged: staged === 'true',
      untracked: untracked === 'true',
      fullFile: fullFile === 'true',
    });
    response.json({ diff, hash: git.hashDiff(diff) });
  });

  router.delete('/branches/:branch', async (request, response) => {
    await git.deleteBranch(request.repository.path, {
      name: request.params.branch,
      force: request.query.force === 'true',
    });
    response.status(204).end();
  });

  router.delete('/remote-branches/:branch', async (request, response) => {
    await git.deleteRemoteBranch(request.repository.path, { name: request.params.branch });
    response.status(204).end();
  });

  router.post('/prune-branches', async (request, response) => {
    const force = request.body?.force === true;
    response.json(await git.pruneGoneBranches(request.repository.path, { force }));
  });

  action(router, '/branches', (path, { name, startPoint, switchTo }) =>
    git.createBranch(path, {
      name: requireString(name, 'name'),
      startPoint: startPoint || undefined,
      switchTo: switchTo !== false,
    }),
  );
  action(router, '/fetch', (path) => git.fetchAll(path));
  action(router, '/pull', (path, { mode }) => git.pull(path, { mode }));
  action(router, '/push', (path, { force }) => git.push(path, { force: force === true }));
  action(router, '/checkout', (path, { branch, remote }) =>
    git.checkout(path, { branch: requireString(branch, 'branch'), remote: remote === true }),
  );
  action(router, '/merge', (path, { branch, noFastForward }) =>
    git.merge(path, {
      branch: requireString(branch, 'branch'),
      noFastForward: noFastForward === true,
    }),
  );
  action(router, '/merge-into', (path, { target, noFastForward }) =>
    git.mergeInto(path, {
      target: requireString(target, 'target'),
      noFastForward: noFastForward === true,
    }),
  );
  action(router, '/rebase', (path, { branch }) =>
    git.rebase(path, { branch: requireString(branch, 'branch') }),
  );
  action(router, '/operation/abort', (path) => git.abortOperation(path));
  action(router, '/operation/continue', (path) => git.continueOperation(path));
  action(router, '/stage', (path, { paths }) => git.stage(path, { paths: optionalPaths(paths) }));
  action(router, '/unstage', (path, { paths }) =>
    git.unstage(path, { paths: optionalPaths(paths) }),
  );
  action(router, '/stage-lines', (repoPath, { path, staged, untracked, fullFile, hash, lines }) =>
    git.stageLines(repoPath, {
      filePath: requireString(path, 'path'),
      staged: staged === true,
      untracked: untracked === true,
      fullFile: fullFile === true,
      hash: requireString(hash, 'hash'),
      lines: requireLines(lines),
    }),
  );
  action(router, '/discard', (path, { paths }) =>
    git.discard(path, { paths: requirePaths(paths) }),
  );
  action(router, '/commit', (path, { message, amend, stageAll }) =>
    git.commit(path, { message, amend: amend === true, stageAll: stageAll === true }),
  );
  action(router, '/undo-commit', (path, { hash, allowPushed }) =>
    git.undoCommit(path, { hash: requireString(hash, 'hash'), allowPushed: allowPushed === true }),
  );
  action(router, '/stash', (path, { message }) => git.stashSave(path, { message }));
  action(router, '/stash/apply', (path, { ref }) => git.stashApply(path, { ref }));
  action(router, '/stash/pop', (path, { ref }) => git.stashPop(path, { ref }));
  action(router, '/stash/drop', (path, { ref }) => git.stashDrop(path, { ref }));

  return router;
}

export function createRepositoriesRouter(store) {
  const router = Router();

  router.param('repositoryId', async (request, _response, next, id) => {
    const repository = await store.get(id);
    if (!repository) {
      next(notFound('That repository is not linked.'));
      return;
    }
    request.repository = repository;
    next();
  });

  router.get('/', async (_request, response) => {
    response.json(await Promise.all((await store.list()).map(withSummary)));
  });

  router.post('/', async (request, response) => {
    const workingTree = await resolveFolder(requireString(request.body?.path, 'path').trim());
    response.status(201).json(await withSummary(await store.add(workingTree)));
  });

  router.post('/stubs', async (request, response) => {
    const remote = parseRemoteUrl(requireString(request.body?.url, 'url'));
    response.status(201).json(await withSummary(await store.addStub(remote)));
  });

  router.get('/:repositoryId', async (request, response) => {
    response.json(await withSummary(request.repository));
  });

  router.delete('/:repositoryId', async (request, response) => {
    await store.remove(request.repository.id);
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
