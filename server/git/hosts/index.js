import { bitbucket } from './bitbucket.js';
import { github } from './github.js';
import { gitlab } from './gitlab.js';

/**
 * The hosting services Gitty Up knows how to ask about pull requests. Each one is an
 * adapter with:
 *
 * - `id`, `name`: how it is known in code and in the app.
 * - `term`: what it calls a pull request, such as "merge request".
 * - `prefills`: which of `title`, `body` and `draft` its new pull request page takes.
 * - `parse(url)`: the repository a remote URL names on it, or null for other hosts.
 * - `describe(repository)`: that repository's name, for logs.
 * - `findCredential(repoPath)`: what to call its API with, or null.
 * - `list(repository, credential)`: open pull requests, as
 *   `{ number, title, url, branch, draft, review, checks }`. Rejects on failure.
 * - `newPullRequestUrl(repository, { base, head, title, body, draft })`: the web page
 *   that starts one, filled in as far as it allows.
 * - `create(repository, credential, input)`, optional: makes one through the API.
 *
 * Only the public services are known. A self-hosted server matches none of them, so its
 * remotes simply get no pull requests.
 */
export const HOSTS = [github, gitlab, bitbucket];

/** The host a remote URL is on and the repository it names there, or null. */
export function findRemoteHost(url) {
  for (const host of HOSTS) {
    const repository = host.parse(url);
    if (repository) return { host, repository };
  }
  return null;
}
