import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { RepositoryStore } from './store/repositoryStore.js';

let sandbox;
let server;
let baseUrl;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function request(method, route, body, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function writeAndCommit(cwd, file, content, message) {
  await fs.writeFile(path.join(cwd, file), content);
  git(cwd, 'add', '--all');
  git(cwd, 'commit', '-m', message);
}

/** Creates a working copy with one commit, pushed to its own bare remote. */
async function createRepository(name) {
  const root = path.join(sandbox, name);
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  await fs.mkdir(work, { recursive: true });
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(work, 'init', '--initial-branch=main');
  git(work, 'config', 'user.name', 'Test');
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'commit.gpgsign', 'false');
  git(work, 'config', 'core.autocrlf', 'false');
  git(work, 'remote', 'add', 'origin', remote);
  await writeAndCommit(work, 'readme.txt', 'one\n', 'Initial commit');
  git(work, 'push', '-u', 'origin', 'main');

  const { body } = await request('POST', '/api/repositories', { path: work });
  return { work, remote, api: `/api/repositories/${body.id}`, id: body.id };
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-test-'));
  const app = createApp({ store: new RepositoryStore(path.join(sandbox, 'data')) });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
  });
  await fs.rm(sandbox, { recursive: true, force: true, maxRetries: 5 });
});

let repositoryCount = 0;
let repo;

beforeEach(async () => {
  repositoryCount += 1;
  repo = await createRepository(`repo-${repositoryCount}`);
});

describe('request origin protection', () => {
  it('rejects requests from other websites', async () => {
    const { status } = await request('POST', `${repo.api}/fetch`, {}, {
      Origin: 'https://evil.example',
    });
    expect(status).toBe(403);
  });

  it('allows the local client', async () => {
    const { status } = await request('GET', '/api/repositories', undefined, {
      Origin: 'http://localhost:5173',
    });
    expect(status).toBe(200);
  });
});

describe('linked repositories', () => {
  it('lists a linked repository with a summary', async () => {
    const { body } = await request('GET', '/api/repositories');
    const linked = body.find((repository) => repository.id === repo.id);
    expect(linked).toMatchObject({
      name: 'work',
      available: true,
      summary: { branch: 'main', branchCount: 1, changeCount: 0 },
    });
    expect(linked.summary.lastCommit.subject).toBe('Initial commit');
  });

  it('links the working tree root when given a subfolder, without duplicating', async () => {
    const subfolder = path.join(repo.work, 'nested');
    await fs.mkdir(subfolder);
    const { body } = await request('POST', '/api/repositories', { path: subfolder });
    expect(body.id).toBe(repo.id);
  });

  it('rejects folders that are not repositories', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-plain-'));
    const { status, body } = await request('POST', '/api/repositories', { path: plain });
    expect(status).toBe(400);
    expect(body.error.message).toContain('not inside a git working tree');
    await fs.rm(plain, { recursive: true, force: true });
  });

  it('keeps a moved repository listed as unavailable until unlinked', async () => {
    await fs.rename(repo.work, `${repo.work}-moved`);
    const { body } = await request('GET', '/api/repositories');
    expect(body.find((repository) => repository.id === repo.id).available).toBe(false);

    expect((await request('DELETE', repo.api)).status).toBe(204);
    expect((await request('GET', repo.api)).status).toBe(404);
  });

  it('answers 404 for unknown repositories', async () => {
    expect((await request('GET', '/api/repositories/nope/status')).status).toBe(404);
  });
});

describe('repository groups', () => {
  const list = async () => (await request('GET', '/api/repositories')).body;
  const entryOf = async (id) => (await list()).find((entry) => entry.id === id);
  const groupIdsOf = async (id) => (await entryOf(id)).groupIds;
  const createGroup = async (name) =>
    (await request('POST', '/api/repositories/groups', { name })).body;

  it('moves a repository into a group and back out', async () => {
    const group = await createGroup('Work');

    await request('PUT', `${repo.api}/group`, { groupId: group.id });
    expect(await groupIdsOf(repo.id)).toEqual([group.id]);

    await request('PUT', `${repo.api}/group`, { groupId: null });
    expect(await groupIdsOf(repo.id)).toBeUndefined();
  });

  it('puts a repository in many groups at once', async () => {
    const first = await createGroup(`Many A ${repositoryCount}`);
    const second = await createGroup(`Many B ${repositoryCount}`);

    const { status } = await request('PUT', `${repo.api}/groups`, {
      groupIds: [first.id, second.id, first.id],
    });
    expect(status).toBe(204);
    expect(await groupIdsOf(repo.id)).toEqual([first.id, second.id]);

    await request('PUT', `${repo.api}/groups`, { groupIds: [] });
    expect(await groupIdsOf(repo.id)).toBeUndefined();
  });

  it('refuses a list of groups with one that does not exist', async () => {
    const group = await createGroup(`Real ${repositoryCount}`);
    const { status } = await request('PUT', `${repo.api}/groups`, {
      groupIds: [group.id, 'nope'],
    });
    expect(status).toBe(404);
    expect((await request('PUT', `${repo.api}/groups`, { groupIds: 'x' })).status).toBe(400);
  });

  it('only takes a deleted group off its repositories', async () => {
    const kept = await createGroup(`Kept ${repositoryCount}`);
    const gone = await createGroup(`Gone ${repositoryCount}`);
    await request('PUT', `${repo.api}/groups`, { groupIds: [kept.id, gone.id] });

    await request('DELETE', `/api/repositories/groups/${gone.id}`);

    expect(await groupIdsOf(repo.id)).toEqual([kept.id]);
  });

  it('reorders the groups, keeping any left out at the end', async () => {
    const before = (await request('GET', '/api/repositories/groups')).body.map(({ id }) => id);
    const reversed = [...before].reverse();

    const { status, body } = await request('PUT', '/api/repositories/groups/order', {
      ids: reversed.slice(0, -1),
    });

    expect(status).toBe(200);
    expect(body.map(({ id }) => id)).toEqual([...reversed.slice(0, -1), reversed.at(-1)]);
    const { body: groups } = await request('GET', '/api/repositories/groups');
    expect(groups.map(({ id }) => id)).toEqual(body.map(({ id }) => id));
  });

  it('colors a repository and clears the color', async () => {
    expect((await request('PUT', `${repo.api}/color`, { color: 'teal' })).status).toBe(204);
    expect((await entryOf(repo.id)).color).toBe('teal');

    await request('PUT', `${repo.api}/color`, { color: null });
    expect((await entryOf(repo.id)).color).toBeUndefined();
  });

  it('refuses a color it does not know', async () => {
    expect((await request('PUT', `${repo.api}/color`, { color: '#ff0000' })).status).toBe(400);
  });

  it('reuses a group when its name is added again', async () => {
    const first = await request('POST', '/api/repositories/groups', { name: 'Same' });
    const second = await request('POST', '/api/repositories/groups', { name: 'same' });
    expect(second.body.id).toBe(first.body.id);
  });

  it('renames a group', async () => {
    const { body: group } = await request('POST', '/api/repositories/groups', { name: 'Old' });
    await request('PATCH', `/api/repositories/groups/${group.id}`, { name: 'New' });
    const { body: groups } = await request('GET', '/api/repositories/groups');
    expect(groups.find(({ id }) => id === group.id).name).toBe('New');
  });

  it('keeps repositories linked when their group is deleted', async () => {
    const { body: group } = await request('POST', '/api/repositories/groups', { name: 'Gone' });
    await request('PUT', `${repo.api}/group`, { groupId: group.id });

    await request('DELETE', `/api/repositories/groups/${group.id}`);

    expect(await groupIdsOf(repo.id)).toBeUndefined();
    const { body: groups } = await request('GET', '/api/repositories/groups');
    expect(groups.some(({ id }) => id === group.id)).toBe(false);
  });

  it('refuses a group that does not exist', async () => {
    const { status } = await request('PUT', `${repo.api}/group`, { groupId: 'nope' });
    expect(status).toBe(404);
  });

  it('keeps a stub in its groups, with its color, once it is located', async () => {
    const { body: stub } = await request('POST', '/api/repositories/stubs', {
      url: `https://example.com/owner/grouped-${repositoryCount}.git`,
    });
    const group = await createGroup('Stubs');
    await request('PUT', `/api/repositories/${stub.id}/group`, { groupId: group.id });
    await request('PUT', `/api/repositories/${stub.id}/color`, { color: 'purple' });

    const other = path.join(path.dirname(repo.work), 'other');
    await fs.mkdir(other);
    git(other, 'init');
    const { body } = await request('POST', `/api/repositories/${stub.id}/locate`, { path: other });

    expect(body.groupIds).toEqual([group.id]);
    expect(body.color).toBe('purple');
  });

  it('reads the single group kept by older files', async () => {
    const dataDir = await fs.mkdtemp(path.join(sandbox, 'legacy-'));
    await fs.writeFile(
      RepositoryStore.fileIn(dataDir),
      JSON.stringify({
        repositories: [{ id: 'old', name: 'old', path: '/old', groupId: 'g1' }],
        groups: [{ id: 'g1', name: 'Legacy' }],
      }),
    );
    const store = new RepositoryStore(dataDir);
    const [entry] = await store.list();
    expect(entry.groupIds).toEqual(['g1']);
    expect(entry).not.toHaveProperty('groupId');
  });
});

