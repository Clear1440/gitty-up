import fs from 'node:fs/promises';
import path from 'node:path';

/** The file, at the top of a working tree, that turns on scripts for that repository. */
export const GITTY_FILE = '.gitty';

/** How many `extends` links deep a config may go, so a long or looping chain still stops. */
const MAX_DEPTH = 8;
const REMOTE_TIMEOUT_MS = 5_000;
/** Shared configs over HTTP are reread at most this often, as every git action rereads .gitty. */
const REMOTE_CACHE_MS = 60_000;
const MAX_REMOTE_BYTES = 1024 * 1024;

const remoteCache = new Map();

const isUrl = (location) => /^https?:\/\//i.test(location);

/** Where `link` points, read from the config at `from`: relative to its folder or URL. */
function resolveLink(link, from) {
  if (isUrl(link)) return link;
  if (isUrl(from)) return new URL(link, from).href;
  return path.resolve(path.dirname(from), link);
}

async function readRemote(url) {
  const cached = remoteCache.get(url);
  if (cached && Date.now() - cached.at < REMOTE_CACHE_MS) return cached.text;

  const response = await fetch(url, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_REMOTE_BYTES) throw new Error(`${url} is too large to be a .gitty file.`);
  remoteCache.set(url, { at: Date.now(), text });
  return text;
}

async function readConfigText(location) {
  if (isUrl(location)) return readRemote(location);
  return fs.readFile(location, 'utf8');
}

function parseConfig(text, location) {
  let config;
  try {
    // A UTF-8 byte order mark, as some Windows editors write, is not valid JSON.
    config = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    throw new Error(`${location} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`${location} must hold a JSON object.`);
  }
  return config;
}

function toList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Turns one entry of a config's `scripts` into a script, or throws to say what is wrong.
 * An entry is a path to a script file, or an object with a `path` or a `command`.
 * Paths are relative to the config that lists them. A shared config fetched over HTTP has
 * no folder of its own, so its paths are relative to the repository instead.
 */
function toScript(entry, { location, repoPath, fallbackName }) {
  const spec = typeof entry === 'string' ? { path: entry } : entry;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new Error('Each script must be a path or an object.');
  }

  const hasPath = typeof spec.path === 'string' && spec.path.trim();
  const hasCommand = typeof spec.command === 'string' && spec.command.trim();
  if (Boolean(hasPath) === Boolean(hasCommand)) {
    throw new Error('Each script needs either a "path" or a "command", not both.');
  }
  if (spec.args !== undefined && !(Array.isArray(spec.args) && spec.args.every((arg) => typeof arg === 'string'))) {
    throw new Error('A script\'s "args" must be a list of strings.');
  }

  const base = isUrl(location) ? path.join(repoPath, GITTY_FILE) : location;
  const scriptPath = hasPath ? path.resolve(path.dirname(base), spec.path.trim()) : undefined;
  const name =
    (typeof spec.name === 'string' && spec.name.trim()) ||
    fallbackName ||
    (scriptPath ? path.basename(scriptPath) : spec.command.trim());

  return {
    name,
    description: typeof spec.description === 'string' ? spec.description : undefined,
    path: scriptPath,
    command: hasCommand ? spec.command.trim() : undefined,
    args: spec.args ?? [],
    source: location,
  };
}

/** A config's scripts as a list, whether it wrote them as a list or as a name-to-script map. */
function scriptEntries(scripts) {
  if (scripts === undefined || scripts === null) return [];
  if (Array.isArray(scripts)) return scripts.map((entry) => ({ entry }));
  if (typeof scripts === 'object') {
    return Object.entries(scripts).map(([fallbackName, entry]) => ({ entry, fallbackName }));
  }
  throw new Error('"scripts" must be a list or an object.');
}

/**
 * Reads the config at `location` and everything it extends. Shared configs come first,
 * so a script here replaces an inherited one of the same name. Problems are collected in
 * `errors` rather than thrown: one broken shared config should not hide the rest.
 */
async function loadConfig(location, { repoPath, errors, chain, depth }) {
  if (chain.includes(location)) {
    errors.push(`${location} extends itself through ${chain.at(-1)}.`);
    return [];
  }
  if (depth > MAX_DEPTH) {
    errors.push(`Stopped following "extends" after ${MAX_DEPTH} levels, at ${location}.`);
    return [];
  }

  let config;
  try {
    config = parseConfig(await readConfigText(location), location);
  } catch (error) {
    const reason = error.code === 'ENOENT' ? `${location} does not exist.` : error.message;
    errors.push(depth === 0 ? reason : `Could not load shared config: ${reason}`);
    return [];
  }

  const scripts = new Map();
  const add = (script) => {
    // Deleting first moves an override to where the overriding config lists it.
    scripts.delete(script.name);
    scripts.set(script.name, script);
  };

  for (const link of toList(config.extends)) {
    if (typeof link !== 'string' || !link.trim()) {
      errors.push(`${location}: each "extends" entry must be a path or URL.`);
      continue;
    }
    const inherited = await loadConfig(resolveLink(link.trim(), location), {
      repoPath,
      errors,
      chain: [...chain, location],
      depth: depth + 1,
    });
    inherited.forEach(add);
  }

  let entries = [];
  try {
    entries = scriptEntries(config.scripts);
  } catch (error) {
    errors.push(`${location}: ${error.message}`);
  }
  for (const { entry, fallbackName } of entries) {
    try {
      add(toScript(entry, { location, repoPath, fallbackName }));
    } catch (error) {
      errors.push(`${location}: ${error.message}`);
    }
  }

  return [...scripts.values()];
}

/**
 * The scripts a repository's .gitty file offers, with every shared config it extends
 * merged in. Resolves `{ found: false }` when the repository has no .gitty file.
 */
export async function loadGittyConfig(repoPath) {
  const location = path.join(repoPath, GITTY_FILE);
  const stats = await fs.stat(location).catch(() => null);
  if (!stats?.isFile()) return { found: false, scripts: [], errors: [] };

  const errors = [];
  const scripts = await loadConfig(location, { repoPath, errors, chain: [], depth: 0 });
  return { found: true, scripts, errors };
}

/** What the client is shown of a script: enough to list it and say what it runs. */
export function describeScript({ name, description, path: scriptPath, command, args, source }) {
  return {
    name,
    description,
    runs: [command ?? scriptPath, ...args].join(' '),
    source,
  };
}
