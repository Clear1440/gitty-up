import { execFile } from 'node:child_process';
import path from 'node:path';

/**
 * The environment a new terminal would have. An app opened from the Finder, the Dock or
 * a launcher only gets the system's bare environment, without what the user's shell
 * profile adds, such as nvm's node, pyenv's python or a PATH entry from .zshrc. So a
 * script that works in a terminal would fail here with "command not found".
 */

const isWindows = process.platform === 'win32';
const MARKER = '__GITTY_ENV_MARKER__';
const LOAD_TIMEOUT_MS = 10_000;
/** A terminal opened later sees later profile changes, so this is read again now and then. */
const CACHE_MS = 5 * 60_000;

/** Pulls the environment, written as JSON between two markers, out of a shell's output. */
export function parseMarkedEnv(stdout) {
  const start = stdout.indexOf(MARKER);
  const end = stdout.lastIndexOf(MARKER);
  if (start === -1 || end <= start) return null;
  try {
    const env = JSON.parse(stdout.slice(start + MARKER.length, end));
    return env && typeof env === 'object' ? env : null;
  } catch {
    return null;
  }
}

/** Expands %NAME% references as Windows does for the registry's expandable values. */
export function expandWindowsVariables(value, env) {
  return value.replace(/%([^%]+)%/g, (match, name) => {
    const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key === undefined ? match : env[key];
  });
}

/** Joins PATH lists, first come first served, dropping repeats and empty entries. */
export function joinPaths(...lists) {
  const entries = lists.flatMap((list) => (list ?? '').split(path.delimiter)).filter(Boolean);
  const seen = new Set();
  return entries
    .filter((entry) => {
      const key = isWindows ? entry.toLowerCase() : entry;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(path.delimiter);
}

function run(program, args, options) {
  return new Promise((resolve, reject) => {
    execFile(
      program,
      args,
      { timeout: LOAD_TIMEOUT_MS, windowsHide: true, maxBuffer: 10 * 1024 * 1024, ...options },
      (error, stdout) => (error && !stdout ? reject(error) : resolve(stdout)),
    );
  });
}

const quotePosix = (arg) => `'${arg.replaceAll("'", "'\\''")}'`;

/**
 * Runs the user's login shell, interactively so .zshrc and .bashrc load too, and has it
 * print its environment. The printing is done by this very program run as plain node,
 * as `env` output can't tell a newline in a value from the next variable.
 */
async function loadPosixShellEnv() {
  const shell = process.env.SHELL || '/bin/sh';
  const printEnv = `process.stdout.write(${JSON.stringify(MARKER)} + JSON.stringify(process.env) + ${JSON.stringify(MARKER)})`;
  const command = `${quotePosix(process.execPath)} -e ${quotePosix(printEnv)}`;
  const stdout = await run(shell, ['-ilc', command], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      // Keeps oh-my-zsh and friends from stopping to ask about updates.
      DISABLE_AUTO_UPDATE: 'true',
      ZSH_TMUX_AUTOSTARTED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own session, without the terminal the app may have been started from. An
    // interactive shell would otherwise take over that terminal's job control, which can
    // suspend the app's server (SIGTTOU) when run with `npm run dev`.
    detached: true,
  });
  const env = parseMarkedEnv(stdout);
  if (!env) return null;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.DISABLE_AUTO_UPDATE;
  delete env.ZSH_TMUX_AUTOSTARTED;
  return env;
}

/**
 * Windows hands a program the environment of whatever started it, so anything installed
 * since, such as a new PATH entry, is missing until the app restarts. A new terminal
 * reads it afresh from the registry, so this does too.
 */
async function loadWindowsEnv() {
  const script = [
    "$machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')",
    "$user = [Environment]::GetEnvironmentVariable('Path', 'User')",
    `Write-Output ('${MARKER}' + (@{ machine = $machine; user = $user } | ConvertTo-Json -Compress) + '${MARKER}')`,
  ].join('; ');
  const stdout = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  const paths = parseMarkedEnv(stdout);
  if (!paths) return null;
  const expand = (value) => (value ? expandWindowsVariables(value, process.env) : '');
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'Path';
  return { [pathKey]: joinPaths(expand(paths.machine), expand(paths.user), process.env[pathKey]) };
}

let cached = null;

/**
 * The environment for running a script: the app's own, with what a terminal adds on
 * top. Falls back to the app's own environment if the shell can't be read in time.
 */
export async function loadShellEnv() {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const loading = (isWindows ? loadWindowsEnv() : loadPosixShellEnv()).catch(() => null);
    cached = { at: Date.now(), loading };
  }
  const shellEnv = await cached.loading;
  if (!shellEnv) return { ...process.env };

  const pathKey = Object.keys(shellEnv).find((key) => key.toLowerCase() === 'path');
  const merged = { ...process.env, ...shellEnv };
  // The app may have added folders of its own, such as Homebrew's, so those stay too.
  if (pathKey) merged[pathKey] = joinPaths(shellEnv[pathKey], process.env[pathKey]);
  return merged;
}

/** For tests: forgets the loaded environment. */
export function forgetShellEnv() {
  cached = null;
}
