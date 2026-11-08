import { execFile } from 'node:child_process';
import { ApiError } from '../errors.js';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const LOCAL_TIMEOUT_MS = 60_000;
export const NETWORK_TIMEOUT_MS = 10 * 60_000;

/** How many git commands to run at once when working across many repositories. */
export const GIT_CONCURRENCY = 8;

const GIT_ENV = {
  // There is no terminal to answer on, so fail fast instead of hanging.
  GIT_TERMINAL_PROMPT: '0',
  GIT_EDITOR: 'true',
  GIT_MERGE_AUTOEDIT: 'no',
  // Background reads must not fight with writes over index.lock.
  GIT_OPTIONAL_LOCKS: '0',
  // Keep git's output stable regardless of the user's locale.
  LC_ALL: 'C',
};

/**
 * Runs git without a shell and resolves with stdout.
 * Exit codes outside `allowedExitCodes` reject with an ApiError.
 * `input` is written to the command's stdin, and `env` adds to its environment.
 */
export function runGit(
  cwd,
  args,
  { timeout = LOCAL_TIMEOUT_MS, allowedExitCodes = [0], input, env } = {},
) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        timeout,
        env: { ...process.env, ...GIT_ENV, ...env },
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const exitCode = error ? error.code : 0;
        if (allowedExitCodes.includes(exitCode)) {
          resolve(stdout);
          return;
        }
        reject(toGitFailure(error, args, stdout, stderr));
      },
    );
    // Git can exit before reading everything, and the exit code explains why.
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/**
 * Runs a git command that takes file paths, treating them as names, never patterns.
 * This must stay per-command: set globally it breaks git's own internal pathspecs,
 * such as the `:/` that `git stash --include-untracked` uses to clean up.
 */
export function runGitOnPaths(cwd, args, options) {
  return runGit(cwd, ['--literal-pathspecs', ...args], options);
}

function toGitFailure(error, args, stdout, stderr) {
  if (error.code === 'ENOENT') {
    return ApiError.gitFailure('Git is not installed or not on the PATH.');
  }
  if (error.killed) {
    return ApiError.gitFailure(`git ${args[0]} timed out.`);
  }
  // Merge conflicts report on stdout, most other failures on stderr.
  const output = [stderr, stdout].map((text) => text.trim()).filter(Boolean);
  return ApiError.gitFailure(output[0] ?? `git ${args[0]} failed.`, output.join('\n'));
}
