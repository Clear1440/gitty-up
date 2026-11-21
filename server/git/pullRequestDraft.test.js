import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPullRequestDraft,
  getRemoteHosts,
  openPullRequest,
} from './gitService.js';
import * as mono from './monoService.js';
import { clearPullRequestCache } from './pullRequests.js';

const GITHUB_URL = 'https://github.com/acme/app.git';

let sandbox;
let repositoryCount = 0;
let work;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function commit(file, message) {
  await fs.writeFile(path.join(work, file), `${message}\n`);
  git(work, 'add', '--all');
  git(work, 'commit', '-m', message);
}

/** Pushes to the bare remote behind origin's GitHub URL, which no real push could reach. */
function pushToBareRemote(branch) {
  git(work, 'remote', 'set-url', 'origin', path.join(path.dirname(work), 'remote.git'));
  git(work, 'push', '-u', 'origin', branch);
  git(work, 'remote', 'set-url', 'origin', GITHUB_URL);
}

/**
 * A working copy with main and develop pushed to a bare remote, whose URL then points at
 * GitHub, so the code under test only ever sees a GitHub remote.
 */
async function createRepository() {
  repositoryCount += 1;
  const root = path.join(sandbox, `repo-${repositoryCount}`);
  const remote = path.join(root, 'remote.git');
  work = path.join(root, 'work');
  await fs.mkdir(work, { recursive: true });
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(work, 'init', '--initial-branch=main');
  git(work, 'config', 'user.name', 'Test');
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'commit.gpgsign', 'false');
  // Stored credentials on this machine must not count as a token.
  git(work, 'config', 'credential.helper', '');
  git(work, 'config', 'credential.https://github.com.helper', '');
  git(work, 'config', 'core.askPass', '');
  git(work, 'remote', 'add', 'origin', remote);
  await commit('readme.txt', 'Initial commit');
  git(work, 'push', '-u', 'origin', 'main');
  git(work, 'switch', '-c', 'develop');
  git(work, 'push', '-u', 'origin', 'develop');
  git(work, 'switch', 'main');
  git(work, 'remote', 'set-url', 'origin', GITHUB_URL);
  git(work, 'remote', 'set-head', 'origin', 'main');
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-pr-test-'));
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true, maxRetries: 5 });
});

