import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { MAX_TEXT_LENGTH } from './mcp/gitTools.js';
import { PROTOCOL_VERSIONS } from './mcp/mcpServer.js';
import { RepositoryStore } from './store/repositoryStore.js';
import { SettingsStore } from './store/settingsStore.js';

let sandbox;
let server;
let baseUrl;
let work;
let repositoryId;
let store;
let nextId = 1;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function post(route, body, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const setMcp = async (changes) => {
  const response = await fetch(`${baseUrl}/api/settings/mcp`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  return response.json();
};

const rpc = (method, params) => post('/mcp', { jsonrpc: '2.0', id: nextId++, method, params });

/** Calls a tool, resolving with its text, parsed when it is JSON, and whether it failed. */
async function callTool(name, args = {}) {
  const { body } = await rpc('tools/call', { name, arguments: args });
  const { text } = body.result.content[0];
  let value = text;
  try {
    value = JSON.parse(text);
  } catch {
    // Diffs and files come back as plain text.
  }
  return { value, isError: Boolean(body.result.isError) };
}

async function writeAndCommit(file, content, message) {
  await fs.mkdir(path.dirname(path.join(work, file)), { recursive: true });
  await fs.writeFile(path.join(work, file), content);
  git(work, 'add', '--all');
  git(work, 'commit', '-m', message);
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-mcp-'));
  work = path.join(sandbox, 'project');
  await fs.mkdir(work);
  git(work, 'init', '--initial-branch=main');
  git(work, 'config', 'user.name', 'Test');
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'commit.gpgsign', 'false');
  git(work, 'config', 'core.autocrlf', 'false');
  await writeAndCommit('readme.txt', 'one\n', 'Initial commit');
  git(work, 'tag', '-a', 'v1.0.0', '-m', 'First release');
  git(work, 'switch', '-c', 'feature');
  await writeAndCommit('src/app.js', 'console.log(1);\n', 'Add the app');
  git(work, 'switch', 'main');
  await fs.writeFile(path.join(work, 'readme.txt'), 'one\ntwo\n');

  const settings = new SettingsStore(path.join(sandbox, 'home'));
  store = new RepositoryStore(path.join(sandbox, 'home'));
  repositoryId = (await store.add(work)).id;
  const app = createApp({ store, settings });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('MCP server', () => {
  it('is off until turned on in the settings', async () => {
    const { status, body } = await rpc('ping');
    expect(status).toBe(403);
    expect(body.error.message).toMatch(/turned off/);
  });

  it('reports its address and state in the settings', async () => {
    const settings = await setMcp({ enabled: true });
    expect(settings.mcp).toEqual({
      enabled: true,
      access: 'read-only',
      repositories: ['*'],
      url: `http://127.0.0.1:${server.address().port}/mcp`,
    });
  });

  it('turns away requests from websites', async () => {
    const { status } = await post(
      '/mcp',
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { Origin: 'https://example.com' },
    );
    expect(status).toBe(403);
  });

  it('initializes with the version the client asks for, if it knows it', async () => {
    const { body } = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.serverInfo.name).toBe('gitty-up');
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });

    const newer = await rpc('initialize', { protocolVersion: '2099-01-01' });
    expect(newer.body.result.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it('accepts notifications without answering them', async () => {
    const { status, body } = await post('/mcp', {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(status).toBe(202);
    expect(body).toBeNull();
  });

  it('answers malformed and unknown requests with JSON-RPC errors', async () => {
    expect((await post('/mcp', '{nope')).body.error.code).toBe(-32700);
    expect((await post('/mcp', { hello: 1 })).body.error.code).toBe(-32600);
    expect((await rpc('nope/nothing')).body.error.code).toBe(-32601);
    expect((await rpc('tools/call', { name: 'push' })).body.error.code).toBe(-32602);
  });

  it('lists only read-only tools while read-only', async () => {
    const { body } = await rpc('tools/list');
    const names = body.result.tools.map((tool) => tool.name);
    expect(names).toContain('list_repositories');
    expect(names).toContain('read_file');
    expect(names).not.toContain('commit');
    for (const tool of body.result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('refuses git commands while read-only, saying why', async () => {
    const { body } = await rpc('tools/call', {
      name: 'create_branch',
      arguments: { repository: repositoryId, name: 'sneaky' },
    });
    expect(body.error.code).toBe(-32602);
    expect(body.error.message).toMatch(/needs full access/);
    expect(git(work, 'branch', '--list', 'sneaky')).toBe('');
  });

  it('lists the linked repositories with their state', async () => {
    const { value } = await callTool('list_repositories');
    expect(value).toHaveLength(1);
    expect(value[0]).toMatchObject({
      id: repositoryId,
      name: 'project',
      path: work,
      available: true,
      branch: 'main',
      changeCount: 1,
    });
    expect(value[0].lastCommit.subject).toBe('Initial commit');
  });

  it('finds a repository by name, and explains when none matches', async () => {
    const { value } = await callTool('get_status', { repository: 'Project' });
    expect(value.branch).toBe('main');
    expect(value.unstaged.map((file) => file.path)).toEqual(['readme.txt']);

    const missing = await callTool('get_status', { repository: 'elsewhere' });
    expect(missing.isError).toBe(true);
    expect(missing.value).toMatch(/list_repositories/);
  });

  it('reads branches, history and tags', async () => {
    const branches = await callTool('list_branches', { repository: repositoryId });
    expect(branches.value.local.map((branch) => branch.name).sort()).toEqual(['feature', 'main']);

    const log = await callTool('get_log', { repository: repositoryId, all_branches: true });
    expect(log.value.map((commit) => commit.subject)).toEqual(['Add the app', 'Initial commit']);
    expect(log.value[0].parents).toEqual([log.value[1].hash]);

    const searched = await callTool('get_log', { repository: repositoryId, ref: 'feature', grep: 'APP' });
    expect(searched.value.map((commit) => commit.subject)).toEqual(['Add the app']);

    const tags = await callTool('list_tags', { repository: repositoryId });
    expect(tags.value).toMatchObject([{ name: 'v1.0.0', annotated: true, subject: 'First release' }]);
    expect(log.value[1].hash.startsWith(tags.value[0].commit)).toBe(true);
  });

  it('reads a commit and its diff', async () => {
    const commit = await callTool('get_commit', { repository: repositoryId, commit: 'feature' });
    expect(commit.value.message).toBe('Add the app');
    expect(commit.value.files).toMatchObject([{ path: 'src/app.js', status: 'added' }]);

    const diff = await callTool('get_commit_diff', { repository: repositoryId, commit: 'feature' });
    expect(diff.value).toContain('+++ b/src/app.js');

    const unknown = await callTool('get_commit', { repository: repositoryId, commit: 'nope' });
    expect(unknown.isError).toBe(true);
  });

  it('reads uncommitted changes', async () => {
    const both = await callTool('get_uncommitted_diff', { repository: repositoryId });
    expect(both.value).toContain('+two');
    const staged = await callTool('get_uncommitted_diff', { repository: repositoryId, staged: true });
    expect(staged.value).toMatch(/no uncommitted changes/);
  });

  it('compares branches as a pull request would', async () => {
    const { value } = await callTool('compare_refs', {
      repository: repositoryId,
      base: 'main',
      head: 'feature',
      include_patch: true,
    });
    expect(value.commits.map((commit) => commit.subject)).toEqual(['Add the app']);
    expect(value.commitsOnBaseNotInHead).toBe(0);
    expect(value.filesChanged).toContain('src/app.js');
    expect(value.patch).toContain('+console.log(1);');
  });

  it('lists and reads committed files, never outside the repository', async () => {
    const files = await callTool('list_files', { repository: repositoryId, ref: 'feature' });
    expect(files.value.files).toEqual(['readme.txt', 'src/app.js']);

    const inFolder = await callTool('list_files', { repository: repositoryId, ref: 'feature', path: 'src' });
    expect(inFolder.value.files).toEqual(['src/app.js']);

    // The committed version, not the edited one in the working tree.
    const file = await callTool('read_file', { repository: repositoryId, path: 'readme.txt' });
    expect(file.value).toBe('one\n');

    const folder = await callTool('read_file', { repository: repositoryId, path: 'src', ref: 'feature' });
    expect(folder.value).toMatch(/is a folder/);

    const outside = await callTool('read_file', { repository: repositoryId, path: '../secret.txt' });
    expect(outside.isError).toBe(true);
  });

  it('refuses refs that git would read as options', async () => {
    const { value, isError } = await callTool('get_log', { repository: repositoryId, ref: '--output=x' });
    expect(isError).toBe(true);
    expect(value).toMatch(/cannot start with "-"/);
  });

  it('cuts long text short', async () => {
    await fs.writeFile(path.join(work, 'big.txt'), 'x'.repeat(MAX_TEXT_LENGTH + 10));
    git(work, 'add', 'big.txt');
    const { value } = await callTool('get_uncommitted_diff', { repository: repositoryId, staged: true });
    expect(value).toMatch(/\[Cut short: [\d,]+ more characters/);
    git(work, 'rm', '--cached', '--quiet', 'big.txt');
    await fs.rm(path.join(work, 'big.txt'));
  });

  describe('with full access', () => {
    beforeAll(() => setMcp({ access: 'full' }));
    afterAll(() => setMcp({ access: 'read-only' }));

    it('adds the git commands to the tools, marking those that can lose work', async () => {
      const { body } = await rpc('tools/list');
      const tools = new Map(body.result.tools.map((tool) => [tool.name, tool]));
      expect(tools.has('list_repositories')).toBe(true);
      expect(tools.get('commit').annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
      expect(tools.get('reset').annotations.destructiveHint).toBe(true);
      expect(tools.get('discard').annotations.destructiveHint).toBe(true);
      for (const tool of body.result.tools) expect(tool.inputSchema.required ?? []).toBeInstanceOf(Array);
    });

    it('creates and switches branches, commits and tags, reporting where things stand', async () => {
      const created = await callTool('create_branch', { repository: repositoryId, name: 'from-ai' });
      expect(created.isError).toBe(false);
      expect(created.value.state.branch).toBe('from-ai');

      const committed = await callTool('commit', {
        repository: repositoryId,
        message: 'Add a second line',
        stage_all: true,
      });
      expect(committed.value.state).toMatchObject({ branch: 'from-ai', changeCount: 0 });
      expect(committed.value.state.lastCommit.subject).toBe('Add a second line');

      await callTool('create_tag', { repository: repositoryId, name: 'v1.1.0', message: 'Second' });
      expect(git(work, 'tag', '--list', 'v1.1.0')).toBe('v1.1.0');

      const back = await callTool('checkout', { repository: repositoryId, branch: 'main' });
      expect(back.value.state.branch).toBe('main');
      expect(git(work, 'log', '-1', '--format=%s', 'from-ai')).toBe('Add a second line');
    });

    it('never force pushes', async () => {
      const { body } = await rpc('tools/list');
      const push = body.result.tools.find((tool) => tool.name === 'push');
      expect(push.inputSchema.properties).not.toHaveProperty('force');
      expect(push.annotations.destructiveHint).toBe(false);

      const { value, isError } = await callTool('push', { repository: repositoryId, force: true });
      expect(isError).toBe(true);
      expect(value).toMatch(/Force pushing is not available/);
    });

    it('reports git refusing as an error the AI tool can read', async () => {
      const { value, isError } = await callTool('delete_branch', { repository: repositoryId, name: 'from-ai' });
      expect(isError).toBe(true);
      expect(value).toMatch(/not fully merged/);

      const badMode = await callTool('reset', { repository: repositoryId, commit: 'HEAD', mode: 'mixed' });
      expect(badMode.isError).toBe(true);
      expect(badMode.value).toMatch(/"mode" must be one of/);
    });

    it('stashes and restores changes', async () => {
      await fs.writeFile(path.join(work, 'readme.txt'), 'one\nstashed\n');
      const saved = await callTool('stash_save', { repository: repositoryId, message: 'wip' });
      expect(saved.value.state.changeCount).toBe(0);
      const popped = await callTool('stash_pop', { repository: repositoryId });
      expect(popped.value.state.changeCount).toBe(1);
      await callTool('discard', { repository: repositoryId, paths: ['readme.txt'] });
      expect(await fs.readFile(path.join(work, 'readme.txt'), 'utf8')).toBe('one\n');
    });
  });

  describe('limited to some repositories', () => {
    let otherId;
    let groupedId;
    let group;

    beforeAll(async () => {
      const other = path.join(sandbox, 'other');
      const grouped = path.join(sandbox, 'grouped');
      for (const folder of [other, grouped]) {
        await fs.mkdir(folder);
        git(folder, 'init', '--initial-branch=main');
      }
      otherId = (await store.add(other)).id;
      groupedId = (await store.add(grouped)).id;
      group = await store.addGroup('Shared');
      await store.setGroups(groupedId, [group.id]);
    });
    afterAll(() => setMcp({ repositories: ['*'] }));

    const listedIds = async () => (await callTool('list_repositories')).value.map(({ id }) => id);

    it('offers every repository by default', async () => {
      expect((await listedIds()).sort()).toEqual([repositoryId, otherId, groupedId].sort());
    });

    it('offers only the repositories and groups chosen', async () => {
      await setMcp({ repositories: [`repo:${repositoryId}`, `group:${group.id}`] });
      expect((await listedIds()).sort()).toEqual([repositoryId, groupedId].sort());

      const hidden = await callTool('get_status', { repository: otherId });
      expect(hidden.isError).toBe(true);
      expect((await callTool('get_status', { repository: 'grouped' })).isError).toBe(false);
    });

    it('follows a group as repositories join and leave it', async () => {
      await setMcp({ repositories: [`group:${group.id}`] });
      await store.setGroups(otherId, [group.id]);
      expect((await listedIds()).sort()).toEqual([otherId, groupedId].sort());
      await store.setGroups(otherId, []);
      expect(await listedIds()).toEqual([groupedId]);
    });

    it('offers none when none are chosen', async () => {
      await setMcp({ repositories: [] });
      expect(await listedIds()).toEqual([]);
    });
  });

  it('answers batches, and stops once turned off again', async () => {
    const { body } = await post('/mcp', [
      { jsonrpc: '2.0', id: 'a', method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ]);
    expect(body).toEqual([{ jsonrpc: '2.0', id: 'a', result: {} }]);

    await setMcp({ enabled: false });
    expect((await rpc('ping')).status).toBe(403);
  });
});