describe('bulk linking', () => {
  let parent;

  beforeEach(async () => {
    parent = await fs.mkdtemp(path.join(sandbox, 'bulk-'));
    for (const folder of ['alpha', path.join('nested', 'beta')]) {
      await fs.mkdir(path.join(parent, folder), { recursive: true });
      git(path.join(parent, folder), 'init');
    }
    await fs.mkdir(path.join(parent, 'node_modules', 'skipped'), { recursive: true });
    git(path.join(parent, 'node_modules', 'skipped'), 'init');
  });

  const scan = (folder) =>
    request('GET', `/api/filesystem/repositories?path=${encodeURIComponent(folder)}`);

  it('finds nested repositories and skips installed packages', async () => {
    const { body } = await scan(parent);
    expect(body.repositories.map(({ name }) => name)).toEqual(['alpha', 'beta']);
    expect(body.repositories[1].relativePath).toBe(path.join('nested', 'beta'));
    expect(body.name).toBe(path.basename(parent));
    expect(body.truncated).toBe(false);
  });

  it('finds repositories inside another repository, and the folder itself', async () => {
    git(parent, 'init');
    const { body } = await scan(parent);
    expect(body.repositories.map(({ relativePath }) => relativePath)).toContain('.');
    expect(body.repositories).toHaveLength(3);
  });

  it('refuses to scan a folder that cannot be read', async () => {
    expect((await scan(path.join(parent, 'missing'))).status).toBe(400);
  });

  it('links every folder into one group', async () => {
    const paths = (await scan(parent)).body.repositories.map((entry) => entry.path);
    const groupName = path.basename(parent);

    const { status, body } = await request('POST', '/api/repositories/bulk', { paths, groupName });

    expect(status).toBe(201);
    expect(body).toEqual({ linkedCount: 2, failures: [] });
    const { body: groups } = await request('GET', '/api/repositories/groups');
    const group = groups.find(({ name }) => name === groupName);
    const { body: repositories } = await request('GET', '/api/repositories');
    const members = repositories.filter(({ groupIds }) => groupIds?.includes(group.id));
    expect(members.map(({ name }) => name).sort()).toEqual(['alpha', 'beta']);
  });

  it('links without a group when none is named', async () => {
    const paths = [path.join(parent, 'alpha')];
    await request('POST', '/api/repositories/bulk', { paths });
    const { body: repositories } = await request('GET', '/api/repositories');
    const linked = repositories.find((entry) => entry.name === 'alpha' && !entry.groupIds);
    expect(linked).toBeDefined();
  });

  it('links what it can and reports the rest', async () => {
    const plain = path.join(parent, 'plain');
    await fs.mkdir(plain);
    const { body } = await request('POST', '/api/repositories/bulk', {
      paths: [path.join(parent, 'alpha'), plain],
    });
    expect(body.linkedCount).toBe(1);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].path).toBe(plain);
  });

  it('leaves a repository in the group it already chose', async () => {
    const { body: group } = await request('POST', '/api/repositories/groups', { name: 'Mine' });
    await request('PUT', `${repo.api}/group`, { groupId: group.id });

    await request('POST', '/api/repositories/bulk', { paths: [repo.work], groupName: 'Other' });

    const { body } = await request('GET', repo.api);
    expect(body.groupIds).toEqual([group.id]);
  });

  it('creates no group when nothing could be linked', async () => {
    const plain = path.join(parent, 'plain');
    await fs.mkdir(plain);
    const groupName = `empty-${path.basename(parent)}`;
    await request('POST', '/api/repositories/bulk', { paths: [plain], groupName });
    const { body: groups } = await request('GET', '/api/repositories/groups');
    expect(groups.some(({ name }) => name === groupName)).toBe(false);
  });
});

describe('repositories added from git', () => {
  let remoteUrl;
  let stub;

  const listed = async (id) =>
    (await request('GET', '/api/repositories')).body.find((entry) => entry.id === id);

  const emptyFolder = (name) => fs.mkdtemp(path.join(sandbox, `${name}-`));

  beforeEach(async () => {
    remoteUrl = pathToFileURL(repo.remote).href;
    stub = (await request('POST', '/api/repositories/stubs', { url: remoteUrl })).body;
  });

  it('lists a stub with no folder, without duplicating it', async () => {
    expect(stub).toMatchObject({ name: 'remote', path: null, remoteUrl, available: false });
    const again = await request('POST', '/api/repositories/stubs', { url: remoteUrl });
    expect(again.body.id).toBe(stub.id);
    expect(await listed(stub.id)).toMatchObject({ path: null, summary: null });
  });

  it.each([
    ['https://github.com/owner/project.git', 'project'],
    ['https://github.com/owner/project/', 'project'],
    ['git@github.com:owner/project.git', 'project'],
    ['ssh://git@github.com/owner/project', 'project'],
  ])('names %s after its repository', async (url, name) => {
    const { body } = await request('POST', '/api/repositories/stubs', { url });
    expect(body.name).toBe(name);
  });

  it.each([
    'not a url',
    '--upload-pack=touch',
    'ext::sh -c touch% pwned',
    'https://github.com',
    'https://github.com/owner/..',
  ])('rejects %s', async (url) => {
    const { status } = await request('POST', '/api/repositories/stubs', { url });
    expect(status).toBe(400);
  });

  it('refuses git actions on a stub instead of running them elsewhere', async () => {
    const { status, body } = await request('GET', `/api/repositories/${stub.id}/status`);
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/not been cloned/);
  });

  it('clones into the chosen folder and replaces the stub', async () => {
    const parentPath = await emptyFolder('clone');
    const { status, body } = await request('POST', `/api/repositories/${stub.id}/clone`, {
      parentPath,
    });

    expect(status).toBe(201);
    expect(body).toMatchObject({ name: 'remote', available: true });
    expect(await fs.realpath(body.path)).toBe(await fs.realpath(path.join(parentPath, 'remote')));
    expect(git(body.path, 'log', '-1', '--format=%s')).toBe('Initial commit');
    expect(await listed(stub.id)).toBeUndefined();
    expect(await listed(body.id)).toMatchObject({ available: true });
  });

  it('keeps the stub when the clone fails', async () => {
    const parentPath = await emptyFolder('occupied');
    await fs.mkdir(path.join(parentPath, 'remote'));
    await fs.writeFile(path.join(parentPath, 'remote', 'file.txt'), 'taken');

    const { status } = await request('POST', `/api/repositories/${stub.id}/clone`, { parentPath });

    expect(status).toBe(409);
    expect(await listed(stub.id)).toMatchObject({ path: null });
  });

  it('locates an existing working copy and replaces the stub', async () => {
    const parentPath = await emptyFolder('located');
    const copy = path.join(parentPath, 'copy');
    git(parentPath, 'clone', remoteUrl, copy);

    const { status, body } = await request('POST', `/api/repositories/${stub.id}/locate`, {
      path: copy,
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ name: 'copy', available: true });
    expect(await listed(stub.id)).toBeUndefined();
  });

  it('keeps the stub when the located folder is not a repository', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-plain-'));
    const { status } = await request('POST', `/api/repositories/${stub.id}/locate`, {
      path: plain,
    });
    expect(status).toBe(400);
    expect(await listed(stub.id)).toMatchObject({ path: null });
    await fs.rm(plain, { recursive: true, force: true });
  });

  it('removes the stub without duplicating a folder that is already linked', async () => {
    const { body } = await request('POST', `/api/repositories/${stub.id}/locate`, {
      path: repo.work,
    });
    expect(body.id).toBe(repo.id);
    expect(await listed(stub.id)).toBeUndefined();
  });

  it('refuses to clone over a repository that already has a folder', async () => {
    const { status } = await request('POST', `${repo.api}/clone`, { parentPath: sandbox });
    expect(status).toBe(400);
  });
});

