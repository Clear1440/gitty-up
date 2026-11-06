import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPullRequests, parseGitHubRemote } from './pullRequests.js';
import { runGit } from './runGit.js';

vi.mock('./runGit.js', () => ({ runGit: vi.fn() }));

const REMOTE = 'https://github.com/acme/app.git';

const pull = (number, branch, repository = 'acme/app') => ({
  number,
  title: `Pull ${number}`,
  html_url: `https://github.com/acme/app/pull/${number}`,
  head: { ref: branch, repo: repository ? { full_name: repository } : null },
  draft: false,
});

const replyWith = (body, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('parseGitHubRemote', () => {
  it.each([
    'https://github.com/acme/app.git',
    'https://github.com/acme/app',
    'https://someone@github.com/acme/app.git',
    'git@github.com:acme/app.git',
    'ssh://git@github.com/acme/app.git',
  ])('reads %s', (url) => {
    expect(parseGitHubRemote(url)).toEqual({ owner: 'acme', repo: 'app' });
  });

  it.each([
    'https://gitlab.com/acme/app.git',
    'https://github.com.evil.example/acme/app.git',
    '/local/path/remote.git',
    '',
    null,
  ])('rejects %s', (url) => {
    expect(parseGitHubRemote(url)).toBeNull();
  });
});

describe('listPullRequests', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('GH_TOKEN', '');
    vi.stubEnv('GITHUB_TOKEN', '');
    runGit.mockReset();
    runGit.mockResolvedValue('protocol=https\nhost=github.com\nusername=a\npassword=stored\n');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('asks nobody about a remote that is not on GitHub', async () => {
    const fetchMock = replyWith([]);
    vi.stubGlobal('fetch', fetchMock);

    expect(await listPullRequests('/repo', 'https://gitlab.com/acme/app.git')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runGit).not.toHaveBeenCalled();
  });

  it('lists pull requests by their branch', async () => {
    vi.stubGlobal('fetch', replyWith([pull(7, 'feature/x')]));

    expect(await listPullRequests('/repo', REMOTE)).toEqual([
      {
        number: 7,
        title: 'Pull 7',
        url: 'https://github.com/acme/app/pull/7',
        branch: 'feature/x',
        draft: false,
      },
    ]);
  });

  it('leaves out branches that live in a fork, or a fork since deleted', async () => {
    vi.stubGlobal(
      'fetch',
      replyWith([pull(1, 'main', 'someone/app'), pull(2, 'gone', null), pull(3, 'ours')]),
    );

    const pullRequests = await listPullRequests('/repo', REMOTE);

    expect(pullRequests.map(({ number }) => number)).toEqual([3]);
  });

  it('prefers a token from the environment, without touching stored credentials', async () => {
    vi.stubEnv('GH_TOKEN', 'from-env');
    const fetchMock = replyWith([]);
    vi.stubGlobal('fetch', fetchMock);

    await listPullRequests('/repo', REMOTE);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer from-env');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('falls back on what git has stored, never opening a sign-in window', async () => {
    const fetchMock = replyWith([]);
    vi.stubGlobal('fetch', fetchMock);

    await listPullRequests('/repo', REMOTE);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer stored');
    expect(runGit.mock.calls[0][2].env).toEqual({ GCM_INTERACTIVE: 'never' });
  });

  it('goes without a token when git has none', async () => {
    runGit.mockRejectedValue(new Error('no credentials'));
    const fetchMock = replyWith([]);
    vi.stubGlobal('fetch', fetchMock);

    await listPullRequests('/repo', REMOTE);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('shows none when GitHub refuses or cannot be reached', async () => {
    vi.stubGlobal('fetch', replyWith({ message: 'Not Found' }, 404));
    expect(await listPullRequests('/repo', REMOTE)).toEqual([]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await listPullRequests('/repo', REMOTE)).toEqual([]);
  });
});
