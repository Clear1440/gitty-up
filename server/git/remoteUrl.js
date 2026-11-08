import { ApiError } from '../errors.js';

// An allowlist, so transports that run commands (such as ext::) can never reach git.
const SCHEME_URL = /^(https?|ssh|git|file):\/\/[^/\s]*\/\S+$/i;
const SCP_URL = /^\w[\w.-]*@\w[\w.-]*:\S+$/;

/** Validates a remote URL and works out the repository name git would clone it as. */
export function parseRemoteUrl(value) {
  const url = value.trim();
  if (!SCHEME_URL.test(url) && !SCP_URL.test(url)) {
    throw ApiError.badRequest(`${url} is not a git URL. Try https://host/owner/repository.git`);
  }
  const lastSegment = url.split(/[/:]/).findLast(Boolean);
  const name = lastSegment.replace(/\.git$/i, '');
  // The name becomes a folder, so it must not point back up the tree.
  if (!name || /^\.+$/.test(name)) {
    throw ApiError.badRequest(`${url} does not name a repository.`);
  }
  return { url, name };
}
