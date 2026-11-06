import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { badRequest } from '../errors.js';

const WINDOWS_DRIVE_LETTERS = 'CDEFGHIJKLMNOPQRSTUVWXYZ';

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

  return router;
}
