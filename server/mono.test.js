import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { RepositoryStore } from './store/repositoryStore.js';

let sandbox;
let server;
let baseUrl;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function request(method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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

let groupCount = 0;

/** Creates a repository named `name` with one commit, pushed to its own bare remote. */
async function createRepository(root, name, groupId) {
  const remote = path.join(root, `${name}.git`);
  const work = path.join(root, name);
  await fs.mkdir(work, { recursive: true });
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(work, 'init', '--initial-branch=main');
  git(work, 'config', 'user.name', 'Test');
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'commit.gpgsign', 'false');
  git(work, 'config', 'core.autocrlf', 'false');
  git(work, 'remote', 'add', 'origin', remote);
  await writeAndCommit(work, 'readme.txt', 'one\n', `Initial commit of ${name}`);
  git(work, 'push', '-u', 'origin', 'main');

  const { body } = await request('POST', '/api/repositories', { path: work });
  await request('PUT', `/api/repositories/${body.id}/group`, { groupId });
  return { name, work, id: body.id, api: `/api/repositories/${body.id}` };
}

/** A group of api, web and docs, all on main, opened as a mono repo. */
async function createMono() {
  groupCount += 1;
  const root = path.join(sandbox, `group-${groupCount}`);
  await fs.mkdir(root);
  const { body: group } = await request('POST', '/api/repositories/groups', {
    name: `Group ${groupCount}`,
  });
  const api = await createRepository(root, 'api', group.id);
  const web = await createRepository(root, 'web', group.id);
  const docs = await createRepository(root, 'docs', group.id);
  const { body: opened } = await request('POST', `/api/repositories/groups/${group.id}/mono`, {
    branch: 'main',
  });
  return { group, api, web, docs, id: opened.id, route: `/api/repositories/${opened.id}` };
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-mono-test-'));
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

let mono;

beforeEach(async () => {
  mono = await createMono();
});

const getStatus = async () => (await request('GET', `${mono.route}/status`)).body;
const getBranches = async () => (await request('GET', `${mono.route}/branches`)).body;
const localNames = ({ local }) => local.map(({ name }) => name);

describe('opening a group as a mono repo', () => {
  it('describes itself under the name of its group', async () => {
    const { status, body } = await request('GET', mono.route);
    expect(status).toBe(200);
    expect(body).toMatchObject({ name: mono.group.name, isMono: true, available: true });
  });

  it('refuses a branch no repository in the group is on', async () => {
    const { status, body } = await request(
      'POST',
      `/api/repositories/groups/${mono.group.id}/mono`,
      { branch: 'nope' },
    );
    expect(status).toBe(400);
    expect(body.error.message).toContain('nope');
  });

  it('is not found for a group that was never opened', async () => {
    const { body: group } = await request('POST', '/api/repositories/groups', { name: 'Unopened' });
    const { status } = await request('GET', `/api/repositories/mono-${group.id}/status`);
    expect(status).toBe(404);
  });

  it('only takes in repositories on the same branch', async () => {
    git(mono.web.work, 'switch', '--create', 'dev');
    const { mono: parts } = await getStatus();
    expect(parts.members.map(({ name }) => name)).toEqual(['api', 'docs']);
    expect(parts.leftOut).toEqual([
      expect.objectContaining({ name: 'web', branch: 'dev', canJoin: true }),
    ]);
  });

  it('says when a left out repository has no copy of the branch to join with', async () => {
    git(mono.web.work, 'switch', '--create', 'dev');
    git(mono.web.work, 'branch', '--delete', 'main');
    const { mono: parts } = await getStatus();
    expect(parts.leftOut[0].canJoin).toBe(false);
  });

  it('notices a repository whose folder has gone', async () => {
    await fs.rm(mono.web.work, { recursive: true, force: true, maxRetries: 5 });
    const { mono: parts } = await getStatus();
    expect(parts.leftOut).toEqual([expect.objectContaining({ name: 'web', missing: true })]);
  });

  it('is unavailable once nothing is left on the branch', async () => {
    for (const { work } of [mono.api, mono.web, mono.docs]) git(work, 'switch', '--create', 'x');
    const { body } = await request('GET', mono.route);
    expect(body.available).toBe(false);
  });

  it('gives two repositories of the same name their own folders', async () => {
    const root = path.join(sandbox, `same-name-${mono.group.id}`);
    await fs.mkdir(root);
    const twin = await createRepository(root, 'api', mono.group.id);
    await fs.writeFile(path.join(mono.api.work, 'a.txt'), 'a\n');
    await fs.writeFile(path.join(twin.work, 'b.txt'), 'b\n');
    const { unstaged } = await getStatus();
    expect(unstaged.map(({ path: file }) => file).sort()).toEqual(['api-2/b.txt', 'api/a.txt']);
  });
});

describe('the sidebar', () => {
  it('only lists branches every member has', async () => {
    for (const { work } of [mono.api, mono.web, mono.docs]) git(work, 'branch', 'shared');
    git(mono.api.work, 'branch', 'api-only');
    git(mono.web.work, 'branch', 'web-only');
    expect(localNames(await getBranches()).sort()).toEqual(['main', 'shared']);
  });

  it('ignores the branches of repositories that were left out', async () => {
    git(mono.api.work, 'branch', 'shared');
    git(mono.docs.work, 'branch', 'shared');
    git(mono.web.work, 'switch', '--create', 'dev');
    expect(localNames(await getBranches())).toContain('shared');
  });

  it('lists a shared remote branch, and adds up how far ahead a branch is', async () => {
    await writeAndCommit(mono.api.work, 'a.txt', 'a\n', 'Local work');
    await writeAndCommit(mono.web.work, 'w.txt', 'w\n', 'Local work');
    const { local, remote } = await getBranches();
    expect(local.find(({ name }) => name === 'main')).toMatchObject({ isCurrent: true, ahead: 2 });
    expect(remote.map(({ name }) => name)).toContain('origin/main');
  });
});

describe('staging and committing', () => {
  beforeEach(async () => {
    await fs.writeFile(path.join(mono.api.work, 'server.js'), 'one\n');
    await fs.writeFile(path.join(mono.web.work, 'client.js'), 'two\n');
  });

  it('shows changes from every member under its own folder', async () => {
    const { unstaged } = await getStatus();
    expect(unstaged).toEqual([
      expect.objectContaining({ path: 'api/server.js', repository: 'api' }),
      expect.objectContaining({ path: 'web/client.js', repository: 'web' }),
    ]);
  });

  it('stages files from several repositories at once', async () => {
    await request('POST', `${mono.route}/stage`, { paths: ['api/server.js', 'web/client.js'] });
    expect(git(mono.api.work, 'diff', '--cached', '--name-only')).toBe('server.js');
    expect(git(mono.web.work, 'diff', '--cached', '--name-only')).toBe('client.js');
  });

  it('commits to every staged repository with one message, and to no others', async () => {
    await request('POST', `${mono.route}/stage`, { paths: ['api/server.js', 'web/client.js'] });
    const docsHead = git(mono.docs.work, 'rev-parse', 'HEAD');

    const { status } = await request('POST', `${mono.route}/commit`, { message: 'Ship it' });

    expect(status).toBe(204);
    expect(git(mono.api.work, 'log', '-1', '--format=%s')).toBe('Ship it');
    expect(git(mono.web.work, 'log', '-1', '--format=%s')).toBe('Ship it');
    expect(git(mono.docs.work, 'rev-parse', 'HEAD')).toBe(docsHead);
  });

  it('leaves unstaged files alone', async () => {
    await request('POST', `${mono.route}/stage`, { paths: ['api/server.js'] });
    await request('POST', `${mono.route}/commit`, { message: 'Only api' });
    const { staged, unstaged } = await getStatus();
    expect(staged).toEqual([]);
    expect(unstaged.map(({ path: file }) => file)).toEqual(['web/client.js']);
  });

  it('can stage everything as part of the commit', async () => {
    await request('POST', `${mono.route}/commit`, { message: 'All of it', stageAll: true });
    expect(git(mono.api.work, 'log', '-1', '--format=%s')).toBe('All of it');
    expect(git(mono.web.work, 'log', '-1', '--format=%s')).toBe('All of it');
  });

  it('commits nowhere while any member is conflicted', async () => {
    git(mono.web.work, 'switch', '--create', 'theirs');
    await writeAndCommit(mono.web.work, 'readme.txt', 'theirs\n', 'Theirs');
    git(mono.web.work, 'switch', 'main');
    await writeAndCommit(mono.web.work, 'readme.txt', 'ours\n', 'Ours');
    expect(() => git(mono.web.work, 'merge', 'theirs')).toThrow();
    await request('POST', `${mono.route}/stage`, { paths: ['api/server.js'] });

    const { status, body } = await request('POST', `${mono.route}/commit`, { message: 'Nope' });

    expect(status).toBe(409);
    expect(body.error.message).toContain('web');
    expect(git(mono.api.work, 'log', '-1', '--format=%s')).toBe('Initial commit of api');
  });

  it('says what went through when a hook stops one repository', async () => {
    await fs.writeFile(path.join(mono.web.work, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    await request('POST', `${mono.route}/stage`, { paths: ['api/server.js', 'web/client.js'] });

    const { status, body } = await request('POST', `${mono.route}/commit`, { message: 'Halfway' });

    expect(status).toBe(409);
    expect(body.error.code).toBe('PARTIAL');
    expect(body.error.message).toContain('Committed to api.');
    expect(body.error.message).toContain('web:');
    const { staged } = await getStatus();
    expect(staged.map(({ path: file }) => file)).toEqual(['web/client.js']);
  });

  it('needs a message and something to commit', async () => {
    await request('POST', `${mono.route}/stage`, { paths: ['api/server.js'] });
    expect((await request('POST', `${mono.route}/commit`, { message: ' ' })).status).toBe(400);
    await request('POST', `${mono.route}/unstage`);
    expect((await request('POST', `${mono.route}/commit`, { message: 'x' })).status).toBe(409);
  });

  it('does not amend across repositories', async () => {
    const { status } = await request('POST', `${mono.route}/commit`, {
      message: 'x',
      amend: true,
    });
    expect(status).toBe(400);
  });

  it('shows and stages lines of a diff through the folder path', async () => {
    await writeAndCommit(mono.api.work, 'lines.txt', 'a\nb\n', 'Lines');
    await fs.writeFile(path.join(mono.api.work, 'lines.txt'), 'a\nb\nc\nd\n');
    const query = new URLSearchParams({ path: 'api/lines.txt' });
    const { body } = await request('GET', `${mono.route}/diff?${query}`);
    const lines = body.diff.split('\n');

    const { status } = await request('POST', `${mono.route}/stage-lines`, {
      path: 'api/lines.txt',
      hash: body.hash,
      lines: [lines.indexOf('+c')],
    });

    expect(status).toBe(204);
    expect(git(mono.api.work, 'diff', '--cached')).toContain('+c');
    expect(git(mono.api.work, 'diff', '--cached')).not.toContain('+d');
  });

  it('refuses a path outside its members', async () => {
    const { status } = await request('POST', `${mono.route}/stage`, { paths: ['nowhere/x.txt'] });
    expect(status).toBe(400);
  });

  it('discards in the right repository', async () => {
    await request('POST', `${mono.route}/discard`, { paths: ['web/client.js'] });
    const { unstaged } = await getStatus();
    expect(unstaged.map(({ path: file }) => file)).toEqual(['api/server.js']);
  });
});

describe('history', () => {
  const getCommits = async (query = '') =>
    (await request('GET', `${mono.route}/commits${query}`)).body;

  it('merges every member, marking which one each commit is from', async () => {
    const commits = await getCommits();
    expect(commits.map(({ repository }) => repository).sort()).toEqual(['api', 'docs', 'web']);
  });

  it('keeps children before their parents', async () => {
    await writeAndCommit(mono.api.work, 'a.txt', 'a\n', 'Second');
    const commits = await getCommits();
    const child = commits.findIndex(({ subject }) => subject === 'Second');
    const parent = commits.findIndex(({ hash }) => hash === commits[child].parents[0]);
    expect(child).toBeLessThan(parent);
  });

  it('pages without repeating or losing commits', async () => {
    await writeAndCommit(mono.api.work, 'a.txt', 'a\n', 'Second');
    const all = await getCommits();
    const first = await getCommits('?limit=2');
    const second = await getCommits('?limit=2&skip=2');
    expect([...first, ...second].map(({ hash }) => hash)).toEqual(all.map(({ hash }) => hash));
  });

  it('leaves out branches that are not shared', async () => {
    git(mono.api.work, 'switch', '--create', 'api-only');
    await writeAndCommit(mono.api.work, 'a.txt', 'a\n', 'Not shared');
    git(mono.api.work, 'switch', 'main');
    const commits = await getCommits();
    expect(commits.map(({ subject }) => subject)).not.toContain('Not shared');
  });

  it('hides labels of unshared branches on shared commits', async () => {
    git(mono.api.work, 'branch', 'api-only');
    const commits = await getCommits();
    const names = commits.flatMap(({ refs }) => refs.map(({ name }) => name));
    expect(names).not.toContain('api-only');
    expect(names).toContain('main');
  });

  it('opens a commit and its diff by the hash from the list', async () => {
    const [commit] = await getCommits();
    const { status, body } = await request('GET', `${mono.route}/commits/${commit.hash}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ hash: commit.hash, repository: commit.repository });

    const query = new URLSearchParams({ path: 'readme.txt' });
    const diff = await request('GET', `${mono.route}/commits/${commit.hash}/diff?${query}`);
    expect(diff.body.diff).toContain('+one');
  });

  it('tells apart the same commit in two members', async () => {
    const root = path.join(sandbox, `fork-${mono.group.id}`);
    const work = path.join(root, 'fork');
    await fs.mkdir(root);
    git(root, 'clone', mono.api.work, work);
    const { body } = await request('POST', '/api/repositories', { path: work });
    await request('PUT', `/api/repositories/${body.id}/group`, { groupId: mono.group.id });

    const commits = await getCommits();
    expect(new Set(commits.map(({ hash }) => hash)).size).toBe(commits.length);
  });
});

describe('branch actions', () => {
  const allBranches = () =>
    [mono.api, mono.web, mono.docs].map(({ work }) => git(work, 'branch', '--show-current'));

  it('checks out a shared branch everywhere and follows it', async () => {
    for (const { work } of [mono.api, mono.web, mono.docs]) git(work, 'branch', 'next');
    const { status } = await request('POST', `${mono.route}/checkout`, { branch: 'next' });
    expect(status).toBe(204);
    expect(allBranches()).toEqual(['next', 'next', 'next']);
    expect((await getStatus()).branch).toBe('next');
  });

  it('puts everything back if one repository cannot switch', async () => {
    for (const { work } of [mono.api, mono.web, mono.docs]) git(work, 'branch', 'next');
    git(mono.docs.work, 'switch', 'next');
    await writeAndCommit(mono.docs.work, 'readme.txt', 'changed\n', 'Change');
    git(mono.docs.work, 'switch', 'main');
    await fs.writeFile(path.join(mono.docs.work, 'readme.txt'), 'dirty\n');

    const { status, body } = await request('POST', `${mono.route}/checkout`, { branch: 'next' });

    expect(status).toBe(409);
    expect(body.error.message).toContain('stayed on main');
    expect(body.error.message).toContain('docs');
    expect(allBranches()).toEqual(['main', 'main', 'main']);
    expect((await getStatus()).mono.leftOut).toEqual([]);
  });

  it('creates a branch everywhere and follows it', async () => {
    await request('POST', `${mono.route}/branches`, { name: 'feature/x' });
    expect(allBranches()).toEqual(['feature/x', 'feature/x', 'feature/x']);
    expect((await getStatus()).branch).toBe('feature/x');
  });

  it('creates no branch anywhere if one repository already has it', async () => {
    git(mono.docs.work, 'branch', 'taken');
    const { status, body } = await request('POST', `${mono.route}/branches`, { name: 'taken' });
    expect(status).toBe(409);
    expect(body.error.message).toContain('No branch was created');
    expect(allBranches()).toEqual(['main', 'main', 'main']);
    expect(git(mono.api.work, 'branch', '--list', 'taken')).toBe('');
  });

  it('deletes a branch everywhere', async () => {
    for (const { work } of [mono.api, mono.web, mono.docs]) git(work, 'branch', 'old');
    await request('DELETE', `${mono.route}/branches/old`);
    expect(localNames(await getBranches())).not.toContain('old');
    expect(git(mono.web.work, 'branch', '--list', 'old')).toBe('');
  });

  it('prunes only the shared branches', async () => {
    for (const { work } of [mono.api, mono.web, mono.docs]) {
      git(work, 'switch', '--create', 'done');
      git(work, 'push', '-u', 'origin', 'done');
      git(work, 'switch', 'main');
    }
    git(mono.api.work, 'switch', '--create', 'mine');
    git(mono.api.work, 'push', '-u', 'origin', 'mine');
    git(mono.api.work, 'switch', 'main');
    for (const { work } of [mono.api, mono.web, mono.docs]) {
      git(work, 'push', 'origin', '--delete', 'done');
    }
    git(mono.api.work, 'push', 'origin', '--delete', 'mine');
    await request('POST', `${mono.route}/fetch`);

    const { body } = await request('POST', `${mono.route}/prune-branches`, { force: true });

    expect(body).toEqual({ deleted: ['done'], kept: [] });
    expect(git(mono.api.work, 'branch', '--list', 'mine')).not.toBe('');
  });

  it('pushes every member', async () => {
    await writeAndCommit(mono.api.work, 'a.txt', 'a\n', 'Api');
    await writeAndCommit(mono.web.work, 'w.txt', 'w\n', 'Web');
    await request('POST', `${mono.route}/push`, {});
    expect((await getStatus()).ahead).toBe(0);
  });

  it('asks to publish while any member has no upstream', async () => {
    git(mono.api.work, 'switch', '--create', 'fresh');
    git(mono.web.work, 'switch', '--create', 'fresh');
    git(mono.docs.work, 'switch', '--create', 'fresh');
    await request('POST', `/api/repositories/groups/${mono.group.id}/mono`, { branch: 'fresh' });
    git(mono.api.work, 'push', '-u', 'origin', 'fresh');
    expect((await getStatus()).upstream).toBe(null);

    await request('POST', `${mono.route}/push`, { remote: 'origin', upstreamName: 'fresh' });
    expect((await getStatus()).upstream).toBe('origin/fresh');
  });

  it('merges everywhere and reports a conflict through the banner', async () => {
    for (const { work } of [mono.api, mono.web, mono.docs]) git(work, 'branch', 'other');
    git(mono.web.work, 'switch', 'other');
    await writeAndCommit(mono.web.work, 'readme.txt', 'theirs\n', 'Theirs');
    git(mono.web.work, 'switch', 'main');
    await writeAndCommit(mono.web.work, 'readme.txt', 'ours\n', 'Ours');

    const { body } = await request('POST', `${mono.route}/merge`, { branch: 'other' });

    expect(body.error.code).toBe('CONFLICTS');
    const status = await getStatus();
    expect(status.operation).toBe('merge');
    expect(status.conflicted.map(({ path: file }) => file)).toEqual(['web/readme.txt']);

    await request('POST', `${mono.route}/operation/abort`);
    expect((await getStatus()).operation).toBe(null);
  });
});

describe('stashes', () => {
  it('stashes each changed member, and restores one at a time by its own ref', async () => {
    await fs.writeFile(path.join(mono.api.work, 'readme.txt'), 'api\n');
    await fs.writeFile(path.join(mono.web.work, 'readme.txt'), 'web\n');
    await request('POST', `${mono.route}/stash`, { message: 'Later' });

    const { body: stashes } = await request('GET', `${mono.route}/stashes`);
    expect(stashes.map(({ repository }) => repository).sort()).toEqual(['api', 'web']);
    expect((await getStatus()).unstaged).toEqual([]);

    const web = stashes.find(({ repository }) => repository === 'web');
    await request('POST', `${mono.route}/stash/pop`, { ref: web.ref });
    const { unstaged } = await getStatus();
    expect(unstaged.map(({ path: file }) => file)).toEqual(['web/readme.txt']);
  });

  it('pops the newest stash when none is named', async () => {
    await fs.writeFile(path.join(mono.api.work, 'readme.txt'), 'api\n');
    await request('POST', `${mono.route}/stash`, {});
    const { status } = await request('POST', `${mono.route}/stash/pop`, {});
    expect(status).toBe(204);
    expect((await getStatus()).unstaged).toHaveLength(1);
  });
});

describe('what is kept to one repository', () => {
  it('has no last commit to undo', async () => {
    expect((await request('GET', `${mono.route}/last-commit`)).body).toBe(null);
    const { status } = await request('POST', `${mono.route}/undo-commit`, { hash: 'abc1234' });
    expect(status).toBe(400);
  });

  it('cannot be cloned over', async () => {
    const { status } = await request('POST', `${mono.route}/clone`, { parentPath: sandbox });
    expect(status).toBe(400);
  });
});
