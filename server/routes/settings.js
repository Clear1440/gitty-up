import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { RepositoryStore } from '../store/repositoryStore.js';
import { ACCESS_LEVELS } from '../mcp/mcpServer.js';
import { mcpUrl } from './mcp.js';
import { FileSystemHelper } from '../utils/FileSystemHelper.js';
import { ValidationHelper } from '../utils/ValidationHelper.js';

const MODES = new Set(['light', 'dark']);
/** What the mode can be set to: one of the modes, or 'system' to follow the OS. */
const MODE_CHOICES = new Set([...MODES, 'system']);
const CUSTOM_COLOR_KEYS = new Set(['bg', 'text', 'primary', 'accent']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCustomColors = (colors) =>
  isPlainObject(colors) &&
  Object.entries(colors).every(
    ([key, color]) => CUSTOM_COLOR_KEYS.has(key) && typeof color === 'string' && HEX_COLOR.test(color),
  );

/** The custom scheme's colors, by mode, or undefined when the field was left out. */
function optionalCustomColors(custom) {
  if (custom === undefined) return undefined;
  const isValid =
    isPlainObject(custom) &&
    Object.entries(custom).every(([mode, colors]) => MODES.has(mode) && isCustomColors(colors));
  if (!isValid) {
    throw ApiError.badRequest(
      '"custom" must map "dark" and "light" to #rrggbb colors for bg, text, primary and accent.',
    );
  }
  return custom;
}

/** The same folder, whatever its casing on Windows. */
function isSameFolder(a, b) {
  const normalize = (folder) => {
    const resolved = path.resolve(folder);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

/** `request` is the one being answered, which says where the MCP server can be reached. */
async function describe(settings, request) {
  const { appearance, mcp } = await settings.get();
  const dataDir = await settings.dataDir();
  return {
    dataDir,
    defaultDataDir: settings.defaultDataDir,
    isDefaultDataDir: isSameFolder(dataDir, settings.defaultDataDir),
    appearance,
    mcp: { ...mcp, url: mcpUrl(request) },
  };
}

function requireDataDir(value) {
  const folder = ValidationHelper.requireTrimmedString(value, 'path');
  if (!path.isAbsolute(folder)) throw ApiError.badRequest('Choose a full path, such as C:\\data.');
  return path.resolve(folder);
}

/**
 * Gets the data into a new folder. Data already there is used as it is, so pointing back
 * at an old folder picks up where it left off. Otherwise the current data is copied
 * over, and the original stays where it was as a backup.
 */
async function moveData(from, to) {
  try {
    await fs.mkdir(to, { recursive: true });
  } catch {
    throw ApiError.badRequest(`Cannot create ${to}.`);
  }
  if (await FileSystemHelper.exists(RepositoryStore.fileIn(to))) return 'existing';
  if (!(await FileSystemHelper.exists(RepositoryStore.fileIn(from)))) return 'fresh';
  try {
    await fs.copyFile(RepositoryStore.fileIn(from), RepositoryStore.fileIn(to));
  } catch {
    throw ApiError.badRequest(`Cannot write to ${to}.`);
  }
  return 'copied';
}

export function createSettingsRouter({ settings, store }) {
  const router = Router();

  router.get('/', async (request, response) => {
    response.json(await describe(settings, request));
  });

  router.put('/appearance', async (request, response) => {
    const scheme = ValidationHelper.requireTrimmedString(request.body.scheme, 'scheme');
    const { mode } = request.body;
    if (!MODE_CHOICES.has(mode)) {
      throw ApiError.badRequest('"mode" must be "light", "dark" or "system".');
    }
    // Kept when another scheme is picked, so going back to custom finds the same colors.
    const custom =
      optionalCustomColors(request.body.custom) ?? (await settings.get()).appearance.custom;

    await settings.update({ appearance: custom ? { scheme, mode, custom } : { scheme, mode } });
    response.json(await describe(settings, request));
  });

  /**
   * Turns the MCP server for AI tools on or off, with `enabled`, and sets what it may do,
   * with `access`. Either can be left out to keep it as it is.
   */
  router.put('/mcp', async (request, response) => {
    const { enabled, access } = request.body;
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      throw ApiError.badRequest('"enabled" must be true or false.');
    }
    if (access !== undefined && !ACCESS_LEVELS.includes(access)) {
      throw ApiError.badRequest('"access" must be "read-only" or "full".');
    }
    const current = (await settings.get()).mcp;
    await settings.update({
      mcp: { ...current, ...(enabled !== undefined && { enabled }), ...(access !== undefined && { access }) },
    });
    response.json(await describe(settings, request));
  });

  /** A `path` of null moves the data back to the default folder. */
  router.put('/data-dir', async (request, response) => {
    const isReset = request.body.path === null;
    const target = isReset ? settings.defaultDataDir : requireDataDir(request.body.path);
    const current = await settings.dataDir();
    if (isSameFolder(target, current)) {
      response.json({ ...(await describe(settings, request)), outcome: 'unchanged' });
      return;
    }

    const outcome = await moveData(current, target);
    store.useDataDir(target);
    await settings.update({ dataDir: isSameFolder(target, settings.defaultDataDir) ? null : target });
    response.json({ ...(await describe(settings, request)), outcome });
  });

  return router;
}
