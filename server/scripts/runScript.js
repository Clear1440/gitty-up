import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
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
async function commandLauncher({ commands, shell, args }) {
  switch (shell) {
    case 'bash':
    case 'sh': {
      // There is rarely an sh on Windows, but Git for Windows' bash runs sh scripts.
      const program = shell === 'bash' || isWindows ? await findBash() : 'sh';
      const text = ['set -e', ...withArgs(commands, args, quotePosix)].join('\n');
      return { program, args: ['-c', text] };
    }
    case 'powershell':
    case 'pwsh': {
      const program = shell === 'powershell' && isWindows ? 'powershell.exe' : 'pwsh';
      const { file, cleanup } = await writePowerShellFile(withArgs(commands, args, quotePowerShell));
      return {
        program,
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
        cleanup,
      };
    }
    case 'cmd':
      if (!isWindows) throw ApiError.badRequest('The cmd shell is only on Windows.');
      return { program: withArgs(commands, args, quoteCmd).join(' && '), args: [], shell: true };
    default:
      // The system shell: cmd on Windows, sh elsewhere. Both understand &&.
      return {
        program: withArgs(commands, args, isWindows ? quoteCmd : quotePosix).join(' && '),
        args: [],
        shell: true,
      };
  }
}

/** How to run a script file, picked by its extension. */
async function fileLauncher(script) {
  const stats = await fs.stat(script.path).catch(() => null);
  if (!stats?.isFile()) throw ApiError.badRequest(`${script.path} does not exist.`);
  const [program, interpreterArgs] = await interpreterFor(script.path);
  return { program, args: [...interpreterArgs, ...script.args] };
}

/**
 * Runs a script from a .gitty file in the repository's folder and resolves with its
 * exit code and output, whether or not it succeeded. A `command` runs in the shell it
 * names, or the system shell, as it would typed into a terminal; a `path` runs that file.
 */
export async function runScript(repoPath, script) {
  const launcher = script.commands ? await commandLauncher(script) : await fileLauncher(script);
  try {
    return await launch(repoPath, script, launcher);
  } finally {
    await launcher.cleanup?.();
  }
}

async function launch(repoPath, script, { program, args, shell = false }) {
  const startedAt = Date.now();
  const output = collectOutput();

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: repoPath,
      shell,
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
