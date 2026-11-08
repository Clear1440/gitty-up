import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { FileSystemHelper } from '../utils/FileSystemHelper.js';
import { ValidationHelper } from '../utils/ValidationHelper.js';

const WINDOWS_DRIVE_LETTERS = 'CDEFGHIJKLMNOPQRSTUVWXYZ';

/** How far below the chosen folder a scan looks for repositories. */
const MAX_SCAN_DEPTH = 6;
/** Keeps a scan of a very large folder, such as a whole drive, from running for minutes. */
const MAX_SCANNED_FOLDERS = 20_000;
/** Folders of installed packages, which can hold repositories nobody would want listed. */
const SKIPPED_FOLDERS = new Set(['node_modules', 'bower_components', 'vendor']);

const isVisibleFolder = (entry) => entry.isDirectory() && !entry.name.startsWith('.');

async function listRoots() {
  if (process.platform !== 'win32') return ['/'];
  const drives = [...WINDOWS_DRIVE_LETTERS].map((letter) => `${letter}:\\`);
  const available = await Promise.all(drives.map(FileSystemHelper.exists));
  return drives.filter((_, index) => available[index]);
}

/** A folder's entries, or a 400 if the folder can't be read. */
async function readEntries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    throw ApiError.badRequest(`Cannot read ${directory}.`);
  }
}

async function listDirectories(directory) {
  const entries = await readEntries(directory);
  const visible = entries
    .filter(isVisibleFolder)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return Promise.all(
    visible.map(async ({ name }) => {
      const fullPath = path.join(directory, name);
      return { name, path: fullPath, isRepository: await FileSystemHelper.isRepository(fullPath) };
    }),
  );
}

/** The folders a scan goes into next. Unreadable ones are skipped rather than failing it. */
async function readSubfolders(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => isVisibleFolder(entry) && !SKIPPED_FOLDERS.has(entry.name))
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

    const isRepository = await Promise.all(level.map(FileSystemHelper.isRepository));
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
    const root = path.resolve(ValidationHelper.requireString(request.query.path, 'path'));
    // Fails with a clear message now, rather than finding nothing later.
    await readEntries(root);
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
