import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from '../errors.js';
import { runGit } from '../git/runGit.js';
import { FileSystemHelper } from '../utils/FileSystemHelper.js';
import { fillArgs, fillCommand, resolveParams } from './scriptParams.js';
import { loadShellEnv } from './shellEnv.js';

const SCRIPT_TIMEOUT_MS = 10 * 60_000;
/** Only the end of a long output is kept, as that is where a failure explains itself. */
const MAX_OUTPUT_CHARS = 200_000;

const isWindows = process.platform === 'win32';

/**
 * Git for Windows ships bash, but seldom puts it on the PATH.
 * Its git-core folder is mingw64/libexec/git-core, three levels under the install.
 */
async function findBash() {
  if (!isWindows) return 'bash';
  try {
    const execPath = (await runGit(process.cwd(), ['--exec-path'])).trim();
    const bash = path.resolve(execPath, '..', '..', '..', 'bin', 'bash.exe');
    if (await FileSystemHelper.exists(bash)) return bash;
  } catch {
    // Fall back to whatever bash the PATH has.
  }
  return 'bash';
}

/** The program that runs a script file, picked by its extension, and its arguments. */
async function interpreterFor(scriptPath) {
  switch (path.extname(scriptPath).toLowerCase()) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return ['node', [scriptPath]];
    case '.ps1':
      return [
        isWindows ? 'powershell.exe' : 'pwsh',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      ];
    case '.sh':
      return [await findBash(), [scriptPath]];
    case '.py':
      return [isWindows ? 'python' : 'python3', [scriptPath]];
    case '.cmd':
    case '.bat':
      return ['cmd.exe', ['/d', '/c', scriptPath]];
    default:
      return [scriptPath, []];
  }
}

function collectOutput() {
  let output = '';
  let truncated = false;
  return {
    append(chunk) {
      output += chunk;
      if (output.length > MAX_OUTPUT_CHARS) {
        output = output.slice(-MAX_OUTPUT_CHARS);
        truncated = true;
      }
    },
    text: () => (truncated ? `…earlier output cut…\n${output}` : output),
  };
}

/** Quotes `args` for a shell and adds them to the end of the last command line. */
function withArgs(commands, args, quote) {
  if (args.length === 0) return commands;
  const last = [commands.at(-1), ...args.map(quote)].join(' ');
  return [...commands.slice(0, -1), last];
}

const quotePosix = (arg) => `'${arg.replaceAll("'", "'\\''")}'`;
const quotePowerShell = (arg) => `'${arg.replaceAll("'", "''")}'`;
const quoteCmd = (arg) => `"${arg.replaceAll('"', '""')}"`;

/**
 * PowerShell lines go in a temporary .ps1 file: given them on its command line instead,
 * it reports errors as XML rather than text whenever its output is captured.
 */
async function writePowerShellFile(lines) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-script-'));
  const file = path.join(folder, 'script.ps1');
  const text = lines
    .map((line) => `${line}\nif (-not $?) { exit $(if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }) }`)
    .join('\n');
  // Windows PowerShell reads a file without a byte order mark in the ANSI code page.
  const byteOrderMark = String.fromCharCode(0xfeff);
  await fs.writeFile(file, [byteOrderMark, text, '\n'].join(''), 'utf8');
  return { file, cleanup: () => fs.rm(folder, { recursive: true, force: true }) };
}

/**
 * How to run a `command`: its program and args, whether it goes through the system shell,
 * and what to tidy up afterwards. Each shell stops at the first line that fails, as `&&`
 * would between them, and exits with that line's exit code.
 */
async function commandLauncher({ commands, shell, args }, texts) {
  const lines = (quote) =>
    withArgs(
      commands.map((line) => fillCommand(line, texts, quote)),
      fillArgs(args, texts),
      quote,
    );
  switch (shell) {
    case 'bash':
    case 'sh': {
      // There is rarely an sh on Windows, but Git for Windows' bash runs sh scripts.
      const program = shell === 'bash' || isWindows ? await findBash() : 'sh';
      const text = ['set -e', ...lines(quotePosix)].join('\n');
      return { program, args: ['-c', text] };
    }
    case 'powershell':
    case 'pwsh': {
      const program = shell === 'powershell' && isWindows ? 'powershell.exe' : 'pwsh';
      const { file, cleanup } = await writePowerShellFile(lines(quotePowerShell));
      return {
        program,
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
        cleanup,
      };
    }
    case 'cmd':
      if (!isWindows) throw ApiError.badRequest('The cmd shell is only on Windows.');
      return { program: lines(quoteCmd).join(' && '), args: [], shell: true };
    default:
      // The system shell: cmd on Windows, sh elsewhere. Both understand &&.
      return {
        program: lines(isWindows ? quoteCmd : quotePosix).join(' && '),
        args: [],
        shell: true,
      };
  }
}

/** How to run a script file, picked by its extension. */
async function fileLauncher(script, texts) {
  const stats = await fs.stat(script.path).catch(() => null);
  if (!stats?.isFile()) throw ApiError.badRequest(`${script.path} does not exist.`);
  const [program, interpreterArgs] = await interpreterFor(script.path);
  return { program, args: [...interpreterArgs, ...fillArgs(script.args, texts)] };
}

