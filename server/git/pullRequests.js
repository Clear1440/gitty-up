import { ApiError } from '../errors.js';
import { findRemoteHost } from './hosts/index.js';

/**
 * How long a repository's list of pull requests is kept. Switching tabs or windows rereads
 * it, and hosts limit how often they may be asked.
 */
const CACHE_MS = 60_000;

/** `repoPath\0remoteUrl` → `{ expires, promise }`. The promise never rejects. */
const cache = new Map();

/**
 * The hosting service a remote URL is on, as `{ id, name, term, prefills }`, or null if
 * Gitty Up doesn't know it. Needs no network.
 */
export function describeRemoteHost(url) {
  const found = findRemoteHost(url);
  if (!found) return null;
  const { id, name, term, prefills } = found.host;
  return { id, name, term, prefills };
}

async function readPullRequests(repoPath, { host, repository }) {
  try {
    const credential = await host.findCredential(repoPath);
    return await host.list(repository, credential);
  } catch (error) {
    console.warn(`Could not list pull requests for ${host.describe(repository)}: ${error.message}`);
    return [];
  }
}

function forgetExpired(now) {
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
}

/** Forgets the pull requests read for a repository, so a new one shows at once. */
function forgetPullRequests(repoPath) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${repoPath}\0`)) cache.delete(key);
  }
}

/** Forgets every list read so far. For tests. */
export function clearPullRequestCache() {
  cache.clear();
}

/**
 * Lists a repository's open pull requests, as `{ number, title, url, branch, draft,
 * review, checks }`. `review` and `checks` are null when the host didn't say. These only
 * decorate the history, so any failure leaves it with none to show. A list is reused
 * for a minute, as is a failure, so a host that is down isn't asked again at once.
 */
export async function listPullRequests(repoPath, remoteUrl) {
  const found = findRemoteHost(remoteUrl);
  if (!found) return [];

  const key = `${repoPath}\0${remoteUrl}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.promise;

  forgetExpired(now);
  const promise = readPullRequests(repoPath, found);
  cache.set(key, { expires: now + CACHE_MS, promise });
  return promise;
}

/** Whether a pull request on this remote can be made from here, rather than in the browser. */
export async function canCreatePullRequests(repoPath, remoteUrl) {
  const found = findRemoteHost(remoteUrl);
  if (!found?.host.create) return false;
  return Boolean(await found.host.findCredential(repoPath));
}

/**
 * Opens a pull request from `head` into `base`, both named as they are on the remote.
 * Where the host's API can and a token allows, it is created here, giving
 * `{ created: true, number, url, hostName }`. Otherwise this gives
 * `{ created: false, url, hostName, reason }`: the host's page that starts it, filled in
 * as far as the host allows, for the browser to finish. `reason` says why, if anything
 * went wrong. Nothing is ever pushed.
 */
export async function createPullRequest(repoPath, remoteUrl, { base, head, title, body, draft }) {
  const found = findRemoteHost(remoteUrl);
  if (!found) throw ApiError.badRequest('Gitty Up cannot open pull requests on this remote.');
  const { host, repository } = found;
  const input = { base, head, title, body, draft };
  const inBrowser = (reason = null) => ({
    created: false,
    url: host.newPullRequestUrl(repository, input),
    hostName: host.name,
    reason,
  });

  if (!host.create) return inBrowser();
  const credential = await host.findCredential(repoPath);
  if (!credential) return inBrowser();

  let result;
  try {
    result = await host.create(repository, credential, input);
  } catch (error) {
    console.warn(
      `Could not create a pull request on ${host.describe(repository)}: ${error.message}`,
    );
    return inBrowser(`${host.name} could not create it from here, so finish it in your browser.`);
  }
  if (result.refused) throw ApiError.hostRefused(`${host.name} said: ${result.refused}`);

  forgetPullRequests(repoPath);
  return { created: true, number: result.number, url: result.url, hostName: host.name };
}