describe('branches', () => {
  it('creates, lists, checks out and deletes a branch with a slash in its name', async () => {
    await request('POST', `${repo.api}/branches`, { name: 'feature/login' });
    let { body } = await request('GET', `${repo.api}/branches`);
    expect(body.local.find((branch) => branch.isCurrent).name).toBe('feature/login');
    expect(body.remote.map((branch) => branch.name)).toEqual(['origin/main']);

    await request('POST', `${repo.api}/checkout`, { branch: 'main' });
    const encoded = encodeURIComponent('feature/login');
    expect((await request('DELETE', `${repo.api}/branches/${encoded}`)).status).toBe(204);

    ({ body } = await request('GET', `${repo.api}/branches`));
    expect(body.local.map((branch) => branch.name)).toEqual(['main']);
  });

  it('deletes a branch from its remote and keeps the local copy', async () => {
    git(repo.work, 'switch', '--create', 'feature/login');
    git(repo.work, 'push', '--set-upstream', 'origin', 'feature/login');
    git(repo.work, 'switch', 'main');

    const encoded = encodeURIComponent('origin/feature/login');
    const { status } = await request('DELETE', `${repo.api}/remote-branches/${encoded}`);

    expect(status).toBe(204);
    expect(git(repo.remote, 'branch', '--list')).not.toContain('feature/login');
    const { body } = await request('GET', `${repo.api}/branches`);
    expect(body.remote.map((branch) => branch.name)).toEqual(['origin/main']);
    expect(body.local.map((branch) => branch.name)).toContain('feature/login');
  });

  it('deletes a local branch and its remote copy together', async () => {
    git(repo.work, 'switch', '--create', 'feature/login');
    git(repo.work, 'push', '--set-upstream', 'origin', 'feature/login:shared-login');
    git(repo.work, 'switch', 'main');

    const encoded = encodeURIComponent('feature/login');
    const { status } = await request('DELETE', `${repo.api}/branches/${encoded}?deleteRemote=true`);

    expect(status).toBe(204);
    expect(git(repo.remote, 'branch', '--list')).not.toContain('shared-login');
    const { body } = await request('GET', `${repo.api}/branches`);
    expect(body.local.map((branch) => branch.name)).toEqual(['main']);
    expect(body.remote.map((branch) => branch.name)).toEqual(['origin/main']);
  });

  it('touches neither copy when the local branch cannot be deleted', async () => {
    git(repo.work, 'switch', '--create', 'unmerged');
    git(repo.work, 'push', '--set-upstream', 'origin', 'unmerged');
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Unmerged work');
    git(repo.work, 'switch', 'main');

    const { status } = await request('DELETE', `${repo.api}/branches/unmerged?deleteRemote=true`);

    expect(status).toBe(409);
    expect(git(repo.remote, 'branch', '--list')).toContain('unmerged');
  });

  it('refuses to delete the remote copy of a branch that has none', async () => {
    git(repo.work, 'branch', 'local-only');
    const { status } = await request('DELETE', `${repo.api}/branches/local-only?deleteRemote=true`);
    expect(status).toBe(400);
    expect(git(repo.work, 'branch', '--list')).toContain('local-only');
  });

  it('refuses to delete a remote branch it does not know', async () => {
    const { status } = await request('DELETE', `${repo.api}/remote-branches/origin%2Fnope`);
    expect(status).toBe(400);
  });

  it('reports when each branch was last checked out', async () => {
    git(repo.work, 'switch', '--create', 'topic');
    git(repo.work, 'switch', 'main');

    const { body } = await request('GET', `${repo.api}/branches`);

    const topic = body.local.find((branch) => branch.name === 'topic');
    expect(Date.parse(topic.lastCheckout)).not.toBeNaN();
  });

  it('tells local and remote branches apart on a commit', async () => {
    const { body: commits } = await request('GET', `${repo.api}/commits`);

    expect(commits[0].refs).toEqual([
      { type: 'head', name: 'main' },
      { type: 'remote', name: 'origin/main', remote: 'origin', localName: 'main' },
    ]);
  });

  describe('pruning branches gone from the remote', () => {
    /** A branch pushed and then deleted on the remote, as merging a pull request does. */
    async function pushThenDeleteRemotely(name, { unmerged = false } = {}) {
      git(repo.work, 'switch', '--create', name);
      if (unmerged) await writeAndCommit(repo.work, `${name}.txt`, 'work\n', `Work on ${name}`);
      git(repo.work, 'push', '--set-upstream', 'origin', name);
      git(repo.work, 'switch', 'main');
      git(repo.remote, 'branch', '-D', name);
      git(repo.work, 'fetch', '--prune');
    }

    const localNames = async () =>
      (await request('GET', `${repo.api}/branches`)).body.local.map((branch) => branch.name);

    it('deletes merged branches, keeps unmerged ones, and leaves others alone', async () => {
      await pushThenDeleteRemotely('merged');
      await pushThenDeleteRemotely('unmerged', { unmerged: true });
      git(repo.work, 'branch', 'never-pushed');

      const { status, body } = await request('POST', `${repo.api}/prune-branches`, {});

      expect(status).toBe(200);
      expect(body).toEqual({ deleted: ['merged'], kept: ['unmerged'] });
      expect(await localNames()).toEqual(['main', 'never-pushed', 'unmerged']);
    });

    it('deletes unmerged branches too when forced', async () => {
      await pushThenDeleteRemotely('unmerged', { unmerged: true });

      const { body } = await request('POST', `${repo.api}/prune-branches`, { force: true });

      expect(body).toEqual({ deleted: ['unmerged'], kept: [] });
    });

    it('never deletes the checked out branch', async () => {
      await pushThenDeleteRemotely('current');
      git(repo.work, 'switch', 'current');

      const { body } = await request('POST', `${repo.api}/prune-branches`, {});

      expect(body).toEqual({ deleted: [], kept: [] });
      expect(await localNames()).toContain('current');
    });
  });

  it('has no pull requests to show for a remote that is not on GitHub', async () => {
    const { status, body } = await request('GET', `${repo.api}/pull-requests`);

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('rejects names git would read as options or refuse', async () => {
    const dash = await request('POST', `${repo.api}/branches`, { name: '--force' });
    const spaces = await request('POST', `${repo.api}/branches`, { name: 'has spaces' });
    expect(dash.status).toBe(400);
    expect(spaces.status).toBe(400);
  });

  it('checks out a remote branch as a tracking branch, then reuses it', async () => {
    git(repo.work, 'switch', '-c', 'shared');
    git(repo.work, 'push', 'origin', 'shared');
    git(repo.work, 'switch', 'main');
    git(repo.work, 'branch', '-D', 'shared');

    await request('POST', `${repo.api}/checkout`, { branch: 'origin/shared', remote: true });
    let { body } = await request('GET', `${repo.api}/status`);
    expect(body).toMatchObject({ branch: 'shared', upstream: 'origin/shared' });

    git(repo.work, 'switch', 'main');
    const again = await request('POST', `${repo.api}/checkout`, {
      branch: 'origin/shared',
      remote: true,
    });
    expect(again.status).toBe(204);
    ({ body } = await request('GET', `${repo.api}/status`));
    expect(body.branch).toBe('shared');
  });

  it('refuses to delete an unmerged branch unless forced', async () => {
    git(repo.work, 'switch', '-c', 'unmerged');
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Unmerged work');
    git(repo.work, 'switch', 'main');

    const refused = await request('DELETE', `${repo.api}/branches/unmerged`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('not fully merged');

    expect((await request('DELETE', `${repo.api}/branches/unmerged?force=true`)).status).toBe(204);
  });
});

describe('committing', () => {
  it('stages, diffs, commits and lists history', async () => {
    await fs.writeFile(path.join(repo.work, 'new file.txt'), 'hello\n');

    let { body: status } = await request('GET', `${repo.api}/status`);
    expect(status.unstaged).toEqual([
      { path: 'new file.txt', originalPath: null, status: 'untracked' },
    ]);

    const query = `path=${encodeURIComponent('new file.txt')}`;
    const { body: diff } = await request('GET', `${repo.api}/diff?${query}&untracked=true`);
    expect(diff.diff).toContain('+hello');

    await request('POST', `${repo.api}/stage`, { paths: ['new file.txt'] });
    ({ body: status } = await request('GET', `${repo.api}/status`));
    expect(status.staged).toHaveLength(1);

    const { body: stagedDiff } = await request('GET', `${repo.api}/diff?${query}&staged=true`);
    expect(stagedDiff.diff).toContain('+hello');

    await request('POST', `${repo.api}/commit`, { message: 'Add file' });
    const { body: commits } = await request('GET', `${repo.api}/commits?limit=1`);
    expect(commits[0].subject).toBe('Add file');
    expect(commits[0].refs).toContainEqual({ type: 'head', name: 'main' });
  });

  it('treats file names as literals, not patterns', async () => {
    await fs.writeFile(path.join(repo.work, 'a.log'), 'x');
    await fs.writeFile(path.join(repo.work, 'b.log'), 'x');

    const { status } = await request('POST', `${repo.api}/stage`, { paths: ['*.log'] });

    expect(status).toBe(409);
    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.staged).toHaveLength(0);
  });

  it('requires a message unless amending', async () => {
    await fs.writeFile(path.join(repo.work, 'a.txt'), 'x');
    const missing = await request('POST', `${repo.api}/commit`, { message: ' ', stageAll: true });
    expect(missing.status).toBe(400);

    const amended = await request('POST', `${repo.api}/commit`, { amend: true, stageAll: true });
    expect(amended.status).toBe(204);
    expect(git(repo.work, 'log', '--format=%s')).toBe('Initial commit');
  });

  it('unstages and discards tracked and untracked changes', async () => {
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'changed\n');
    await fs.writeFile(path.join(repo.work, 'junk.txt'), 'junk\n');
    await request('POST', `${repo.api}/stage`, {});
    await request('POST', `${repo.api}/unstage`, {});

    const { body: status } = await request('GET', `${repo.api}/status`);
    expect(status.staged).toHaveLength(0);
    expect(status.unstaged).toHaveLength(2);

    await request('POST', `${repo.api}/discard`, { paths: ['readme.txt', 'junk.txt'] });
    const { body: clean } = await request('GET', `${repo.api}/status`);
    expect(clean.unstaged).toHaveLength(0);
    expect(await fs.readFile(path.join(repo.work, 'readme.txt'), 'utf8')).toBe('one\n');
  });
});

describe('syncing with the remote', () => {
  it('sets the upstream on the first push of a new branch', async () => {
    await request('POST', `${repo.api}/branches`, { name: 'topic' });
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Topic work');

    expect((await request('POST', `${repo.api}/push`, {})).status).toBe(204);

    const { body } = await request('GET', `${repo.api}/status`);
    expect(body).toMatchObject({ upstream: 'origin/topic', ahead: 0 });
    expect(git(repo.remote, 'branch', '--list', 'topic')).toContain('topic');
  });

  it('fetches and pulls commits made elsewhere', async () => {
    const other = path.join(repo.work, '..', 'other');
    git(path.dirname(other), 'clone', repo.remote, other);
    git(other, 'config', 'user.name', 'Other');
    git(other, 'config', 'user.email', 'other@example.com');
    await writeAndCommit(other, 'theirs.txt', 'theirs\n', 'Their work');
    git(other, 'push');

    await request('POST', `${repo.api}/fetch`, {});
    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.behind).toBe(1);

    expect((await request('POST', `${repo.api}/pull`, { mode: 'ff-only' })).status).toBe(204);
    const { body: pulled } = await request('GET', `${repo.api}/status`);
    expect(pulled.behind).toBe(0);
  });

  it('fetches every linked repository at once, reporting each one that fails', async () => {
    const other = path.join(repo.work, '..', 'other');
    git(path.dirname(other), 'clone', repo.remote, other);
    git(other, 'config', 'user.name', 'Other');
    git(other, 'config', 'user.email', 'other@example.com');
    await writeAndCommit(other, 'theirs.txt', 'theirs\n', 'Their work');
    git(other, 'push');
    const broken = await createRepository(`repo-${repositoryCount}-broken`);
    await fs.rm(broken.remote, { recursive: true, force: true });

    const { status, body } = await request('POST', '/api/repositories/fetch');

    expect(status).toBe(200);
    expect(body.fetchedCount).toBeGreaterThan(0);
    const failedIds = body.failures.map(({ id }) => id);
    expect(failedIds).toContain(broken.id);
    expect(failedIds).not.toContain(repo.id);
    const { body: list } = await request('GET', '/api/repositories');
    expect(list.find(({ id }) => id === repo.id).summary.behind).toBe(1);
  });

  it('publishes a branch under another name, and keeps pushing to it', async () => {
    await request('POST', `${repo.api}/branches`, { name: 'topic' });
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Topic work');

    const published = await request('POST', `${repo.api}/push`, {
      remote: 'origin',
      upstreamName: 'shared/topic',
    });
    expect(published.status).toBe(204);

    const { body } = await request('GET', `${repo.api}/status`);
    expect(body).toMatchObject({ upstream: 'origin/shared/topic', ahead: 0 });

    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'More work');
    expect((await request('POST', `${repo.api}/push`, {})).status).toBe(204);

    const { body: after } = await request('GET', `${repo.api}/status`);
    expect(after.ahead).toBe(0);
    expect(git(repo.remote, 'branch', '--list', 'topic')).toBe('');
  });

  it('publishes again once the upstream is gone', async () => {
    await request('POST', `${repo.api}/branches`, { name: 'topic' });
    await request('POST', `${repo.api}/push`, {});
    git(repo.remote, 'branch', '-D', 'topic');
    await request('POST', `${repo.api}/fetch`, {});

    const { body: gone } = await request('GET', `${repo.api}/status`);
    expect(gone).toMatchObject({ upstream: 'origin/topic', upstreamGone: true });

    await request('POST', `${repo.api}/push`, { upstreamName: 'topic' });

    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.upstreamGone).toBe(false);
  });

  it('refuses a bad upstream name or an unknown remote', async () => {
    await request('POST', `${repo.api}/branches`, { name: 'topic' });

    const badName = await request('POST', `${repo.api}/push`, { upstreamName: 'a..b' });
    const badRemote = await request('POST', `${repo.api}/push`, {
      remote: 'nowhere',
      upstreamName: 'topic',
    });

    expect(badName.status).toBe(400);
    expect(badRemote.status).toBe(400);
    expect(git(repo.remote, 'branch', '--list', 'topic')).toBe('');
  });

  it('lists the remotes to publish to', async () => {
    git(repo.work, 'remote', 'add', 'backup', repo.remote);

    const { body } = await request('GET', `${repo.api}/remotes`);

    expect(body).toEqual({ remotes: ['backup', 'origin'], defaultRemote: 'origin' });
  });

  it('explains a push to a repository with no remote', async () => {
    git(repo.work, 'remote', 'remove', 'origin');
    const { status, body } = await request('POST', `${repo.api}/push`, {});
    expect(status).toBe(409);
    expect(body.error.message).toContain('no remote');
  });
});

