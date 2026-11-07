import { runGit } from './runGit.js';

const API_URL = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 10_000;
const CREDENTIAL_TIMEOUT_MS = 10_000;
// One page: a repository with more open pull requests than this loses icons, not features.
const PAGE_SIZE = 100;

const GITHUB_REMOTE =
  /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i;

/** Reads the owner and repository from a remote URL, or null if it isn't on GitHub. */
export function parseGitHubRemote(url) {
  const match = GITHUB_REMOTE.exec(url?.trim() ?? '');
  return match ? { owner: match[1], repo: match[2] } : null;
}

/**
 * The token to call GitHub with, or null to go without, which only reaches public
 * repositories. Failing that, this asks git for what it would push with. Nobody is
 * there to answer a sign-in window, so the credential manager must never open one.
 */
async function findToken(repoPath) {
  const fromEnvironment = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (fromEnvironment) return fromEnvironment;

  try {
    const output = await runGit(repoPath, ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      timeout: CREDENTIAL_TIMEOUT_MS,
      env: { GCM_INTERACTIVE: 'never' },
    });
    return /^password=(.+)$/m.exec(output)?.[1].trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Lists a repository's open pull requests, as `{ number, title, url, branch, draft }`.
 * These only decorate the history, so any failure leaves it with none to show.
 */
export async function listPullRequests(repoPath, remoteUrl) {
  const github = parseGitHubRemote(remoteUrl);
  if (!github) return [];

  const { owner, repo } = github;
  const fullName = `${owner}/${repo}`.toLowerCase();
  const token = await findToken(repoPath);

  try {
    const response = await fetch(
      `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=${PAGE_SIZE}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'gitty-up',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.warn(`Could not list pull requests for ${fullName}: HTTP ${response.status}`);
      return [];
    }

    const pullRequests = await response.json();
    return (
      pullRequests
        // A fork's branch can share its name with one of ours without being it.
        .filter(({ head }) => head.repo?.full_name?.toLowerCase() === fullName)
        .map(({ number, title, html_url: url, head, draft }) => ({
          number,
          title,
          url,
          branch: head.ref,
          draft: Boolean(draft),
        }))
    );
  } catch (error) {
    console.warn(`Could not list pull requests for ${fullName}: ${error.message}`);
    return [];
  }
}