beforeEach(async () => {
  clearPullRequestCache();
  // No token, and no program that could ask for one, such as an editor's askpass.
  const unset = ['GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'BITBUCKET_TOKEN'];
  for (const name of [...unset, 'GIT_ASKPASS', 'SSH_ASKPASS']) vi.stubEnv(name, '');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // Nothing in these tests may reach a real host.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('No network in tests');
    }),
  );
  await createRepository();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getRemoteHosts', () => {
  it('names the hosts of the remotes it knows', async () => {
    git(work, 'remote', 'add', 'mirror', 'git@gitlab.com:acme/tools/app.git');
    git(work, 'remote', 'add', 'internal', 'https://git.example.com/acme/app.git');

    const { defaultRemote, hosts } = await getRemoteHosts(work);

    expect(defaultRemote).toBe('origin');
    expect(Object.keys(hosts).sort()).toEqual(['mirror', 'origin']);
    expect(hosts.origin).toMatchObject({ id: 'github', name: 'GitHub', term: 'pull request' });
    expect(hosts.mirror).toMatchObject({ id: 'gitlab', term: 'merge request' });
  });

  it('offers none in a mono repo', async () => {
    const hosts = await mono.getRemoteHosts({ members: [{ path: work }] });
    expect(hosts.hosts).toEqual({});
    await expect(mono.getPullRequestDraft()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(mono.openPullRequest()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('getPullRequestDraft', () => {
  it('starts from the remote default branch, with the commits it would bring in', async () => {
    git(work, 'switch', '-c', 'feature/x');
    await commit('one.txt', 'Add one');
    await commit('two.txt', 'Add two');
    pushToBareRemote('feature/x');

    const draft = await getPullRequestDraft(work, { branch: 'feature/x' });

    expect(draft).toMatchObject({
      branch: 'feature/x',
      remote: 'origin',
      headName: 'feature/x',
      pushed: true,
      ahead: 0,
      bases: expect.arrayContaining(['main', 'develop']),
      defaultBase: 'main',
      base: 'main',
      commitCount: 2,
      title: 'Add two',
      body: '- Add one\n- Add two',
      host: { id: 'github', canCreate: false },
    });
    expect(draft.bases).not.toContain('feature/x');
  });

  it('works out the commits against another base when asked', async () => {
    git(work, 'switch', 'develop');
    await commit('develop.txt', 'Develop only');
    pushToBareRemote('develop');
    git(work, 'switch', '-c', 'topic');
    await commit('topic.txt', 'Topic work');

    const againstMain = await getPullRequestDraft(work, { branch: 'topic', base: 'main' });
    const againstDevelop = await getPullRequestDraft(work, { branch: 'topic', base: 'develop' });

    expect(againstMain.body).toBe('- Develop only\n- Topic work');
    expect(againstDevelop.body).toBe('- Topic work');
  });

  it('says when a branch is not pushed, or has commits its remote lacks', async () => {
    git(work, 'switch', '-c', 'local-only');
    await commit('local.txt', 'Local work');

    const unpushed = await getPullRequestDraft(work, { branch: 'local-only' });
    expect(unpushed).toMatchObject({ pushed: false, remote: 'origin', headName: 'local-only' });

    git(work, 'switch', 'develop');
    await commit('ahead.txt', 'Not pushed yet');
    const ahead = await getPullRequestDraft(work, { branch: 'develop' });
    expect(ahead).toMatchObject({ pushed: true, ahead: 1 });
  });

  it('takes a remote branch as it is on its remote', async () => {
    const draft = await getPullRequestDraft(work, { branch: 'origin/develop', remote: true });
    expect(draft).toMatchObject({ remote: 'origin', headName: 'develop', pushed: true });
    expect(draft.bases).toEqual(['main']);
  });

  it('knows when a token can create one here', async () => {
    vi.stubEnv('GH_TOKEN', 'test-token');
    const draft = await getPullRequestDraft(work, { branch: 'develop' });
    expect(draft.host.canCreate).toBe(true);
  });

  it('falls back on main when the remote does not say what its default is', async () => {
    git(work, 'remote', 'set-head', 'origin', '--delete');
    const draft = await getPullRequestDraft(work, { branch: 'develop' });
    expect(draft.defaultBase).toBe('main');
  });

  it('refuses a remote on a host it does not know', async () => {
    git(work, 'remote', 'set-url', 'origin', 'https://git.example.com/acme/app.git');
    await expect(getPullRequestDraft(work, { branch: 'develop' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('refuses an option in place of a branch', async () => {
    await expect(getPullRequestDraft(work, { branch: '--all' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('openPullRequest', () => {
  const input = { branch: 'develop', base: 'main', title: 'Develop', body: '- Develop' };

  it('gives GitHub’s compare page when there is no token, and pushes nothing', async () => {
    const before = git(work, 'rev-parse', 'refs/remotes/origin/develop');

    const result = await openPullRequest(work, input);

    expect(result.created).toBe(false);
    expect(result.url).toMatch(/^https:\/\/github\.com\/acme\/app\/compare\/main\.\.\.develop\?/);
    expect(git(work, 'rev-parse', 'refs/remotes/origin/develop')).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates it on GitHub with a token, as the branch is named there', async () => {
    vi.stubEnv('GH_TOKEN', 'test-token');
    git(work, 'switch', '-c', 'local-name', '--track', 'origin/develop');
    fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ number: 3, html_url: 'https://github.com/acme/app/pull/3' }), {
          status: 201,
        }),
    );

    const result = await openPullRequest(work, { ...input, branch: 'local-name', draft: true });

    expect(result).toMatchObject({ created: true, number: 3 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/app/pulls');
    expect(JSON.parse(init.body)).toEqual({
      base: 'main',
      head: 'develop',
      title: 'Develop',
      body: '- Develop',
      draft: true,
    });
  });

  it('refuses a branch that is not pushed, rather than pushing it', async () => {
    git(work, 'switch', '-c', 'local-only');
    await expect(
      openPullRequest(work, { ...input, branch: 'local-only' }),
    ).rejects.toMatchObject({ code: 'GIT_FAILED' });
  });

  it('refuses a pull request into the branch itself', async () => {
    await expect(openPullRequest(work, { ...input, base: 'develop' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