describe('looking inside a commit', () => {
  const head = () => git(repo.work, 'rev-parse', 'HEAD');

  const details = async (hash = head()) =>
    (await request('GET', `${repo.api}/commits/${hash}`)).body;

  const diffOf = async (file, options = {}, hash = head()) => {
    const query = new URLSearchParams({ path: file, ...options });
    return (await request('GET', `${repo.api}/commits/${hash}/diff?${query}`)).body.diff;
  };

  it('lists what a commit changed, with its whole message', async () => {
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'two\n');
    await fs.writeFile(path.join(repo.work, 'new.txt'), 'new\n');
    git(repo.work, 'add', '--all');
    git(repo.work, 'commit', '-m', 'Subject line', '-m', 'Body text');

    const commit = await details();

    expect(commit).toMatchObject({ subject: 'Subject line', author: 'Test' });
    expect(commit.message).toBe('Subject line\n\nBody text');
    expect(commit.files).toEqual([
      { path: 'new.txt', status: 'added' },
      { path: 'readme.txt', status: 'modified' },
    ]);
  });

  it('shows the diff of one file in a commit', async () => {
    await writeAndCommit(repo.work, 'readme.txt', 'two\n', 'Change readme');

    const diff = await diffOf('readme.txt');

    expect(diff).toContain('-one');
    expect(diff).toContain('+two');
  });

  it('can show the whole file', async () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index}`);
    await writeAndCommit(repo.work, 'long.txt', `${lines.join('\n')}\n`, 'Add long');
    await writeAndCommit(
      repo.work,
      'long.txt',
      `${lines.with(15, 'changed').join('\n')}\n`,
      'Change long',
    );

    expect(await diffOf('long.txt')).not.toContain(' line 0');
    expect(await diffOf('long.txt', { fullFile: true })).toContain(' line 0');
  });

  it('shows the very first commit, which has no parent', async () => {
    const root = git(repo.work, 'rev-list', '--max-parents=0', 'HEAD');

    const commit = await details(root);

    expect(commit.files).toEqual([{ path: 'readme.txt', status: 'added' }]);
    expect(await diffOf('readme.txt', {}, root)).toContain('+one');
  });

  it('shows a rename as a rename', async () => {
    git(repo.work, 'mv', 'readme.txt', 'renamed.txt');
    git(repo.work, 'commit', '-m', 'Rename');

    const { files } = await details();

    expect(files).toEqual([
      { path: 'renamed.txt', status: 'renamed', originalPath: 'readme.txt' },
    ]);
    const diff = await diffOf('renamed.txt', { originalPath: 'readme.txt' });
    expect(diff).toContain('rename from readme.txt');
  });

  it('shows what a merge brought in from its other branch', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'topic.txt', 'topic\n', 'Topic work');
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'main.txt', 'main\n', 'Main work');
    git(repo.work, 'merge', '--no-edit', 'topic');

    const commit = await details();

    expect(commit.parents).toHaveLength(2);
    expect(commit.files).toEqual([{ path: 'topic.txt', status: 'added' }]);
    expect(await diffOf('topic.txt')).toContain('+topic');
  });

  it('copes with a commit that changed nothing', async () => {
    git(repo.work, 'commit', '--allow-empty', '-m', 'Empty');
    expect((await details()).files).toEqual([]);
  });

  it('rejects anything that is not a commit hash', async () => {
    const { status } = await request('GET', `${repo.api}/commits/--all`);
    expect(status).toBe(400);
  });

  it('reports a hash that is not in the repository', async () => {
    const { status } = await request('GET', `${repo.api}/commits/${'0'.repeat(40)}`);
    expect(status).toBe(409);
  });
});

describe('staging parts of a file', () => {
  const NUMBERS = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
  const asFile = (lines) => `${lines.join('\n')}\n`;

  const write = (file, lines) => fs.writeFile(path.join(repo.work, file), asFile(lines));
  const stagedDiff = () => git(repo.work, 'diff', '--cached', '--unified=0');
  const indexContent = (file) => git(repo.work, 'show', `:${file}`);

  const readDiff = async (file, options = {}) => {
    const query = new URLSearchParams({ path: file, ...options });
    return (await request('GET', `${repo.api}/diff?${query}`)).body;
  };

  /** Stages the diff lines that `matches` picks, by their text. */
  const stageMatching = async (file, matches, options = {}) => {
    const { diff, hash } = await readDiff(file, options);
    const lines = diff.split('\n').flatMap((text, index) => (matches(text) ? [index] : []));
    return request('POST', `${repo.api}/stage-lines`, { path: file, hash, lines, ...options });
  };

  beforeEach(async () => {
    await write('numbers.txt', NUMBERS);
    git(repo.work, 'add', '--all');
    git(repo.work, 'commit', '-m', 'Add numbers');
  });

  it('stages one hunk and leaves the others unstaged', async () => {
    const edited = NUMBERS.with(1, 'second').with(24, 'twenty-fifth');
    await write('numbers.txt', edited);

    const { status } = await stageMatching('numbers.txt', (text) =>
      ['-line 2', '+second'].includes(text),
    );

    expect(status).toBe(204);
    expect(indexContent('numbers.txt')).toBe(asFile(NUMBERS.with(1, 'second')).trim());
    expect(git(repo.work, 'diff', '--unified=0')).toContain('+twenty-fifth');
    expect(await fs.readFile(path.join(repo.work, 'numbers.txt'), 'utf8')).toBe(asFile(edited));
  });

  it('stages a later hunk on its own, after lines were added above it', async () => {
    const edited = ['new top', ...NUMBERS.with(24, 'twenty-fifth')];
    await write('numbers.txt', edited);

    await stageMatching('numbers.txt', (text) => ['-line 25', '+twenty-fifth'].includes(text));

    expect(indexContent('numbers.txt')).toBe(asFile(NUMBERS.with(24, 'twenty-fifth')).trim());
  });

  it('stages one added line out of several in the same hunk', async () => {
    await write('numbers.txt', [...NUMBERS.slice(0, 5), 'keep', 'skip', ...NUMBERS.slice(5)]);

    await stageMatching('numbers.txt', (text) => text === '+keep');

    expect(indexContent('numbers.txt')).toBe(
      asFile([...NUMBERS.slice(0, 5), 'keep', ...NUMBERS.slice(5)]).trim(),
    );
  });

  it('stages a deleted line without staging the deletion next to it', async () => {
    await write('numbers.txt', NUMBERS.toSpliced(4, 2));

    await stageMatching('numbers.txt', (text) => text === '-line 5');

    expect(indexContent('numbers.txt')).toBe(asFile(NUMBERS.toSpliced(4, 1)).trim());
  });

  it('works from the whole-file diff that the other views show', async () => {
    await write('numbers.txt', NUMBERS.with(1, 'second').with(24, 'twenty-fifth'));

    await stageMatching('numbers.txt', (text) => ['-line 2', '+second'].includes(text), {
      fullFile: true,
    });

    expect(indexContent('numbers.txt')).toBe(asFile(NUMBERS.with(1, 'second')).trim());
  });

  it('unstages one line and leaves the rest staged', async () => {
    await write('numbers.txt', NUMBERS.with(1, 'second').with(24, 'twenty-fifth'));
    git(repo.work, 'add', '--all');

    const { status } = await stageMatching(
      'numbers.txt',
      (text) => ['-line 2', '+second'].includes(text),
      { staged: true },
    );

    expect(status).toBe(204);
    expect(indexContent('numbers.txt')).toBe(asFile(NUMBERS.with(24, 'twenty-fifth')).trim());
  });

  it('unstages one added line and keeps its neighbour', async () => {
    await write('numbers.txt', [...NUMBERS.slice(0, 5), 'keep', 'drop', ...NUMBERS.slice(5)]);
    git(repo.work, 'add', '--all');

    await stageMatching('numbers.txt', (text) => text === '+drop', { staged: true });

    expect(indexContent('numbers.txt')).toBe(
      asFile([...NUMBERS.slice(0, 5), 'keep', ...NUMBERS.slice(5)]).trim(),
    );
  });

  it('stages part of a new file', async () => {
    await write('new.txt', ['one', 'two', 'three']);

    const { status } = await stageMatching('new.txt', (text) => text === '+two', {
      untracked: true,
    });

    expect(status).toBe(204);
    expect(indexContent('new.txt')).toBe('two');
  });

  it('stages all of a new file', async () => {
    await write('new.txt', ['one', 'two']);

    await stageMatching('new.txt', (text) => /^\+[a-z]/.test(text), { untracked: true });

    expect(indexContent('new.txt')).toBe('one\ntwo');
  });

  it('stages part of a deleted file, without deleting it', async () => {
    await fs.rm(path.join(repo.work, 'numbers.txt'));

    const { status } = await stageMatching('numbers.txt', (text) => text === '-line 3');

    expect(status).toBe(204);
    expect(indexContent('numbers.txt')).toBe(asFile(NUMBERS.toSpliced(2, 1)).trim());
  });

  it('stages all of a deleted file as a deletion', async () => {
    await fs.rm(path.join(repo.work, 'numbers.txt'));

    await stageMatching('numbers.txt', (text) => /^-line/.test(text));

    expect(git(repo.work, 'status', '--porcelain', '--', 'numbers.txt')).toBe('D  numbers.txt');
  });

  it('unstages part of a staged new file, without removing it', async () => {
    await write('new.txt', ['one', 'two', 'three']);
    git(repo.work, 'add', '--all');

    const { status } = await stageMatching('new.txt', (text) => text === '+two', { staged: true });

    expect(status).toBe(204);
    expect(indexContent('new.txt')).toBe('one\nthree');
  });

  it('stages lines when git converts line endings', async () => {
    git(repo.work, 'config', 'core.autocrlf', 'true');
    await fs.writeFile(path.join(repo.work, 'numbers.txt'), asFile(NUMBERS).replaceAll('\n', '\r\n'));
    await fs.appendFile(path.join(repo.work, 'numbers.txt'), 'keep\r\nskip\r\n');

    const { status } = await stageMatching('numbers.txt', (text) => text.startsWith('+keep'));

    expect(status).toBe(204);
    expect(indexContent('numbers.txt')).toBe(asFile([...NUMBERS, 'keep']).trim());
  });

  it('stages lines of a file committed with Windows line endings', async () => {
    await fs.writeFile(path.join(repo.work, 'windows.txt'), 'one\r\ntwo\r\nthree\r\n');
    git(repo.work, 'add', '--all');
    git(repo.work, 'commit', '-m', 'Add windows file');
    await fs.writeFile(path.join(repo.work, 'windows.txt'), 'one\r\nkeep\r\nskip\r\ntwo\r\nthree\r\n');

    const { status } = await stageMatching('windows.txt', (text) => text.startsWith('+keep'));

    expect(status).toBe(204);
    expect(indexContent('windows.txt')).toBe('one\r\nkeep\r\ntwo\r\nthree');
  });

  it('refuses a selection made on a diff that has since changed', async () => {
    await write('numbers.txt', NUMBERS.with(1, 'second'));
    const { diff, hash } = await readDiff('numbers.txt');
    const lines = diff.split('\n').flatMap((text, index) => (text === '+second' ? [index] : []));
    await write('numbers.txt', ['edited meanwhile', ...NUMBERS.with(1, 'second')]);

    const { status, body } = await request('POST', `${repo.api}/stage-lines`, {
      path: 'numbers.txt',
      hash,
      lines,
    });

    expect(status).toBe(409);
    expect(body.error.message).toMatch(/has changed/);
    expect(stagedDiff()).toBe('');
  });

  it('refuses a selection with no changed lines in it', async () => {
    await write('numbers.txt', NUMBERS.with(1, 'second'));

    const { status } = await stageMatching('numbers.txt', (text) => text === ' line 1');

    expect(status).toBe(400);
    expect(stagedDiff()).toBe('');
  });

  it('rejects malformed line lists', async () => {
    await write('numbers.txt', NUMBERS.with(1, 'second'));
    const { hash } = await readDiff('numbers.txt');

    const { status } = await request('POST', `${repo.api}/stage-lines`, {
      path: 'numbers.txt',
      hash,
      lines: ['1'],
    });

    expect(status).toBe(400);
  });
});

describe('merging a branch that is behind its remote', () => {
  /** Leaves `branch` one commit behind origin, as if someone else had pushed. */
  async function fallBehind(branch) {
    git(repo.work, 'switch', branch);
    await writeAndCommit(repo.work, `${branch}.txt`, 'remote\n', `Pushed to ${branch}`);
    git(repo.work, 'push', '--set-upstream', 'origin', branch);
    git(repo.work, 'reset', '--hard', 'HEAD~1');
  }

  const head = (name) => git(repo.work, 'rev-parse', name);

  beforeEach(() => {
    git(repo.work, 'branch', 'topic');
  });

  it('cancels when the checked out branch is behind', async () => {
    await fallBehind('main');
    const before = head('main');

    const { status, body } = await request('POST', `${repo.api}/merge`, { branch: 'topic' });

    expect(status).toBe(409);
    expect(body.error.code).toBe('BRANCH_BEHIND');
    expect(body.error.message).toContain('main is 1 commit behind origin/main');
    expect(head('main')).toBe(before);
  });

  it('cancels when the branch being merged in is behind', async () => {
    await fallBehind('topic');
    git(repo.work, 'switch', 'main');

    const { status, body } = await request('POST', `${repo.api}/merge`, { branch: 'topic' });

    expect(status).toBe(409);
    expect(body.error.code).toBe('BRANCH_BEHIND');
  });

  it('cancels before switching when merging into a branch that is behind', async () => {
    await fallBehind('main');
    git(repo.work, 'switch', 'topic');

    const { status, body } = await request('POST', `${repo.api}/merge-into`, { target: 'main' });

    expect(status).toBe(409);
    expect(body.error.code).toBe('BRANCH_BEHIND');
    expect(git(repo.work, 'branch', '--show-current')).toBe('topic');
  });

  it('still merges a branch that is only behind the branch it merges into', async () => {
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'main.txt', 'more\n', 'Move main on');

    const { status } = await request('POST', `${repo.api}/merge`, { branch: 'topic' });

    expect(status).toBe(204);
  });
});

describe('merging', () => {
  async function createConflict() {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'readme.txt', 'theirs\n', 'Topic change');
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'readme.txt', 'ours\n', 'Main change');
  }

  describe('into another branch', () => {
    const currentBranch = () => git(repo.work, 'branch', '--show-current');

    it('merges the current branch into the target and stays there', async () => {
      git(repo.work, 'switch', '-c', 'topic');
      await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Topic work');

      const { status } = await request('POST', `${repo.api}/merge-into`, { target: 'main' });

      expect(status).toBe(204);
      expect(currentBranch()).toBe('main');
      expect(git(repo.work, 'log', '-1', '--format=%s')).toBe('Topic work');
    });

    it('creates a merge commit on request', async () => {
      git(repo.work, 'switch', '-c', 'topic');
      await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Topic work');

      await request('POST', `${repo.api}/merge-into`, { target: 'main', noFastForward: true });

      expect(git(repo.work, 'log', '-1', '--format=%s')).toBe("Merge branch 'topic'");
    });

    it('stays on the target to resolve conflicts', async () => {
      await createConflict();
      git(repo.work, 'switch', 'topic');

      const { status, body } = await request('POST', `${repo.api}/merge-into`, {
        target: 'main',
      });

      expect(status).toBe(409);
      expect(body.error.code).toBe('CONFLICTS');
      expect(currentBranch()).toBe('main');
      expect((await request('GET', `${repo.api}/status`)).body.operation).toBe('merge');
    });

    it('switches back when the merge fails for any other reason', async () => {
      git(repo.work, 'switch', '--orphan', 'unrelated');
      await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Unrelated work');
      git(repo.work, 'switch', 'main');

      const { status } = await request('POST', `${repo.api}/merge-into`, {
        target: 'unrelated',
      });

      expect(status).toBe(409);
      expect(currentBranch()).toBe('main');
    });

    it('stays put when the target cannot be checked out', async () => {
      const { status } = await request('POST', `${repo.api}/merge-into`, { target: 'missing' });

      expect(status).toBe(409);
      expect(currentBranch()).toBe('main');
    });

    it('needs a branch to merge', async () => {
      git(repo.work, 'switch', '--detach');

      const { status, body } = await request('POST', `${repo.api}/merge-into`, {
        target: 'main',
      });

      expect(status).toBe(409);
      expect(body.error.message).toMatch(/Check out a branch/);
    });

    it('rejects a target git would read as an option', async () => {
      const { status } = await request('POST', `${repo.api}/merge-into`, { target: '--detach' });
      expect(status).toBe(400);
    });
  });

  it('merges cleanly', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Topic work');
    git(repo.work, 'switch', 'main');

    const { status } = await request('POST', `${repo.api}/merge`, {
      branch: 'topic',
      noFastForward: true,
    });

    expect(status).toBe(204);
    expect(git(repo.work, 'log', '-1', '--format=%s')).toContain("Merge branch 'topic'");
  });

  it('reports conflicts and can abort the merge', async () => {
    await createConflict();

    const { status, body } = await request('POST', `${repo.api}/merge`, { branch: 'topic' });
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICTS');

    const { body: merging } = await request('GET', `${repo.api}/status`);
    expect(merging.operation).toBe('merge');
    expect(merging.conflicted.map((file) => file.path)).toEqual(['readme.txt']);

    await request('POST', `${repo.api}/operation/abort`, {});
    const { body: aborted } = await request('GET', `${repo.api}/status`);
    expect(aborted).toMatchObject({ operation: null, conflicted: [] });
  });

  it('finishes a merge once conflicts are resolved', async () => {
    await createConflict();
    await request('POST', `${repo.api}/merge`, { branch: 'topic' });
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'resolved\n');
    await request('POST', `${repo.api}/stage`, { paths: ['readme.txt'] });

    expect((await request('POST', `${repo.api}/operation/continue`, {})).status).toBe(204);

    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.operation).toBeNull();
  });

  it('reports rebase conflicts and can abort the rebase', async () => {
    await createConflict();

    const { body } = await request('POST', `${repo.api}/rebase`, { branch: 'topic' });
    expect(body.error.code).toBe('CONFLICTS');

    const { body: rebasing } = await request('GET', `${repo.api}/status`);
    expect(rebasing.operation).toBe('rebase');

    await request('POST', `${repo.api}/operation/abort`, {});
    const { body: aborted } = await request('GET', `${repo.api}/status`);
    expect(aborted.operation).toBeNull();
  });

  it('refuses to abort when nothing is in progress', async () => {
    expect((await request('POST', `${repo.api}/operation/abort`, {})).status).toBe(409);
  });
});

describe('stashing', () => {
  it('saves including untracked files, lists and pops', async () => {
    await fs.writeFile(path.join(repo.work, 'wip.txt'), 'wip\n');

    await request('POST', `${repo.api}/stash`, { message: 'parking this' });

    const { body: stashes } = await request('GET', `${repo.api}/stashes`);
    expect(stashes).toHaveLength(1);
    expect(stashes[0].message).toContain('parking this');
    const { body: clean } = await request('GET', `${repo.api}/status`);
    expect(clean.unstaged).toHaveLength(0);

    await request('POST', `${repo.api}/stash/pop`, {});
    const { body: restored } = await request('GET', `${repo.api}/status`);
    expect(restored.unstaged).toHaveLength(1);
  });
});

describe('managing individual stashes', () => {
  async function stashFile(file, message) {
    await fs.writeFile(path.join(repo.work, file), `${message}\n`);
    await request('POST', `${repo.api}/stash`, { message });
  }

  beforeEach(async () => {
    await stashFile('older.txt', 'older');
    await stashFile('newer.txt', 'newer');
  });

  it('lists stashes with their branch, newest first', async () => {
    const { body } = await request('GET', `${repo.api}/stashes`);
    expect(body.map(({ ref, message, branch }) => ({ ref, message, branch }))).toEqual([
      { ref: 'stash@{0}', message: 'newer', branch: 'main' },
      { ref: 'stash@{1}', message: 'older', branch: 'main' },
    ]);
  });

  it('applies a chosen stash and keeps it', async () => {
    await request('POST', `${repo.api}/stash/apply`, { ref: 'stash@{1}' });

    const { body: status } = await request('GET', `${repo.api}/status`);
    expect(status.unstaged.map((file) => file.path)).toEqual(['older.txt']);
    const { body: stashes } = await request('GET', `${repo.api}/stashes`);
    expect(stashes).toHaveLength(2);
  });

  it('pops a chosen stash and removes only that one', async () => {
    await request('POST', `${repo.api}/stash/pop`, { ref: 'stash@{1}' });

    const { body: stashes } = await request('GET', `${repo.api}/stashes`);
    expect(stashes.map((stash) => stash.message)).toEqual(['newer']);
  });

  it('drops a chosen stash without touching the working tree', async () => {
    await request('POST', `${repo.api}/stash/drop`, { ref: 'stash@{0}' });

    const { body: stashes } = await request('GET', `${repo.api}/stashes`);
    expect(stashes.map((stash) => stash.message)).toEqual(['older']);
    const { body: status } = await request('GET', `${repo.api}/status`);
    expect(status.unstaged).toHaveLength(0);
  });

  it('refuses anything that is not a stash reference', async () => {
    for (const ref of ['--all', 'main', 'stash@{0}; rm', undefined]) {
      const { status } = await request('POST', `${repo.api}/stash/drop`, { ref });
      expect(status).toBe(400);
    }
  });

  it('keeps a stash that conflicts and explains what to do', async () => {
    await writeAndCommit(repo.work, 'base.txt', 'base\n', 'Add base');
    await fs.writeFile(path.join(repo.work, 'base.txt'), 'stashed\n');
    await request('POST', `${repo.api}/stash`, { message: 'clash' });
    await writeAndCommit(repo.work, 'base.txt', 'committed\n', 'Change base');

    const { status, body } = await request('POST', `${repo.api}/stash/pop`, {});

    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICTS');
    expect(body.error.message).toContain('The stash has been kept');
    const { body: stashes } = await request('GET', `${repo.api}/stashes`);
    expect(stashes).toHaveLength(3);
  });
});

describe('stashing chosen files', () => {
  it('stashes only the files asked for, untracked ones included', async () => {
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'changed\n');
    await fs.writeFile(path.join(repo.work, 'keep [me].txt'), 'stay\n');
    await fs.writeFile(path.join(repo.work, 'park.txt'), 'park\n');

    const { status } = await request('POST', `${repo.api}/stash`, {
      message: 'some',
      paths: ['readme.txt', 'park.txt'],
    });
    expect(status).toBe(204);

    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.unstaged.map((file) => file.path)).toEqual(['keep [me].txt']);
    const { body: stashes } = await request('GET', `${repo.api}/stashes`);
    expect(stashes[0].message).toBe('some');
  });

  it('refuses files with nothing to stash', async () => {
    const { status } = await request('POST', `${repo.api}/stash`, { paths: ['readme.txt'] });
    expect(status).toBe(409);
  });
});

describe('discarding everything', () => {
  it('drops staged, unstaged and untracked changes but keeps ignored files', async () => {
    await writeAndCommit(repo.work, '.gitignore', 'build/\n', 'Ignore build');
    await fs.mkdir(path.join(repo.work, 'build'));
    await fs.writeFile(path.join(repo.work, 'build', 'out.js'), 'built\n');
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'staged\n');
    git(repo.work, 'add', 'readme.txt');
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'unstaged\n');
    await fs.mkdir(path.join(repo.work, 'new'));
    await fs.writeFile(path.join(repo.work, 'new', 'file.txt'), 'new\n');

    expect((await request('POST', `${repo.api}/discard-all`, {})).status).toBe(204);

    const { body } = await request('GET', `${repo.api}/status`);
    expect([...body.staged, ...body.unstaged]).toEqual([]);
    expect(await fs.readFile(path.join(repo.work, 'readme.txt'), 'utf8')).toBe('one\n');
    expect(await fs.readFile(path.join(repo.work, 'build', 'out.js'), 'utf8')).toBe('built\n');
  });
});

describe('ignoring files', () => {
  async function readIgnore() {
    return fs.readFile(path.join(repo.work, '.gitignore'), 'utf8');
  }

  it('adds a file, its folder or its extension to .gitignore, once each', async () => {
    await fs.mkdir(path.join(repo.work, 'logs'));
    await fs.writeFile(path.join(repo.work, 'logs', 'today.log'), 'x\n');
    await fs.writeFile(path.join(repo.work, 'secret.env'), 'x\n');

    await request('POST', `${repo.api}/ignore`, { paths: ['secret.env'], kind: 'file' });
    await request('POST', `${repo.api}/ignore`, { paths: ['secret.env'], kind: 'file' });
    await request('POST', `${repo.api}/ignore`, { paths: ['logs/today.log'], kind: 'extension' });

    expect(await readIgnore()).toBe('/secret.env\n*.log\n');
    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.unstaged.map((file) => file.path)).toEqual(['.gitignore']);
  });

  it('adds to an existing .gitignore without a trailing newline', async () => {
    await fs.writeFile(path.join(repo.work, '.gitignore'), 'node_modules');
    await fs.mkdir(path.join(repo.work, 'tmp'));
    await fs.writeFile(path.join(repo.work, 'tmp', 'a.txt'), 'x\n');

    await request('POST', `${repo.api}/ignore`, { paths: ['tmp/a.txt'], kind: 'folder' });
    expect(await readIgnore()).toBe('node_modules\n/tmp/\n');
  });

  it('refuses kinds it does not know and paths that would add rules', async () => {
    for (const body of [
      { paths: ['a.txt'], kind: 'everything' },
      { paths: ['a.txt\n*'], kind: 'file' },
      { paths: ['readme'], kind: 'extension' },
    ]) {
      expect((await request('POST', `${repo.api}/ignore`, body)).status).toBe(400);
    }
  });
});

describe('editing the latest commit message', () => {
  it('rewords it and leaves staged changes out of it', async () => {
    const hash = git(repo.work, 'rev-parse', 'HEAD');
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'staged\n');
    git(repo.work, 'add', 'readme.txt');

    const { status } = await request('POST', `${repo.api}/reword`, {
      hash,
      message: 'Better message',
    });
    expect(status).toBe(204);
    expect(git(repo.work, 'log', '-1', '--format=%s')).toBe('Better message');
    expect(git(repo.work, 'diff', '--cached', '--name-only')).toBe('readme.txt');
  });

  it('refuses any commit but the latest', async () => {
    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Second');
    const older = git(repo.work, 'rev-parse', 'HEAD~1');
    const { status } = await request('POST', `${repo.api}/reword`, { hash: older, message: 'x' });
    expect(status).toBe(409);
  });
});

describe('previewing a stash', () => {
  it('lists tracked and untracked files and shows each one’s diff', async () => {
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'two\n');
    await fs.writeFile(path.join(repo.work, 'new.txt'), 'fresh\n');
    await request('POST', `${repo.api}/stash`, { message: 'mixed' });
    const { body: stashes } = await request('GET', `${repo.api}/stashes`);
    const { hash, parents } = stashes[0];
    expect(parents[0]).toBe(git(repo.work, 'rev-parse', 'HEAD'));

    const { body: details } = await request('GET', `${repo.api}/stashes/${hash}`);
    expect(details.files.map(({ path: file, status }) => ({ file, status }))).toEqual([
      { file: 'readme.txt', status: 'modified' },
      { file: 'new.txt', status: 'untracked' },
    ]);

    const { body: tracked } = await request(
      'GET',
      `${repo.api}/stashes/${hash}/diff?path=readme.txt`,
    );
    expect(tracked.diff).toContain('+two');
    const { body: untracked } = await request(
      'GET',
      `${repo.api}/stashes/${hash}/diff?path=new.txt&untracked=true`,
    );
    expect(untracked.diff).toContain('+fresh');
  });

  it('refuses a hash that is not one', async () => {
    const { status } = await request('GET', `${repo.api}/stashes/--all`);
    expect(status).toBe(400);
  });
});

describe('patches', () => {
  it('turns a commit into a patch that git am can replay elsewhere', async () => {
    await writeAndCommit(repo.work, 'feature.txt', 'feature\n', 'Add feature');
    const hash = git(repo.work, 'rev-parse', 'HEAD');
    const { body } = await request('GET', `${repo.api}/patch?source=commit&hash=${hash}`);
    expect(body.fileName).toMatch(/add-feature\.patch$/);
    expect(body.patch).toContain('Subject: [PATCH] Add feature');

    git(repo.work, 'reset', '--hard', 'HEAD~1');
    const { status } = await request('POST', `${repo.api}/patch/apply`, {
      patch: body.patch,
      mode: 'commit',
    });
    expect(status).toBe(204);
    expect(git(repo.work, 'log', '-1', '--format=%s')).toBe('Add feature');
  });

  it('makes a patch of every uncommitted change without touching the index', async () => {
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'two\n');
    await fs.writeFile(path.join(repo.work, 'untracked.txt'), 'new\n');

    const { body } = await request('GET', `${repo.api}/patch?source=uncommitted`);
    expect(body.patch).toContain('+two');
    expect(body.patch).toContain('+new');
    expect(git(repo.work, 'diff', '--cached', '--name-only')).toBe('');

    git(repo.work, 'checkout', '--', 'readme.txt');
    await fs.rm(path.join(repo.work, 'untracked.txt'));
    await request('POST', `${repo.api}/patch/apply`, { patch: body.patch });
    expect(await fs.readFile(path.join(repo.work, 'readme.txt'), 'utf8')).toBe('two\n');
    expect(await fs.readFile(path.join(repo.work, 'untracked.txt'), 'utf8')).toBe('new\n');
  });

  it('makes a patch from a stash', async () => {
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'stashed\n');
    await request('POST', `${repo.api}/stash`, { message: 'keep' });

    const { body } = await request('GET', `${repo.api}/patch?source=stash&ref=stash@{0}`);
    expect(body.fileName).toBe('stash-0.patch');
    expect(body.patch).toContain('+stashed');
  });

  it('refuses to apply commits from a patch without commit details', async () => {
    const { status, body } = await request('POST', `${repo.api}/patch/apply`, {
      patch: 'diff --git a/x b/x\n',
      mode: 'commit',
    });
    expect(status).toBe(400);
    expect(body.error.message).toContain('no commit details');
  });

  it('reports a clean failure for a patch that does not fit', async () => {
    const patch = [
      'diff --git a/readme.txt b/readme.txt',
      '--- a/readme.txt',
      '+++ b/readme.txt',
      '@@ -1 +1 @@',
      '-something else',
      '+changed',
      '',
    ].join('\n');
    const { status } = await request('POST', `${repo.api}/patch/apply`, { patch });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await fs.readFile(path.join(repo.work, 'readme.txt'), 'utf8')).toBe('one\n');
  });
});

describe('worktrees', () => {
  const siblingOf = (name) => path.join(path.dirname(repo.work), name);
  const sameFolder = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

  it('lists the main working tree, marked as the one open', async () => {
    const { body } = await request('GET', `${repo.api}/worktrees`);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ branch: 'main', isMain: true, isCurrent: true, name: 'work' });
    expect(sameFolder(body[0].path, repo.work)).toBe(true);
  });

  it('adds one on a new branch, and marks that branch as checked out there', async () => {
    const folder = siblingOf('side');
    const { status, body } = await request('POST', `${repo.api}/worktrees`, {
      path: folder,
      newBranch: 'side',
      startPoint: 'main',
    });
    expect(status).toBe(201);
    expect(sameFolder(body.path, folder)).toBe(true);
    expect(await fs.readFile(path.join(folder, 'readme.txt'), 'utf8')).toBe('one\n');

    const { body: worktrees } = await request('GET', `${repo.api}/worktrees`);
    expect(worktrees.map(({ branch, isCurrent }) => ({ branch, isCurrent }))).toEqual([
      { branch: 'main', isCurrent: true },
      { branch: 'side', isCurrent: false },
    ]);
    const { body: branches } = await request('GET', `${repo.api}/branches`);
    const side = branches.local.find(({ name }) => name === 'side');
    expect(sameFolder(side.worktreePath, folder)).toBe(true);
  });

  it('checks out a remote branch with a local branch that tracks it', async () => {
    git(repo.work, 'switch', '-c', 'remote-only');
    git(repo.work, 'push', '-u', 'origin', 'remote-only');
    git(repo.work, 'switch', 'main');
    git(repo.work, 'branch', '-D', 'remote-only');

    const folder = siblingOf('tracking');
    await request('POST', `${repo.api}/worktrees`, { path: folder, branch: 'origin/remote-only' });
    expect(git(folder, 'rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/remote-only');
  });

  it('refuses a folder with files in it, or one given as a relative path', async () => {
    for (const folder of [repo.work, 'relative/folder']) {
      const { status } = await request('POST', `${repo.api}/worktrees`, {
        path: folder,
        newBranch: 'x',
      });
      expect(status).toBe(400);
    }
  });

  it('locks, unlocks and removes one, but asks for force when it has changes', async () => {
    const folder = siblingOf('temp');
    await request('POST', `${repo.api}/worktrees`, { path: folder, newBranch: 'temp' });

    await request('POST', `${repo.api}/worktrees/lock`, { path: folder, reason: 'travelling' });
    let { body } = await request('GET', `${repo.api}/worktrees`);
    expect(body[1]).toMatchObject({ locked: true, lockReason: 'travelling' });
    await request('POST', `${repo.api}/worktrees/unlock`, { path: folder });

    await fs.writeFile(path.join(folder, 'wip.txt'), 'wip\n');
    const refused = await request('POST', `${repo.api}/worktrees/remove`, { path: folder });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('uncommitted changes');

    const removed = await request('POST', `${repo.api}/worktrees/remove`, {
      path: folder,
      force: true,
    });
    expect(removed.status).toBe(204);
    ({ body } = await request('GET', `${repo.api}/worktrees`));
    expect(body).toHaveLength(1);
    expect(await fs.stat(folder).catch(() => null)).toBeNull();
  });

  it('never removes the main working tree or a folder that is not one', async () => {
    for (const folder of [repo.work, sandbox]) {
      const { status } = await request('POST', `${repo.api}/worktrees/remove`, {
        path: folder,
        force: true,
      });
      expect(status).toBe(400);
    }
    expect(await fs.stat(repo.work)).toBeTruthy();
  });

  it('prunes working trees whose folders were deleted outside git', async () => {
    const folder = siblingOf('vanished');
    await request('POST', `${repo.api}/worktrees`, { path: folder, newBranch: 'vanished' });
    await fs.rm(folder, { recursive: true, force: true });

    let { body } = await request('GET', `${repo.api}/worktrees`);
    expect(body[1].prunable).toBe(true);
    await request('POST', `${repo.api}/worktrees/prune`, {});
    ({ body } = await request('GET', `${repo.api}/worktrees`));
    expect(body).toHaveLength(1);
  });
});

describe('history across branches', () => {
  it('covers every branch without a ref, and one branch with it', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Topic work');
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Main work');

    const { body: all } = await request('GET', `${repo.api}/commits`);
    const { body: main } = await request('GET', `${repo.api}/commits?ref=main`);

    expect(all.map((commit) => commit.subject).sort()).toEqual([
      'Initial commit',
      'Main work',
      'Topic work',
    ]);
    expect(main.map((commit) => commit.subject)).toEqual(['Main work', 'Initial commit']);
  });

  it('leaves stashes out of the history', async () => {
    await fs.writeFile(path.join(repo.work, 'wip.txt'), 'wip\n');
    await request('POST', `${repo.api}/stash`, { message: 'hidden' });

    const { body } = await request('GET', `${repo.api}/commits`);

    expect(body.map((commit) => commit.subject)).toEqual(['Initial commit']);
  });

  it('keeps the summary on the current branch', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Topic work');
    git(repo.work, 'switch', 'main');

    const { body } = await request('GET', repo.api);

    expect(body.summary.lastCommit.subject).toBe('Initial commit');
  });
});

describe('undoing the latest commit', () => {
  const lastCommit = async () => (await request('GET', `${repo.api}/last-commit`)).body;
  const undo = (body) => request('POST', `${repo.api}/undo-commit`, body);
  const subject = () => git(repo.work, 'log', '-1', '--format=%s');

  it('takes the commit back and leaves its changes staged', async () => {
    await writeAndCommit(repo.work, 'new.txt', 'new\n', 'Add new');
    const { hash, pushed } = await lastCommit();

    const { status } = await undo({ hash });

    expect(pushed).toBe(false);
    expect(status).toBe(204);
    expect(subject()).toBe('Initial commit');
    expect(git(repo.work, 'status', '--porcelain')).toBe('A  new.txt');
  });

  it('reports the whole message, so it can be used again', async () => {
    await fs.writeFile(path.join(repo.work, 'new.txt'), 'new\n');
    git(repo.work, 'add', '--all');
    git(repo.work, 'commit', '--message', 'Add new', '--message', 'With a reason why.');

    const { subject: title, message } = await lastCommit();

    expect(title).toBe('Add new');
    expect(message).toBe('Add new\n\nWith a reason why.');
  });

  it('leaves other work in progress as it was', async () => {
    await writeAndCommit(repo.work, 'new.txt', 'new\n', 'Add new');
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'edited\n');
    const { hash } = await lastCommit();

    await undo({ hash });

    expect(git(repo.work, 'status', '--porcelain').split('\n').sort()).toEqual([
      ' M readme.txt',
      'A  new.txt',
    ]);
    expect(await fs.readFile(path.join(repo.work, 'readme.txt'), 'utf8')).toBe('edited\n');
  });

  it('can undo several commits in turn', async () => {
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Add a');
    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Add b');

    await undo({ hash: (await lastCommit()).hash });
    await undo({ hash: (await lastCommit()).hash });

    expect(subject()).toBe('Initial commit');
    expect(git(repo.work, 'status', '--porcelain').split('\n').sort()).toEqual([
      'A  a.txt',
      'A  b.txt',
    ]);
  });

  it('needs permission to undo a commit a remote already has', async () => {
    const { hash, pushed } = await lastCommit();
    expect(pushed).toBe(true);

    const refused = await undo({ hash });
    expect(refused.status).toBe(409);
    expect(subject()).toBe('Initial commit');

    expect((await undo({ hash, allowPushed: true })).status).toBe(204);
    expect((await lastCommit())).toBeNull();
  });

  it('refuses when the latest commit is not the one the user saw', async () => {
    await writeAndCommit(repo.work, 'a.txt', 'a\n', 'Add a');
    const { hash } = await lastCommit();
    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Add b');

    const { status, body } = await undo({ hash });

    expect(status).toBe(409);
    expect(body.error.message).toMatch(/has changed/);
    expect(subject()).toBe('Add b');
  });

  it('refuses during a merge', async () => {
    git(repo.work, 'switch', '--create', 'topic');
    await writeAndCommit(repo.work, 'readme.txt', 'theirs\n', 'Change on topic');
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'readme.txt', 'ours\n', 'Change on main');
    await request('POST', `${repo.api}/merge`, { branch: 'topic' });
    const { hash } = await lastCommit();

    const { status, body } = await undo({ hash });

    expect(status).toBe(409);
    expect(body.error.message).toMatch(/Finish the merge/);
  });

  it('rejects a malformed hash', async () => {
    expect((await undo({ hash: '--hard' })).status).toBe(400);
  });
});

describe('committing during a conflict', () => {
  it('refuses, even with stage all, so markers cannot be committed', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'readme.txt', 'theirs\n', 'Topic change');
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'readme.txt', 'ours\n', 'Main change');
    await request('POST', `${repo.api}/merge`, { branch: 'topic' });

    const { status, body } = await request('POST', `${repo.api}/commit`, {
      message: 'oops',
      stageAll: true,
    });

    expect(status).toBe(409);
    expect(body.error.message).toContain('Resolve the conflicts');
    const { body: state } = await request('GET', `${repo.api}/status`);
    expect(state.conflicted).toHaveLength(1);
  });
});

describe('resolving a conflict', () => {
  beforeEach(async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'readme.txt', 'theirs\n', 'Topic change');
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'readme.txt', 'ours\n', 'Main change');
    await request('POST', `${repo.api}/merge`, { branch: 'topic' });
  });

  it('reads every version of the file and names both branches', async () => {
    const { status, body } = await request('GET', `${repo.api}/conflict?path=readme.txt`);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      path: 'readme.txt',
      base: 'one\n',
      ours: 'ours\n',
      theirs: 'theirs\n',
      labels: { ours: 'main', theirs: 'topic' },
      binary: false,
    });
    expect(body.working).toContain('<<<<<<<');
  });

  it('writes the resolved file and marks it resolved', async () => {
    const { status } = await request('POST', `${repo.api}/resolve-conflict`, {
      path: 'readme.txt',
      content: 'ours\ntheirs\n',
    });

    expect(status).toBe(204);
    expect(await fs.readFile(path.join(repo.work, 'readme.txt'), 'utf8')).toBe('ours\ntheirs\n');
    const { body: state } = await request('GET', `${repo.api}/status`);
    expect(state.conflicted).toHaveLength(0);
    expect(state.staged.map((file) => file.path)).toContain('readme.txt');
  });

  it('can take one side whole', async () => {
    await request('POST', `${repo.api}/resolve-conflict`, { path: 'readme.txt', side: 'theirs' });

    expect(await fs.readFile(path.join(repo.work, 'readme.txt'), 'utf8')).toBe('theirs\n');
  });

  it('refuses a file that has no conflict', async () => {
    const { status } = await request('GET', `${repo.api}/conflict?path=other.txt`);
    const write = await request('POST', `${repo.api}/resolve-conflict`, {
      path: '../escape.txt',
      content: 'x',
    });

    expect(status).toBe(400);
    expect(write.status).toBe(400);
  });
});

describe('stashing a clean tree', () => {
  it('reports that there was nothing to stash', async () => {
    const { status, body } = await request('POST', `${repo.api}/stash`, {});
    expect(status).toBe(409);
    expect(body.error.message).toContain('no changes to stash');
  });
});

describe('empty repositories', () => {
  it('handles a repository with no commits', async () => {
    const empty = path.join(sandbox, 'empty');
    await fs.mkdir(empty);
    git(empty, 'init', '--initial-branch=main');

    const { body: linked } = await request('POST', '/api/repositories', { path: empty });
    expect(linked).toMatchObject({ available: true, summary: { branch: 'main', lastCommit: null } });

    const { body: commits } = await request('GET', `/api/repositories/${linked.id}/commits`);
    expect(commits).toEqual([]);

    const { body: last } = await request('GET', `/api/repositories/${linked.id}/last-commit`);
    expect(last).toBeNull();
  });
});

describe('folder browsing', () => {
  it('lists folders and marks repositories', async () => {
    const root = path.dirname(repo.work);
    const { body } = await request(
      'GET',
      `/api/filesystem/directories?path=${encodeURIComponent(root)}`,
    );
    expect(body.directories.find((directory) => directory.name === 'work').isRepository).toBe(true);
    expect(body.parent).toBe(path.dirname(root));
  });
});

describe('acting on a commit', () => {
  const head = () => git(repo.work, 'rev-parse', 'HEAD');
  const post = (route, body) => request('POST', `${repo.api}${route}`, body);

  it('checks out a commit without a branch', async () => {
    const first = head();
    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Second');

    expect((await post('/checkout-commit', { hash: first })).status).toBe(204);
    expect(head()).toBe(first);
    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.branch).toBeNull();
  });

  it('cherry-picks a commit from another branch', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'topic.txt', 'topic\n', 'Topic work');
    const picked = head();
    git(repo.work, 'switch', 'main');

    expect((await post('/cherry-pick', { hash: picked })).status).toBe(204);
    expect(git(repo.work, 'log', '-1', '--format=%s')).toBe('Topic work');
    expect(git(repo.work, 'status', '--porcelain')).toBe('');
  });

  it('leaves nothing half done when the branch already has the changes', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'topic.txt', 'topic\n', 'Topic work');
    const picked = head();
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'topic.txt', 'topic\n', 'Same work');

    expect((await post('/cherry-pick', { hash: picked })).status).toBe(409);
    const { body } = await request('GET', `${repo.api}/status`);
    expect(body.operation).toBeNull();
  });

  it('pauses a conflicted cherry-pick until it is finished', async () => {
    git(repo.work, 'switch', '-c', 'topic');
    await writeAndCommit(repo.work, 'readme.txt', 'topic\n', 'Topic edit');
    const picked = head();
    git(repo.work, 'switch', 'main');
    await writeAndCommit(repo.work, 'readme.txt', 'main\n', 'Main edit');

    const { status, body } = await post('/cherry-pick', { hash: picked });
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICTS');
    expect((await request('GET', `${repo.api}/status`)).body.operation).toBe('cherry-pick');

    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'both\n');
    git(repo.work, 'add', 'readme.txt');
    expect((await post('/operation/continue')).status).toBe(204);
    expect(git(repo.work, 'log', '-1', '--format=%s')).toBe('Topic edit');
  });

  it('resets softly, keeping later changes staged', async () => {
    const first = head();
    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Second');

    expect((await post('/reset', { hash: first, mode: 'soft' })).status).toBe(204);
    expect(head()).toBe(first);
    expect(git(repo.work, 'status', '--porcelain')).toBe('A  b.txt');
  });

  it('resets hard, discarding later and uncommitted changes', async () => {
    const first = head();
    await writeAndCommit(repo.work, 'b.txt', 'b\n', 'Second');
    await fs.writeFile(path.join(repo.work, 'readme.txt'), 'edited\n');

    expect((await post('/reset', { hash: first, mode: 'hard' })).status).toBe(204);
    expect(head()).toBe(first);
    expect(git(repo.work, 'status', '--porcelain')).toBe('');
  });

  it('refuses an unknown reset mode', async () => {
    expect((await post('/reset', { hash: head(), mode: 'mixed' })).status).toBe(400);
  });
});

describe('scripts from .gitty', () => {
  it('lists nothing without a .gitty file', async () => {
    const { status, body } = await request('GET', `${repo.api}/scripts`);
    expect(status).toBe(200);
    expect(body.found).toBe(false);
  });

  it('lists and runs the scripts a .gitty file names, in the repository folder', async () => {
    await fs.writeFile(path.join(repo.work, 'where.js'), 'console.log(process.cwd());\n');
    await fs.writeFile(
      path.join(repo.work, '.gitty'),
      JSON.stringify({
        scripts: [
          { name: 'Where', path: 'where.js', description: 'Prints the folder' },
          { name: 'Fail', command: 'node -e "process.exit(3)"' },
        ],
      }),
    );

    const listed = await request('GET', `${repo.api}/scripts`);
    expect(listed.body.found).toBe(true);
    expect(listed.body.scripts.map(({ name }) => name)).toEqual(['Where', 'Fail']);

    const where = await request('POST', `${repo.api}/scripts/run`, { name: 'Where' });
    expect(where.status).toBe(200);
    expect(where.body.exitCode).toBe(0);
    expect(await fs.realpath(where.body.output.trim())).toBe(await fs.realpath(repo.work));

    const fail = await request('POST', `${repo.api}/scripts/run`, { name: 'Fail' });
    expect(fail.body.exitCode).toBe(3);
  });

  it('runs terminal commands in bash, passing args and stopping at the first failure', async () => {
    await fs.writeFile(
      path.join(repo.work, '.gitty'),
      JSON.stringify({
        scripts: [
          {
            name: 'Bash',
            shell: 'bash',
            command: ['git rev-parse --abbrev-ref HEAD', 'echo "got:" "$GITTY_SCRIPT_NAME"'],
            args: ["it's here"],
          },
          { name: 'Stops', shell: 'bash', command: ['echo first', 'false', 'echo never'] },
        ],
      }),
    );
    const run = async (name) =>
      (await request('POST', `${repo.api}/scripts/run`, { name })).body;

    const bash = await run('Bash');
    expect(bash.exitCode).toBe(0);
    expect(bash.output.trim().split('\n')).toEqual(['main', "got: Bash it's here"]);

    const stops = await run('Stops');
    expect(stops.exitCode).toBe(1);
    expect(stops.output.trim()).toBe('first');
  });

  it.runIf(process.platform === 'win32')('runs terminal commands in PowerShell', async () => {
    await fs.writeFile(
      path.join(repo.work, '.gitty'),
      JSON.stringify({
        scripts: [
          { name: 'Ps', shell: 'powershell', command: ['$x = "a b"', 'Write-Output "$x"'], args: ["c'd"] },
          { name: 'PsFail', shell: 'powershell', command: ['git not-a-command', 'Write-Output never'] },
        ],
      }),
    );
    const run = async (name) =>
      (await request('POST', `${repo.api}/scripts/run`, { name })).body;

    const ps = await run('Ps');
    expect(ps.exitCode).toBe(0);
    expect(ps.output.trim().split(/\r?\n/)).toEqual(['a b', "c'd"]);

    const fail = await run('PsFail');
    expect(fail.exitCode).not.toBe(0);
    expect(fail.output).not.toContain('never');
  });

  it('refuses a script the .gitty file does not list', async () => {
    await fs.writeFile(path.join(repo.work, '.gitty'), JSON.stringify({ scripts: {} }));
    const { status } = await request('POST', `${repo.api}/scripts/run`, { name: 'rm -rf /' });
    expect(status).toBe(404);
  });
});
