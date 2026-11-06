import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { badRequest } from '../errors.js';

const WINDOWS_DRIVE_LETTERS = 'CDEFGHIJKLMNOPQRSTUVWXYZ';

/** How far below the chosen folder a scan looks for repositories. */
const MAX_SCAN_DEPTH = 6;
/** Keeps a scan of a very large folder, such as a whole drive, from running for minutes. */
const MAX_SCANNED_FOLDERS = 20_000;
/** Folders of installed packages, which can hold repositories nobody would want listed. */
const SKIPPED_FOLDERS = new Set(['node_modules', 'bower_components', 'vendor']);

async function isAccessible(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function listRoots() {
  if (process.platform !== 'win32') return ['/'];
  const drives = [...WINDOWS_DRIVE_LETTERS].map((letter) => `${letter}:\\`);
  const available = await Promise.all(drives.map(isAccessible));
  return drives.filter((_, index) => available[index]);
}

function requireFolderPath(folderPath) {
  if (typeof folderPath !== 'string' || !folderPath.trim()) {
    throw badRequest('"path" is required.');
  }
  return folderPath;
}

async function assertReadable(directory) {
  try {
    await fs.readdir(directory);
  } catch {
    throw badRequest(`Cannot read ${directory}.`);
  }
}

async function listDirectories(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    throw badRequest(`Cannot read ${directory}.`);
  }
  const visible = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return Promise.all(
    visible.map(async ({ name }) => {
      const fullPath = path.join(directory, name);
      return {
        name,
        path: fullPath,
        isRepository: await isAccessible(path.join(fullPath, '.git')),
      };
    }),
  );
}

async function readSubfolders(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_FOLDERS.has(entry.name),
    )
    .map((entry) => path.join(directory, entry.name));
}

/**
 * Finds every repository in a folder, nested ones included, one level at a time
 * so that a scan cut short still has the repositories nearest the top.
 * Symbolic links and junctions are not followed, so a scan cannot loop.
 */
async function findRepositories(root) {
  const found = [];
  let level = [root];
  let scannedCount = 0;

  for (let depth = 0; depth <= MAX_SCAN_DEPTH && level.length > 0; depth += 1) {
    scannedCount += level.length;
    if (scannedCount > MAX_SCANNED_FOLDERS) return { found, truncated: true };

    const isRepository = await Promise.all(
      level.map((directory) => isAccessible(path.join(directory, '.git'))),
    );
    found.push(...level.filter((_, index) => isRepository[index]));
    level = (await Promise.all(level.map(readSubfolders))).flat();
  }
  return { found, truncated: false };
}

export function createFilesystemRouter() {
  const router = Router();

  router.get('/directories', async (request, response) => {
    const directory = path.resolve(request.query.path || os.homedir());
    const parent = path.dirname(directory);
    const [directories, roots] = await Promise.all([listDirectories(directory), listRoots()]);
    response.json({
      path: directory,
      parent: parent === directory ? null : parent,
      directories,
      roots,
    });
  });

  router.get('/repositories', async (request, response) => {
    const root = path.resolve(requireFolderPath(request.query.path));
    await assertReadable(root);
    const { found, truncated } = await findRepositories(root);
    response.json({
      path: root,
      name: path.basename(root),
      truncated,
      repositories: found
        .map((repositoryPath) => ({
          name: path.basename(repositoryPath),
          path: repositoryPath,
          relativePath: path.relative(root, repositoryPath) || '.',
        }))
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    });
  });

  return router;
}
