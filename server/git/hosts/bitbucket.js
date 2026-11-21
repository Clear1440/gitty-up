import {
  findCredential,
  matchRemotePath,
  requestJson,
  splitRepositoryPath,
} from './hostApi.js';

const WEB_URL = 'https://bitbucket.org';
const API_URL = 'https://api.bitbucket.org/2.0';
// The most Bitbucket gives in one page of pull requests.
const PAGE_SIZE = 50;

/**
 * A token from the environment is an access token, sent as a bearer token. One from git
 * is only used as a username and app password, so a lone token is left out.
 */
function authHeaders(credential) {
  if (credential?.fromEnvironment) return { Authorization: `Bearer ${credential.token}` };
  if (credential?.username) {
    const basic = Buffer.from(`${credential.username}:${credential.token}`).toString('base64');
    return { Authorization: `Basic ${basic}` };
  }
  return {};
}

export const bitbucket = {
  id: 'bitbucket',
  name: 'Bitbucket',
  term: 'pull request',
  /** Its new pull request page only takes the branches. */
  prefills: { title: false, body: false, draft: false },

  /** The workspace and repository in a remote URL, or null if it isn't on bitbucket.org. */
  parse(url) {
    const parts = splitRepositoryPath(matchRemotePath(url, 'bitbucket.org'), { min: 2, max: 2 });
    return parts ? { workspace: parts[0], repo: parts[1] } : null;
  },

  describe: (repository) => `${repository.workspace}/${repository.repo}`,

  findCredential: (repoPath) =>
    findCredential(repoPath, { host: 'bitbucket.org', envNames: ['BITBUCKET_TOKEN'] }),

  async list(repository, credential) {
    const { workspace, repo } = repository;
    const answer = await requestJson(
      `${API_URL}/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/pullrequests?state=OPEN&pagelen=${PAGE_SIZE}`,
      { headers: authHeaders(credential) },
    );
    const fullName = `${workspace}/${repo}`.toLowerCase();
    return (
      (answer?.values ?? [])
        // A fork's branch can share its name with one of ours without being it.
        .filter((pull) => pull.source?.repository?.full_name?.toLowerCase() === fullName)
        .map((pull) => ({
          number: pull.id,
          title: pull.title,
          url: pull.links?.html?.href,
          branch: pull.source?.branch?.name,
          draft: Boolean(pull.draft),
          review: null,
          checks: null,
        }))
        .filter((pull) => pull.url && pull.branch)
    );
  },

  newPullRequestUrl({ workspace, repo }, { base, head }) {
    const query = new URLSearchParams({ source: head, dest: base });
    return `${WEB_URL}/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}/pull-requests/new?${query}`;
  },
};
