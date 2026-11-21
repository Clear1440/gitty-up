import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findRemoteHost } from './hosts/index.js';
import {
  clearPullRequestCache,
  createPullRequest,
  describeRemoteHost,
  listPullRequests,
  parseGitHubRemote,
} from './pullRequests.js';
import { runGit } from './runGit.js';

vi.mock('./runGit.js', () => ({ runGit: vi.fn() }));

const REMOTE = 'https://github.com/acme/app.git';
const GITLAB_REMOTE = 'git@gitlab.com:acme/tools/app.git';
const BITBUCKET_REMOTE = 'https://someone@bitbucket.org/acme/app.git';

const restPull = (number, branch, repository = 'acme/app') => ({
  number,
  title: `Pull ${number}`,
  html_url: `https://github.com/acme/app/pull/${number}`,
  head: { ref: branch, repo: repository ? { full_name: repository } : null },
  draft: false,
});

const graphPull = (
  number,
  branch,
  { review = null, state = null, repository = 'acme/app' } = {},
) => ({
  number,
  title: `Pull ${number}`,
  url: `https://github.com/acme/app/pull/${number}`,
  isDraft: false,
  headRefName: branch,
  headRepository: repository ? { nameWithOwner: repository } : null,
  reviewDecision: review,
  commits: { nodes: [{ commit: { statusCheckRollup: state ? { state } : null } }] },
});

const graphAnswer = (nodes) => ({ data: { repository: { pullRequests: { nodes } } } });

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });

const replyWith = (body, status = 200) => vi.fn(async () => reply(body, status));

/** Answers GraphQL with `graph` and REST with `rest`, so a test can tell which was asked. */
const replyByApi = ({ graph, rest }) =>
  vi.fn(async (url) => (url.endsWith('/graphql') ? graph() : rest()));

const storedCredential = (username = 'a', password = 'stored') =>
  `protocol=https\nhost=example\nusername=${username}\npassword=${password}\n`;

describe('remote parsing', () => {
  it.each([
    'https://github.com/acme/app.git',
    'https://github.com/acme/app',
    'https://github.com/acme/app/',
    'https://someone@github.com/acme/app.git',
    'git@github.com:acme/app.git',
    'ssh://git@github.com/acme/app.git',
    'ssh://git@github.com:22/acme/app.git',
  ])('reads %s as GitHub', (url) => {
    expect(parseGitHubRemote(url)).toEqual({ owner: 'acme', repo: 'app' });
  });

  it.each([
    'https://gitlab.com/acme/app.git',
    'https://github.com.evil.example/acme/app.git',
    'https://github.com/acme/app/extra',
    'https://github.com/../app',
    'https://github.example.com/acme/app.git',
    '/local/path/remote.git',
    '',
    null,
  ])('does not read %s as GitHub', (url) => {
    expect(parseGitHubRemote(url)).toBeNull();
  });

  it.each([
    ['https://gitlab.com/acme/app.git', 'acme/app'],
    ['https://gitlab.com/acme/tools/app', 'acme/tools/app'],
    ['git@gitlab.com:acme/tools/app.git', 'acme/tools/app'],
    ['ssh://git@gitlab.com/acme/app.git', 'acme/app'],
  ])('reads %s as GitLab', (url, path) => {
    const found = findRemoteHost(url);
    expect(found.host.id).toBe('gitlab');
    expect(found.repository).toEqual({ path });
  });

  it.each([
    'https://bitbucket.org/acme/app.git',
    'https://someone@bitbucket.org/acme/app',
    'git@bitbucket.org:acme/app.git',
    'ssh://git@bitbucket.org/acme/app.git',
  ])('reads %s as Bitbucket', (url) => {
    const found = findRemoteHost(url);
    expect(found.host.id).toBe('bitbucket');
    expect(found.repository).toEqual({ workspace: 'acme', repo: 'app' });
  });

  it('knows nothing of self-hosted servers', () => {
    expect(findRemoteHost('https://git.example.com/acme/app.git')).toBeNull();
    expect(findRemoteHost('git@gitlab.example.com:acme/app.git')).toBeNull();
    expect(describeRemoteHost('https://github.example.com/acme/app.git')).toBeNull();
  });

  it('describes a host without its adapter', () => {
    expect(describeRemoteHost(GITLAB_REMOTE)).toEqual({
      id: 'gitlab',
      name: 'GitLab',
      term: 'merge request',
      prefills: { title: true, body: true, draft: true },
    });
  });
});

