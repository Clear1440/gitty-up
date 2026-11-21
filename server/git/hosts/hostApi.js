import { runGit } from '../runGit.js';

const REQUEST_TIMEOUT_MS = 10_000;
const CREDENTIAL_TIMEOUT_MS = 10_000;

/** A host's API answered with an error status. `body` is its answer, read as JSON if it was. */
export class HostRequestError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}`);
    this.name = 'HostRequestError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Calls a host's API and resolves with its JSON answer. An error status rejects with a
 * HostRequestError, whose message names only the status: never a header or token.
 */
export async function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'gitty-up',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON, such as an HTML error page. The status says enough.
  }
  if (!response.ok) throw new HostRequestError(response.status, data);
  return data;
}

/**
 * What to call a host with, as `{ token, username, fromEnvironment }`, or null to go
 * without, which only reaches public repositories. The first of `envNames` that is set
 * wins. Failing that, this asks git for what it would push to `host` with. Nobody is
 * there to answer a sign-in window, so the credential manager must never open one.
 */
export async function findCredential(repoPath, { host, envNames }) {
  for (const name of envNames) {
    const token = process.env[name];
    if (token) return { token, username: null, fromEnvironment: true };
  }

  try {
    const output = await runGit(repoPath, ['credential', 'fill'], {
      input: `protocol=https\nhost=${host}\n\n`,
      timeout: CREDENTIAL_TIMEOUT_MS,
      env: { GCM_INTERACTIVE: 'never' },
    });
    const field = (key) => new RegExp(`^${key}=(.+)$`, 'm').exec(output)?.[1].trim() || null;
    const token = field('password');
    return token ? { token, username: field('username'), fromEnvironment: false } : null;
  } catch {
    return null;
  }
}

/**
 * The repository path in a remote URL on `domain`, without `.git`, or null when the URL
 * is on another host. Takes https://domain/path, ssh://user@domain/path and
 * user@domain:path. The domain must be followed by `/` or `:`, so a look-alike such as
 * domain.evil.example never matches.
 */
export function matchRemotePath(url, domain) {
  const host = domain.replaceAll('.', '\\.');
  const pattern = new RegExp(
    `^(?:https://(?:[^@/]+@)?${host}(?::443)?/|ssh://(?:[^@/]+@)?${host}(?::\\d+)?/|[\\w.-]+@${host}:/?)(.+?)(?:\\.git)?/?$`,
    'i',
  );
  return pattern.exec(typeof url === 'string' ? url.trim() : '')?.[1] ?? null;
}

const SEGMENT = /^[\w.-]+$/;

/**
 * Splits a repository path into its parts, or null unless it has between `min` and `max`
 * of them, each a plain name. A part such as `..` would point the API somewhere else.
 */
export function splitRepositoryPath(path, { min, max }) {
  if (!path) return null;
  const parts = path.split('/');
  const isValid =
    parts.length >= min &&
    parts.length <= max &&
    parts.every((part) => SEGMENT.test(part) && !/^\.+$/.test(part));
  return isValid ? parts : null;
}

/** A branch name or project path for a URL, each part encoded and its slashes kept as they are. */
export function encodeUrlPath(urlPath) {
  return urlPath.split('/').map(encodeURIComponent).join('/');
}
