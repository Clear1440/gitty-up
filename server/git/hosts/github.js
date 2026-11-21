import {
  HostRequestError,
  encodeBranchPath,
  findCredential,
  matchRemotePath,
  requestJson,
  splitRepositoryPath,
} from './hostApi.js';

const API_URL = 'https://api.github.com';
const WEB_URL = 'https://github.com';
// One page: a repository with more open pull requests than this loses icons, not features.
const PAGE_SIZE = 100;

/**
 * Every open pull request with its review decision and the checks on its newest commit,
 * in one request rather than one per pull request. GraphQL needs a token.
 */
const OPEN_PULL_REQUESTS_QUERY = `
query ($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number
        title
        url
        isDraft
        headRefName
        headRepository { nameWithOwner }
        reviewDecision
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

const REVIEWS = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes-requested',
  REVIEW_REQUIRED: 'review-required',
};

const CHECKS = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

const fullNameOf = ({ owner, repo }) => `${owner}/${repo}`.toLowerCase();

const authHeaders = (credential) =>
  credential ? { Authorization: `Bearer ${credential.token}` } : {};

async function listWithStatus(repository, credential) {
  const answer = await requestJson(`${API_URL}/graphql`, {
    method: 'POST',
    headers: authHeaders(credential),
    body: {
      query: OPEN_PULL_REQUESTS_QUERY,
      variables: { owner: repository.owner, name: repository.repo, first: PAGE_SIZE },
    },
  });
  const nodes = answer?.data?.repository?.pullRequests?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error(answer?.errors?.[0]?.type ?? 'no pull requests in the answer');
  }
  const fullName = fullNameOf(repository);
  return (
    nodes
      // A fork's branch can share its name with one of ours without being it.
      .filter((node) => node?.headRepository?.nameWithOwner?.toLowerCase() === fullName)
      .map((node) => {
        const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup;
        return {
          number: node.number,
          title: node.title,
          url: node.url,
          branch: node.headRefName,
          draft: Boolean(node.isDraft),
          review: REVIEWS[node.reviewDecision] ?? null,
          checks: rollup ? (CHECKS[rollup.state] ?? 'none') : 'none',
        };
      })
  );
}

/** The REST list, which works without a token but says nothing about reviews or checks. */
async function listWithoutStatus(repository, credential) {
  const { owner, repo } = repository;
  const pullRequests = await requestJson(
    `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=${PAGE_SIZE}`,
    { headers: { Accept: 'application/vnd.github+json', ...authHeaders(credential) } },
  );
  const fullName = fullNameOf(repository);
  return pullRequests
    .filter(({ head }) => head.repo?.full_name?.toLowerCase() === fullName)
    .map(({ number, title, html_url: url, head, draft }) => ({
      number,
      title,
      url,
      branch: head.ref,
      draft: Boolean(draft),
      review: null,
      checks: null,
    }));
}

/** What GitHub said was wrong with a pull request, such as one already existing. */
function describeRefusal(body) {
  const details = (body?.errors ?? []).map((error) => error?.message).filter(Boolean);
  return details.length > 0 ? details.join(' ') : (body?.message ?? null);
}

export const github = {
  id: 'github',
  name: 'GitHub',
  term: 'pull request',
  /** The query string can fill in the title and description, but not make a draft. */
  prefills: { title: true, body: true, draft: false },

  /** The owner and repository in a remote URL, or null if it isn't on github.com. */
  parse(url) {
    const parts = splitRepositoryPath(matchRemotePath(url, 'github.com'), { min: 2, max: 2 });
    return parts ? { owner: parts[0], repo: parts[1] } : null;
  },

  describe: (repository) => `${repository.owner}/${repository.repo}`,

  findCredential: (repoPath) =>
    findCredential(repoPath, { host: 'github.com', envNames: ['GH_TOKEN', 'GITHUB_TOKEN'] }),

  /**
   * Open pull requests, with review and check status when there is a token to ask
   * GraphQL with. Without one, or if GraphQL fails, the REST list still gives labels.
   */
  async list(repository, credential) {
    if (credential) {
      try {
        return await listWithStatus(repository, credential);
      } catch (error) {
        console.warn(
          `Could not read pull request status for ${fullNameOf(repository)}: ${error.message}`,
        );
      }
    }
    return listWithoutStatus(repository, credential);
  },

  /** The page that starts a pull request, filled in as far as GitHub's query string allows. */
  newPullRequestUrl({ owner, repo }, { base, head, title, body }) {
    const query = new URLSearchParams({ expand: '1' });
    if (title) query.set('title', title);
    if (body) query.set('body', body);
    return `${WEB_URL}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeBranchPath(base)}...${encodeBranchPath(head)}?${query}`;
  },

  /**
   * Creates the pull request. Resolves `{ number, url }`, or `{ refused }` saying why
   * GitHub turned it down, such as one already existing. A token that may not create
   * it rejects, so the caller can fall back on the browser.
   */
  async create({ owner, repo }, credential, { base, head, title, body, draft }) {
    try {
      const created = await requestJson(
        `${API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        {
          method: 'POST',
          headers: { Accept: 'application/vnd.github+json', ...authHeaders(credential) },
          body: { title, head, base, body, draft },
        },
      );
      return { number: created.number, url: created.html_url };
    } catch (error) {
      if (error instanceof HostRequestError && error.status === 422) {
        return { refused: describeRefusal(error.body) ?? 'GitHub turned the pull request down.' };
      }
      throw error;
    }
  },
};