describe('listPullRequests', () => {
  beforeEach(() => {
    clearPullRequestCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'BITBUCKET_TOKEN']) {
      vi.stubEnv(name, '');
    }
    runGit.mockReset();
    runGit.mockResolvedValue(storedCredential());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('asks nobody about a remote on no known host', async () => {
    const fetchMock = replyWith([]);
    vi.stubGlobal('fetch', fetchMock);

    expect(await listPullRequests('/repo', 'https://git.example.com/acme/app.git')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runGit).not.toHaveBeenCalled();
  });

  describe('on GitHub', () => {
    it('reads reviews and checks in one GraphQL request', async () => {
      const fetchMock = replyWith(
        graphAnswer([
          graphPull(7, 'feature/x', { review: 'APPROVED', state: 'SUCCESS' }),
          graphPull(8, 'broken', { review: 'CHANGES_REQUESTED', state: 'FAILURE' }),
          graphPull(9, 'waiting', { review: 'REVIEW_REQUIRED', state: 'PENDING' }),
          graphPull(10, 'quiet'),
        ]),
      );
      vi.stubGlobal('fetch', fetchMock);

      const pullRequests = await listPullRequests('/repo', REMOTE);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.github.com/graphql');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer stored');
      expect(JSON.parse(init.body).variables).toMatchObject({ owner: 'acme', name: 'app' });
      expect(pullRequests).toEqual([
        {
          number: 7,
          title: 'Pull 7',
          url: 'https://github.com/acme/app/pull/7',
          branch: 'feature/x',
          draft: false,
          review: 'approved',
          checks: 'passing',
        },
        expect.objectContaining({ number: 8, review: 'changes-requested', checks: 'failing' }),
        expect.objectContaining({ number: 9, review: 'review-required', checks: 'pending' }),
        expect.objectContaining({ number: 10, review: null, checks: 'none' }),
      ]);
    });

    it('leaves out branches that live in a fork, or a fork since deleted', async () => {
      vi.stubGlobal(
        'fetch',
        replyWith(
          graphAnswer([
            graphPull(1, 'main', { repository: 'someone/app' }),
            graphPull(2, 'gone', { repository: null }),
            graphPull(3, 'ours', { repository: 'ACME/app' }),
          ]),
        ),
      );

      const pullRequests = await listPullRequests('/repo', REMOTE);

      expect(pullRequests.map(({ number }) => number)).toEqual([3]);
    });

    it('lists without status over REST when there is no token', async () => {
      runGit.mockRejectedValue(new Error('no credentials'));
      const fetchMock = replyWith([restPull(7, 'feature/x'), restPull(8, 'theirs', 'someone/app')]);
      vi.stubGlobal('fetch', fetchMock);

      const pullRequests = await listPullRequests('/repo', REMOTE);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.github.com/repos/acme/app/pulls?state=open&per_page=100',
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
      expect(pullRequests).toEqual([
        {
          number: 7,
          title: 'Pull 7',
          url: 'https://github.com/acme/app/pull/7',
          branch: 'feature/x',
          draft: false,
          review: null,
          checks: null,
        },
      ]);
    });

    it('falls back on REST when GraphQL refuses', async () => {
      const fetchMock = replyByApi({
        graph: () => reply({ errors: [{ type: 'FORBIDDEN' }], data: { repository: null } }),
        rest: () => reply([restPull(4, 'topic')]),
      });
      vi.stubGlobal('fetch', fetchMock);

      const pullRequests = await listPullRequests('/repo', REMOTE);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(pullRequests.map(({ number, checks }) => ({ number, checks }))).toEqual([
        { number: 4, checks: null },
      ]);
    });

    it('prefers a token from the environment, without touching stored credentials', async () => {
      vi.stubEnv('GH_TOKEN', 'from-env');
      const fetchMock = replyWith(graphAnswer([]));
      vi.stubGlobal('fetch', fetchMock);

      await listPullRequests('/repo', REMOTE);

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer from-env');
      expect(runGit).not.toHaveBeenCalled();
    });

    it('asks git for github.com credentials, never opening a sign-in window', async () => {
      vi.stubGlobal('fetch', replyWith(graphAnswer([])));

      await listPullRequests('/repo', REMOTE);

      const [, args, options] = runGit.mock.calls[0];
      expect(args).toEqual(['credential', 'fill']);
      expect(options.input).toBe('protocol=https\nhost=github.com\n\n');
      expect(options.env).toEqual({ GCM_INTERACTIVE: 'never' });
    });

    it('shows none when GitHub refuses or cannot be reached', async () => {
      runGit.mockRejectedValue(new Error('no credentials'));
      vi.stubGlobal('fetch', replyWith({ message: 'Not Found' }, 404));
      expect(await listPullRequests('/repo', REMOTE)).toEqual([]);

      clearPullRequestCache();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('offline');
        }),
      );
      expect(await listPullRequests('/repo', REMOTE)).toEqual([]);
    });

    it('never logs the token', async () => {
      vi.stubEnv('GH_TOKEN', 'secret-token');
      vi.stubGlobal('fetch', replyWith({ message: 'Bad credentials' }, 401));

      await listPullRequests('/repo', REMOTE);

      const logged = console.warn.mock.calls.flat().join('\n');
      expect(logged).not.toContain('secret-token');
    });
  });

  describe('caching', () => {
    it('reuses a list for a minute, per repository', async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = replyWith(graphAnswer([graphPull(1, 'topic')]));
        vi.stubGlobal('fetch', fetchMock);

        await listPullRequests('/repo', REMOTE);
        await listPullRequests('/repo', REMOTE);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await listPullRequests('/other', REMOTE);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        vi.advanceTimersByTime(61_000);
        await listPullRequests('/repo', REMOTE);
        expect(fetchMock).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('asks once for requests that overlap', async () => {
      const fetchMock = replyWith(graphAnswer([]));
      vi.stubGlobal('fetch', fetchMock);

      await Promise.all([listPullRequests('/repo', REMOTE), listPullRequests('/repo', REMOTE)]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('on GitLab', () => {
    const mergeRequest = (iid, branch, { sourceProject = 1, draft = false } = {}) => ({
      iid,
      title: `MR ${iid}`,
      web_url: `https://gitlab.com/acme/tools/app/-/merge_requests/${iid}`,
      source_branch: branch,
      source_project_id: sourceProject,
      target_project_id: 1,
      draft,
    });

    it('lists open merge requests of the project, leaving out forks', async () => {
      vi.stubEnv('GITLAB_TOKEN', 'gl-token');
      const fetchMock = replyWith([
        mergeRequest(3, 'topic', { draft: true }),
        mergeRequest(4, 'forked', { sourceProject: 2 }),
      ]);
      vi.stubGlobal('fetch', fetchMock);

      const pullRequests = await listPullRequests('/repo', GITLAB_REMOTE);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://gitlab.com/api/v4/projects/acme%2Ftools%2Fapp/merge_requests?state=opened&per_page=100',
      );
      expect(init.headers.Authorization).toBe('Bearer gl-token');
      expect(runGit).not.toHaveBeenCalled();
      expect(pullRequests).toEqual([
        {
          number: 3,
          title: 'MR 3',
          url: 'https://gitlab.com/acme/tools/app/-/merge_requests/3',
          branch: 'topic',
          draft: true,
          review: null,
          checks: null,
        },
      ]);
    });

    it('asks git for gitlab.com credentials when there is no token', async () => {
      vi.stubGlobal('fetch', replyWith([]));

      await listPullRequests('/repo', GITLAB_REMOTE);

      expect(runGit.mock.calls[0][2].input).toBe('protocol=https\nhost=gitlab.com\n\n');
    });
  });

  describe('on Bitbucket', () => {
    const bitbucketPull = (id, branch, repository = 'acme/app') => ({
      id,
      title: `PR ${id}`,
      links: { html: { href: `https://bitbucket.org/acme/app/pull-requests/${id}` } },
      source: { branch: { name: branch }, repository: { full_name: repository } },
      destination: { repository: { full_name: 'acme/app' } },
    });

    it('lists open pull requests, leaving out forks', async () => {
      const fetchMock = replyWith({
        values: [bitbucketPull(5, 'topic'), bitbucketPull(6, 'forked', 'someone/app')],
      });
      vi.stubGlobal('fetch', fetchMock);

      const pullRequests = await listPullRequests('/repo', BITBUCKET_REMOTE);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.bitbucket.org/2.0/repositories/acme/app/pullrequests?state=OPEN&pagelen=50',
      );
      expect(pullRequests).toEqual([
        {
          number: 5,
          title: 'PR 5',
          url: 'https://bitbucket.org/acme/app/pull-requests/5',
          branch: 'topic',
          draft: false,
          review: null,
          checks: null,
        },
      ]);
    });

    it('uses a stored username and password as basic auth', async () => {
      runGit.mockResolvedValue(storedCredential('me', 'app-password'));
      const fetchMock = replyWith({ values: [] });
      vi.stubGlobal('fetch', fetchMock);

      await listPullRequests('/repo', BITBUCKET_REMOTE);

      const expected = `Basic ${Buffer.from('me:app-password').toString('base64')}`;
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(expected);
    });

    it('leaves out a stored password with no username', async () => {
      runGit.mockResolvedValue('protocol=https\nhost=bitbucket.org\npassword=lonely\n');
      const fetchMock = replyWith({ values: [] });
      vi.stubGlobal('fetch', fetchMock);

      await listPullRequests('/repo', BITBUCKET_REMOTE);

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it('sends BITBUCKET_TOKEN as a bearer token', async () => {
      vi.stubEnv('BITBUCKET_TOKEN', 'bb-token');
      const fetchMock = replyWith({ values: [] });
      vi.stubGlobal('fetch', fetchMock);

      await listPullRequests('/repo', BITBUCKET_REMOTE);

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer bb-token');
    });
  });

  it('sends each token only to its own host', async () => {
    vi.stubEnv('GH_TOKEN', 'gh-token');
    vi.stubEnv('GITLAB_TOKEN', 'gl-token');
    vi.stubEnv('BITBUCKET_TOKEN', 'bb-token');
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('bitbucket')) return reply({ values: [] });
      if (url.endsWith('/graphql')) return reply(graphAnswer([]));
      return reply([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    await listPullRequests('/repo', REMOTE);
    await listPullRequests('/repo', GITLAB_REMOTE);
    await listPullRequests('/repo', BITBUCKET_REMOTE);

    const sent = fetchMock.mock.calls.map(([url, init]) => [
      new URL(url).host,
      init.headers.Authorization,
    ]);
    expect(sent).toEqual([
      ['api.github.com', 'Bearer gh-token'],
      ['gitlab.com', 'Bearer gl-token'],
      ['api.bitbucket.org', 'Bearer bb-token'],
    ]);
  });
});

describe('createPullRequest', () => {
  const input = {
    base: 'main',
    head: 'feature/x',
    title: 'Add x',
    body: '- Add x\n- Test x',
    draft: true,
  };

  beforeEach(() => {
    clearPullRequestCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'BITBUCKET_TOKEN']) {
      vi.stubEnv(name, '');
    }
    runGit.mockReset();
    runGit.mockRejectedValue(new Error('no credentials'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('creates it through GitHub with a token', async () => {
    vi.stubEnv('GH_TOKEN', 'gh-token');
    const fetchMock = replyWith(
      { number: 12, html_url: 'https://github.com/acme/app/pull/12' },
      201,
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPullRequest('/repo', REMOTE, input);

    expect(result).toEqual({
      created: true,
      number: 12,
      url: 'https://github.com/acme/app/pull/12',
      hostName: 'GitHub',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/app/pulls');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer gh-token');
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it('lists again after creating one, so its label shows', async () => {
    vi.stubEnv('GH_TOKEN', 'gh-token');
    const fetchMock = vi.fn(async (url) =>
      url.endsWith('/pulls')
        ? reply({ number: 12, html_url: 'https://github.com/acme/app/pull/12' }, 201)
        : reply(graphAnswer([])),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listPullRequests('/repo', REMOTE);
    await createPullRequest('/repo', REMOTE, input);
    await listPullRequests('/repo', REMOTE);

    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/graphql'))).toHaveLength(2);
  });

  it('gives the compare page, filled in, when there is no token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPullRequest('/repo', REMOTE, input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.reason).toBeNull();
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe('https://github.com/acme/app/compare/main...feature/x');
    expect(url.searchParams.get('expand')).toBe('1');
    expect(url.searchParams.get('title')).toBe('Add x');
    expect(url.searchParams.get('body')).toBe('- Add x\n- Test x');
  });

  it('says what GitHub objected to', async () => {
    vi.stubEnv('GH_TOKEN', 'gh-token');
    vi.stubGlobal(
      'fetch',
      replyWith(
        {
          message: 'Validation Failed',
          errors: [{ message: 'A pull request already exists for acme:feature/x.' }],
        },
        422,
      ),
    );

    await expect(createPullRequest('/repo', REMOTE, input)).rejects.toMatchObject({
      code: 'HOST_REFUSED',
      message: 'GitHub said: A pull request already exists for acme:feature/x.',
    });
  });

  it('falls back on the browser when the token may not create it', async () => {
    vi.stubEnv('GH_TOKEN', 'read-only');
    vi.stubGlobal('fetch', replyWith({ message: 'Resource not accessible' }, 403));

    const result = await createPullRequest('/repo', REMOTE, input);

    expect(result.created).toBe(false);
    expect(result.reason).toMatch(/finish it in your browser/);
    expect(result.url).toMatch(/^https:\/\/github\.com\/acme\/app\/compare\//);
  });

  it('opens GitLab with the fields filled in, marking a draft in its title', async () => {
    vi.stubEnv('GITLAB_TOKEN', 'gl-token');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPullRequest('/repo', GITLAB_REMOTE, input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.hostName).toBe('GitLab');
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(
      'https://gitlab.com/acme/tools/app/-/merge_requests/new',
    );
    expect(url.searchParams.get('merge_request[source_branch]')).toBe('feature/x');
    expect(url.searchParams.get('merge_request[target_branch]')).toBe('main');
    expect(url.searchParams.get('merge_request[title]')).toBe('Draft: Add x');
    expect(url.searchParams.get('merge_request[description]')).toBe('- Add x\n- Test x');
  });

  it('opens Bitbucket with the branches chosen', async () => {
    const result = await createPullRequest('/repo', BITBUCKET_REMOTE, input);

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe('https://bitbucket.org/acme/app/pull-requests/new');
    expect(url.searchParams.get('source')).toBe('feature/x');
    expect(url.searchParams.get('dest')).toBe('main');
  });

  it('refuses a remote on no known host', async () => {
    await expect(
      createPullRequest('/repo', 'https://git.example.com/acme/app.git', input),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
