import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '../errors.js';
import { runGit } from '../git/runGit.js';
import { FileSystemHelper } from '../utils/FileSystemHelper.js';

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

/**
 * Runs a script from a .gitty file in the repository's folder and resolves with its
 * exit code and output, whether or not it succeeded. A `command` runs through the
 * system shell, as it would typed into a terminal; a `path` runs that file.
 */
export async function runScript(repoPath, script) {
  let program;
  let args;
  if (script.command) {
    program = [script.command, ...script.args].join(' ');
    args = [];
  } else {
    const stats = await fs.stat(script.path).catch(() => null);
    if (!stats?.isFile()) throw ApiError.badRequest(`${script.path} does not exist.`);
    const [interpreter, interpreterArgs] = await interpreterFor(script.path);
    program = interpreter;
    args = [...interpreterArgs, ...script.args];
  }

  const startedAt = Date.now();
  const output = collectOutput();

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: repoPath,
      shell: Boolean(script.command),
      timeout: SCRIPT_TIMEOUT_MS,
      windowsHide: true,
      env: { ...process.env, GITTY_REPO_PATH: repoPath, GITTY_SCRIPT_NAME: script.name },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8').on('data', output.append);
    child.stderr.setEncoding('utf8').on('data', output.append);
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(ApiError.badRequest(`Could not start ${program}. Is it installed and on the PATH?`));
      } else {
        reject(error);
      }
    });
    child.on('close', (code, signal) => {
      if (signal) output.append(`\nStopped by ${signal}${child.killed ? ' after timing out' : ''}.`);
      resolve(code ?? 1);
    });
  });

  return { exitCode, output: output.text(), durationMs: Date.now() - startedAt };
}
