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
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gity-up-test-'));
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
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'gity-up-plain-'));
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
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'gity-up-plain-'));
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
