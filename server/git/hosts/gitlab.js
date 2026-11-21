import {
  encodeBranchPath,
  findCredential,
  matchRemotePath,
  requestJson,
  splitRepositoryPath,
} from './hostApi.js';

const WEB_URL = 'https://gitlab.com';
const API_URL = `${WEB_URL}/api/v4`;
const PAGE_SIZE = 100;
// Groups nest, so a project can sit several levels down.
const MAX_PATH_PARTS = 20;

export const gitlab = {
  id: 'gitlab',
  name: 'GitLab',
  term: 'merge request',
  /** A title starting "Draft:" makes a draft merge request. */
  prefills: { title: true, body: true, draft: true },

  /** The project path in a remote URL, such as group/subgroup/app, or null if not on gitlab.com. */
  parse(url) {
    const parts = splitRepositoryPath(matchRemotePath(url, 'gitlab.com'), {
      min: 2,
      max: MAX_PATH_PARTS,
    });
    return parts ? { path: parts.join('/') } : null;
  },

  describe: (project) => project.path,

  findCredential: (repoPath) =>
    findCredential(repoPath, { host: 'gitlab.com', envNames: ['GITLAB_TOKEN'] }),

  /** Open merge requests. GitLab takes personal and OAuth tokens alike as a bearer token. */
  async list(project, credential) {
    const mergeRequests = await requestJson(
      `${API_URL}/projects/${encodeURIComponent(project.path)}/merge_requests?state=opened&per_page=${PAGE_SIZE}`,
      { headers: credential ? { Authorization: `Bearer ${credential.token}` } : {} },
    );
    return (
      mergeRequests
        // A fork's branch can share its name with one of ours without being it.
        .filter((request) => request.source_project_id === request.target_project_id)
        .map((request) => ({
          number: request.iid,
          title: request.title,
          url: request.web_url,
          branch: request.source_branch,
          draft: Boolean(request.draft ?? request.work_in_progress),
          review: null,
          checks: null,
        }))
    );
  },

  newPullRequestUrl({ path }, { base, head, title, body, draft }) {
    const query = new URLSearchParams({
      'merge_request[source_branch]': head,
      'merge_request[target_branch]': base,
    });
    if (title) query.set('merge_request[title]', draft ? `Draft: ${title}` : title);
    if (body) query.set('merge_request[description]', body);
    return `${WEB_URL}/${encodeBranchPath(path)}/-/merge_requests/new?${query}`;
  },
};