/**
 * Ends a script and whatever it started. Killing just the shell would leave the program
 * it runs, such as a build, going on without anyone to read its output.
 */
function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      .on('error', () => child.kill());
    return;
  }
  // The script leads its own process group, so a negative pid reaches all of it.
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  };
  signalGroup('SIGTERM');
  // A script that ignores SIGTERM is stopped for certain shortly after.
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) signalGroup('SIGKILL');
  }, 5_000).unref();
}

/**
 * One run of a script. Its output is kept, so a console that opens later can show it all,
 * and is sent on as it comes as 'output' events. 'end' follows once the script exits.
 */
class ScriptRun extends EventEmitter {
  constructor({ repoPath, name, values }) {
    super();
    // Each open console listens, and there is no telling how many there are.
    this.setMaxListeners(0);
    this.id = randomUUID();
    this.repoPath = repoPath;
    this.name = name;
    this.values = values;
    this.status = 'running';
    this.exitCode = null;
    this.stopReason = null;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.output = collectOutput();
    this.done = new Promise((resolve) => this.once('end', resolve));
  }

  append = (text) => {
    this.output.append(text);
    this.emit('output', text);
  };

  /** What a client is told about the run, without its output. */
  summary() {
    return {
      id: this.id,
      name: this.name,
      params: this.values,
      status: this.status,
      exitCode: this.exitCode,
      stopReason: this.stopReason,
      startedAt: new Date(this.startedAt).toISOString(),
      durationMs: (this.endedAt ?? Date.now()) - this.startedAt,
    };
  }

  /** Stops the script. `reason` is 'stopped' when asked to, or 'timeout'. */
  stop(reason = 'stopped') {
    if (this.status !== 'running' || !this.child) return;
    this.stopReason ??= reason;
    killTree(this.child);
  }

  finish(exitCode) {
    if (this.status !== 'running') return;
    if (this.stopReason === 'timeout') this.append(`\nStopped after ${SCRIPT_TIMEOUT_MS / 60_000} minutes.\n`);
    else if (this.stopReason) this.append('\nStopped.\n');
    this.status = 'finished';
    this.exitCode = exitCode;
    this.endedAt = Date.now();
    this.emit('end', this.summary());
  }
}

/** Recent runs by id, so a console can attach to one that is running or just ended. */
const runs = new Map();
const MAX_KEPT_RUNS = 20;

function keep(run) {
  runs.set(run.id, run);
  for (const [id, old] of runs) {
    if (runs.size <= MAX_KEPT_RUNS) break;
    if (old.status !== 'running') runs.delete(id);
  }
}

/** A run started in `repoPath`, or undefined once it has been forgotten. */
export function findRun(repoPath, id) {
  const run = runs.get(id);
  return run?.repoPath === repoPath ? run : undefined;
}

/**
 * Starts a script from a .gitty file in the repository's folder, with `paramInput` as the
 * answers to its parameters, and resolves with the run once the script has started. A
 * `command` runs in the shell it names, or the system shell, as it would typed into a
 * terminal; a `path` runs that file.
 */
export async function startScript(repoPath, script, paramInput) {
  const { texts, env: paramEnv, values } = resolveParams(script.params ?? [], paramInput);
  const launcher = script.commands
    ? await commandLauncher(script, texts)
    : await fileLauncher(script, texts);
  const run = new ScriptRun({ repoPath, name: script.name, values });
  try {
    await launch(run, launcher, paramEnv);
  } catch (error) {
    await launcher.cleanup?.();
    throw error;
  }
  run.done.then(() => launcher.cleanup?.()).catch(() => {});
  keep(run);
  return run;
}

/** Runs a script to the end and resolves with its exit code and output. */
export async function runScript(repoPath, script, paramInput) {
  const run = await startScript(repoPath, script, paramInput);
  const { exitCode, durationMs } = await run.done;
  return { exitCode, output: run.output.text(), durationMs };
}

/** Starts the run's process, resolving once it is going and rejecting if it can't start. */
async function launch(run, { program, args, shell = false }, paramEnv) {
  // What a new terminal would have, so tools set up in the shell profile are found.
  const env = await loadShellEnv();

  const child = spawn(program, args, {
    cwd: run.repoPath,
    shell,
    // Its own process group, so stopping it reaches everything it started. Windows has
    // no groups, and a detached process there would open a console window.
    detached: !isWindows,
    windowsHide: true,
    env: { ...env, ...paramEnv, GITTY_REPO_PATH: run.repoPath, GITTY_SCRIPT_NAME: run.name },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  run.child = child;

  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(ApiError.badRequest(`Could not start ${program}. Is it installed and on the PATH?`));
      } else {
        reject(error);
      }
    });
  });

  child.stdout.setEncoding('utf8').on('data', run.append);
  child.stderr.setEncoding('utf8').on('data', run.append);
  child.on('error', (error) => run.append(`\n${error.message}\n`));
  const timer = setTimeout(() => run.stop('timeout'), SCRIPT_TIMEOUT_MS);
  child.on('close', (code) => {
    clearTimeout(timer);
    run.finish(code ?? 1);
  });
}
