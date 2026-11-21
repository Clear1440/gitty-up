import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { ActivityLog, MAX_READS, MAX_WRITES } from './mcp/activityLog.js';
import { summarizeArguments } from './mcp/activityRecorder.js';
import { RepositoryStore } from './store/repositoryStore.js';
import { SettingsStore } from './store/settingsStore.js';

let sandbox;
let home;
let server;
let baseUrl;
let work;
let repositoryId;
let activity;
/** The token AI tools must send, from the settings once the server is on. */
let token;
let nextId = 1;

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function request(method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body !== undefined && {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      }),
      ...(route === '/mcp' && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const setMcp = (changes) => request('PUT', '/api/settings/mcp', changes);

async function callTool(name, args = {}) {
  const { body } = await request('POST', '/mcp', {
    jsonrpc: '2.0',
    id: nextId++,
    method: 'tools/call',
    params: { name, arguments: { repository: repositoryId, ...args } },
  });
  return body;
}

const listActivity = async () => (await request('GET', '/api/ai-activity')).body.entries;
const latest = async () => (await listActivity())[0];
const undo = (id) => request('POST', `/api/ai-activity/${id}/undo`);
const head = () => git(work, 'rev-parse', 'HEAD');

async function writeFile(file, content) {
  await fs.writeFile(path.join(work, file), content);
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-activity-'));
  home = path.join(sandbox, 'home');
  work = path.join(sandbox, 'project');
  await fs.mkdir(work);
  git(work, 'init', '--initial-branch=main');
  git(work, 'config', 'user.name', 'Test');
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'commit.gpgsign', 'false');
  git(work, 'config', 'core.autocrlf', 'false');
  await writeFile('readme.txt', 'one\n');
  git(work, 'add', '--all');
  git(work, 'commit', '-m', 'Initial commit');

  const settings = new SettingsStore(home);
  const store = new RepositoryStore(home);
  repositoryId = (await store.add(work)).id;
  activity = new ActivityLog(home);
  const app = createApp({ store, settings, activity });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = (await setMcp({ enabled: true })).body.mcp.token;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('AI activity log', () => {
  beforeEach(async () => {
    await request('DELETE', '/api/ai-activity');
    git(work, 'switch', '--quiet', 'main');
  });

  it('logs reads, and refused writes, with the repository as resolved', async () => {
    await callTool('get_status');
    await callTool('commit', { message: 'Sneaky' });
    const [refused, read] = await listActivity();

    expect(read).toMatchObject({
      tool: 'get_status',
      write: false,
      repository: { id: repositoryId, name: 'project' },
      outcome: 'ok',
      undo: null,
    });
    expect(read.durationMs).toBeGreaterThanOrEqual(0);
    expect(read.before).toBeUndefined();

    expect(refused).toMatchObject({ tool: 'commit', write: true, outcome: 'error' });
    expect(refused.error).toMatch(/full access/);
    expect(refused.undo).toEqual({ available: false, reason: expect.stringMatching(/failed/) });
  });

  it('logs failures, naming what the AI tool asked for when no repository matches', async () => {
    await callTool('get_status', { repository: 'nowhere' });
    const entry = await latest();
    expect(entry.outcome).toBe('error');
    expect(entry.error).toMatch(/No linked repository/);
    expect(entry.repository).toEqual({ id: null, name: 'nowhere' });
  });

  it('keeps arguments short, and never keeps contents or diffs', () => {
    const summary = summarizeArguments({
      message: 'x'.repeat(500),
      paths: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      content: 'secret file contents',
      nested: { deep: true },
    });
    expect(summary.message.length).toBeLessThanOrEqual(120);
    expect(summary.paths).toEqual(['a', 'b', 'c', 'd', 'e', '…and 2 more']);
    expect(summary.content).toBe('[20 characters]');
    expect(summary.nested).toBe('{…}');
    expect(summarizeArguments('not an object')).toEqual({});
  });

  it('saves writes to the data folder, but never reads', async () => {
    await setMcp({ access: 'full' });
    await callTool('get_status');
    await callTool('create_tag', { name: 'saved-tag' });
    await activity.flush();

    const saved = JSON.parse(await fs.readFile(path.join(home, 'ai-activity.json'), 'utf8'));
    expect(saved.entries.map((entry) => entry.tool)).toEqual(['create_tag']);

    const reloaded = new ActivityLog(home);
    expect((await reloaded.list()).map((entry) => entry.tool)).toEqual(['create_tag']);
    git(work, 'tag', '--delete', 'saved-tag');
  });

  it('clears the log, on disk too', async () => {
    await callTool('get_status');
    expect(await listActivity()).toHaveLength(1);
    expect((await request('DELETE', '/api/ai-activity')).status).toBe(204);
    expect(await listActivity()).toEqual([]);
    expect(await new ActivityLog(home).list()).toEqual([]);
  });

  describe('undo', () => {
    beforeAll(() => setMcp({ access: 'full' }));

    it('records HEAD before and after a write', async () => {
      const before = head();
      await writeFile('a.txt', 'a\n');
      await callTool('commit', { message: 'Add a', stage_all: true });
      const entry = await latest();
      expect(entry.before).toEqual({ head: before, branch: 'main' });
      expect(entry.after).toEqual({ head: head(), branch: 'main' });
      expect(entry.args).toEqual({ repository: repositoryId, message: 'Add a', stage_all: true });
      git(work, 'reset', '--hard', '--quiet', before);
    });

    it('undoes a commit, giving its changes back as staged', async () => {
      const before = head();
      await writeFile('b.txt', 'b\n');
      await callTool('commit', { message: 'Add b', stage_all: true });
      const entry = await latest();
      expect(entry.undo.available).toBe(true);
      expect(entry.undo.description).toMatch(/Moves main back/);

      const { status, body } = await undo(entry.id);
      expect(status).toBe(200);
      expect(body.undone.time).toBeTruthy();
      expect(body.undo).toEqual({ available: false, reason: 'Already undone.' });
      expect(head()).toBe(before);
      expect(git(work, 'diff', '--cached', '--name-only')).toBe('b.txt');

      // Twice is refused.
      expect((await undo(entry.id)).status).toBe(400);
      git(work, 'reset', '--hard', '--quiet', before);
      await fs.rm(path.join(work, 'b.txt'), { force: true });
    });

    it('refuses once the branch has moved on, changing nothing', async () => {
      const before = head();
      await writeFile('c.txt', 'c\n');
      await callTool('commit', { message: 'Add c', stage_all: true });
      const entry = await latest();
      await writeFile('d.txt', 'd\n');
      git(work, 'add', 'd.txt');
      git(work, 'commit', '--quiet', '-m', 'Add d');
      const moved = head();

      const { status, body } = await undo(entry.id);
      expect(status).toBe(409);
      expect(body.error.message).toMatch(/has moved since/);
      expect(head()).toBe(moved);
      expect((await latest()).undone).toBeUndefined();
      git(work, 'reset', '--hard', '--quiet', before);
    });

    it('undoes a merge with reset --keep, keeping uncommitted changes', async () => {
      const before = head();
      git(work, 'switch', '--quiet', '-c', 'topic');
      await writeFile('topic.txt', 'topic\n');
      git(work, 'add', 'topic.txt');
      git(work, 'commit', '--quiet', '-m', 'Topic');
      git(work, 'switch', '--quiet', 'main');

      await callTool('merge', { branch: 'topic' });
      await writeFile('readme.txt', 'one\nlocal edit\n');
      const entry = await latest();
      expect((await undo(entry.id)).status).toBe(200);
      expect(head()).toBe(before);
      expect(await fs.readFile(path.join(work, 'readme.txt'), 'utf8')).toBe('one\nlocal edit\n');
      await expect(fs.access(path.join(work, 'topic.txt'))).rejects.toThrow();
      git(work, 'checkout', '--quiet', '--', 'readme.txt');
      git(work, 'branch', '-D', 'topic');
    });

    it('deletes a branch it made, switching back first', async () => {
      await callTool('create_branch', { name: 'ai-branch' });
      expect(git(work, 'branch', '--show-current')).toBe('ai-branch');
      const entry = await latest();
      expect(entry.undo.description).toMatch(/Deletes the branch ai-branch after checking main back out/);

      expect((await undo(entry.id)).status).toBe(200);
      expect(git(work, 'branch', '--show-current')).toBe('main');
      expect(git(work, 'branch', '--list', 'ai-branch')).toBe('');
    });

    it('keeps a branch that has new commits', async () => {
      await callTool('create_branch', { name: 'busy-branch', switch_to: false });
      const entry = await latest();
      git(work, 'switch', '--quiet', 'busy-branch');
      await writeFile('e.txt', 'e\n');
      git(work, 'add', 'e.txt');
      git(work, 'commit', '--quiet', '-m', 'Add e');
      git(work, 'switch', '--quiet', 'main');

      const { status, body } = await undo(entry.id);
      expect(status).toBe(409);
      expect(body.error.message).toMatch(/new commits/);
      expect(git(work, 'branch', '--list', 'busy-branch')).toContain('busy-branch');
      git(work, 'branch', '-D', 'busy-branch');
    });

    it('deletes a tag it made, if it still points at the same thing', async () => {
      await callTool('create_tag', { name: 'v9', message: 'Nine' });
      const entry = await latest();
      expect((await undo(entry.id)).status).toBe(200);
      expect(git(work, 'tag', '--list', 'v9')).toBe('');
    });

    it('pops a stash it made while it is still the latest', async () => {
      await writeFile('readme.txt', 'one\nstashed\n');
      await callTool('stash_save', { message: 'AI stash' });
      expect(git(work, 'status', '--porcelain')).toBe('');
      const entry = await latest();

      expect((await undo(entry.id)).status).toBe(200);
      expect(await fs.readFile(path.join(work, 'readme.txt'), 'utf8')).toBe('one\nstashed\n');
      expect(git(work, 'stash', 'list')).toBe('');
      git(work, 'checkout', '--quiet', '--', 'readme.txt');
    });

    it('checks the previous branch back out', async () => {
      git(work, 'branch', 'other');
      await callTool('checkout', { branch: 'other' });
      const entry = await latest();
      expect(entry.undo.description).toMatch(/Checks main back out/);
      expect((await undo(entry.id)).status).toBe(200);
      expect(git(work, 'branch', '--show-current')).toBe('main');
      git(work, 'branch', '-D', 'other');
    });

    it('offers no undo for what it cannot take back', async () => {
      await writeFile('readme.txt', 'one\ndiscard me\n');
      await callTool('discard', { paths: ['readme.txt'] });
      const entry = await latest();
      expect(entry.undo).toEqual({ available: false, reason: 'This can’t be undone from here.' });
      expect((await undo(entry.id)).status).toBe(400);
    });

    it('is not limited to the repositories AI tools may use', async () => {
      await callTool('create_tag', { name: 'scoped' });
      const entry = await latest();
      await setMcp({ repositories: [] });
      expect((await undo(entry.id)).status).toBe(200);
      expect(git(work, 'tag', '--list', 'scoped')).toBe('');
      await setMcp({ repositories: ['*'] });
    });

    it('answers 404 for an entry that is gone', async () => {
      expect((await undo('missing')).status).toBe(404);
    });
  });
});

describe('ActivityLog', () => {
  it('keeps only the latest writes, and fewer reads, in memory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-log-'));
    const log = new ActivityLog(dir);
    const time = (index) => new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    await Promise.all(
      Array.from({ length: MAX_WRITES + 20 }, (_, index) => log.add({ time: time(index), tool: `w${index}`, write: true })),
    );
    await Promise.all(
      Array.from({ length: MAX_READS + 5 }, (_, index) => log.add({ time: time(index), tool: `r${index}`, write: false })),
    );
    await log.flush();

    const entries = await log.list();
    expect(entries.filter((entry) => entry.write)).toHaveLength(MAX_WRITES);
    expect(entries.filter((entry) => !entry.write)).toHaveLength(MAX_READS);
    const saved = JSON.parse(await fs.readFile(path.join(dir, 'ai-activity.json'), 'utf8'));
    expect(saved.entries).toHaveLength(MAX_WRITES);
    expect(saved.entries[0].tool).toBe('w20');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('starts afresh from a file it cannot read', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-log-'));
    await fs.writeFile(path.join(dir, 'ai-activity.json'), '{ not json');
    const log = new ActivityLog(dir);
    expect(await log.list()).toEqual([]);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('never fails a tool call when logging goes wrong', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-log-'));
    const settings = new SettingsStore(dir);
    await settings.update({
      mcp: { enabled: true, access: 'read-only', repositories: ['*'], token: 'test-token' },
    });
    const store = new RepositoryStore(dir);
    const id = (await store.add(work)).id;
    const broken = {
      add: async () => {
        throw new Error('Disk full');
      },
    };
    const app = createApp({ store, settings, activity: broken });
    const other = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const response = await fetch(`http://127.0.0.1:${other.address().port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_status', arguments: { repository: id } },
      }),
    });
    const body = await response.json();
    expect(body.result.isError).toBeFalsy();
    await new Promise((resolve) => other.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  });
});
