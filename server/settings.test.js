import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { RepositoryStore } from './store/repositoryStore.js';
import { SettingsStore } from './store/settingsStore.js';

let sandbox;
let server;
let baseUrl;
let homeDir;

async function request(method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/** Starts a server the way start.js does, reading the data folder from the settings. */
async function startServer() {
  const settings = new SettingsStore(homeDir);
  const store = new RepositoryStore(await settings.dataDir());
  const app = createApp({ store, settings });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

const stopServer = () => new Promise((resolve) => server.close(resolve));

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'gitty-up-settings-'));
  homeDir = path.join(sandbox, 'home');
  await startServer();
});

afterEach(async () => {
  await stopServer();
  await fs.rm(sandbox, { recursive: true, force: true });
});

describe('settings', () => {
  it('starts with the defaults', async () => {
    const { status, body } = await request('GET', '/api/settings');
    expect(status).toBe(200);
    expect(body).toEqual({
      dataDir: homeDir,
      defaultDataDir: homeDir,
      isDefaultDataDir: true,
      appearance: { scheme: 'default', mode: 'dark' },
      mcp: {
        enabled: false,
        access: 'read-only',
        repositories: ['*'],
        token: null,
        requireToken: true,
        url: `${baseUrl}/mcp`,
      },
    });
  });

  it('saves the MCP server’s state and access across restarts, and checks the values', async () => {
    const saved = await request('PUT', '/api/settings/mcp', { enabled: true });
    expect(saved.body.mcp).toMatchObject({ enabled: true, access: 'read-only' });
    // Either can change without the other.
    const full = await request('PUT', '/api/settings/mcp', { access: 'full' });
    expect(full.body.mcp).toMatchObject({ enabled: true, access: 'full' });
    expect((await request('PUT', '/api/settings/mcp', { enabled: 'yes' })).status).toBe(400);
    expect((await request('PUT', '/api/settings/mcp', { access: 'admin' })).status).toBe(400);
    expect((await request('PUT', '/api/settings/mcp', { repositories: ['repo:'] })).status).toBe(400);
    expect((await request('PUT', '/api/settings/mcp', { repositories: 'all' })).status).toBe(400);

    // Everything with something else is just everything.
    const scoped = await request('PUT', '/api/settings/mcp', { repositories: ['repo:a', '*'] });
    expect(scoped.body.mcp.repositories).toEqual(['*']);
    await request('PUT', '/api/settings/mcp', { repositories: ['group:g', 'repo:a', 'repo:a'] });

    await stopServer();
    await startServer();
    const { body } = await request('GET', '/api/settings');
    expect(body.mcp).toMatchObject({ enabled: true, access: 'full', repositories: ['group:g', 'repo:a'] });
  });

  it('makes a token when the MCP server is turned on, and keeps it across restarts', async () => {
    const { body: on } = await request('PUT', '/api/settings/mcp', { enabled: true });
    expect(on.mcp.token).toMatch(/^[\w-]{43}$/);
    // Changing anything else keeps it, and the API cannot set it.
    const full = await request('PUT', '/api/settings/mcp', { access: 'full', token: 'chosen' });
    expect(full.body.mcp.token).toBe(on.mcp.token);

    await stopServer();
    await startServer();
    expect((await request('GET', '/api/settings')).body.mcp.token).toBe(on.mcp.token);
    const saved = JSON.parse(await fs.readFile(path.join(homeDir, 'settings.json'), 'utf8'));
    expect(saved.mcp.token).toBe(on.mcp.token);
  });

  it('gives a token to a server turned on before there were tokens', async () => {
    await stopServer();
    await fs.mkdir(homeDir, { recursive: true });
    await fs.writeFile(
      path.join(homeDir, 'settings.json'),
      JSON.stringify({ mcp: { enabled: true, access: 'full', repositories: ['*'] } }),
    );
    await startServer();

    // Two at once agree on the same one.
    const [first, second] = await Promise.all([
      request('GET', '/api/settings'),
      request('GET', '/api/settings'),
    ]);
    expect(first.body.mcp.token).toMatch(/^[\w-]{43}$/);
    expect(second.body.mcp.token).toBe(first.body.mcp.token);
    expect((await request('GET', '/api/settings')).body.mcp.token).toBe(first.body.mcp.token);
  });

  it('hides the token while the MCP server is off, and keeps it for when it is back on', async () => {
    const { body: on } = await request('PUT', '/api/settings/mcp', { enabled: true });
    const { body: off } = await request('PUT', '/api/settings/mcp', { enabled: false });
    expect(off.mcp.token).toBeNull();
    const { body: again } = await request('PUT', '/api/settings/mcp', { enabled: true });
    expect(again.mcp.token).toBe(on.mcp.token);
  });

  it('lets the token requirement be turned off and back on, keeping the token', async () => {
    const { body: on } = await request('PUT', '/api/settings/mcp', { enabled: true });
    expect(on.mcp.requireToken).toBe(true);
    const { body: off } = await request('PUT', '/api/settings/mcp', { requireToken: false });
    expect(off.mcp).toMatchObject({ requireToken: false, token: on.mcp.token });
    const { body: back } = await request('PUT', '/api/settings/mcp', { requireToken: true });
    expect(back.mcp).toMatchObject({ requireToken: true, token: on.mcp.token });
    const { status } = await request('PUT', '/api/settings/mcp', { requireToken: 'no' });
    expect(status).toBe(400);
  });

  it('regenerates the token', async () => {
    const { body: on } = await request('PUT', '/api/settings/mcp', { enabled: true });
    const { status, body } = await request('POST', '/api/settings/mcp/token');
    expect(status).toBe(200);
    expect(body.mcp.token).toMatch(/^[\w-]{43}$/);
    expect(body.mcp.token).not.toBe(on.mcp.token);
    expect((await request('GET', '/api/settings')).body.mcp.token).toBe(body.mcp.token);
  });

  it('saves the appearance across restarts', async () => {
    const saved = await request('PUT', '/api/settings/appearance', { scheme: 'coral', mode: 'light' });
    expect(saved.body.appearance).toEqual({ scheme: 'coral', mode: 'light' });

    await stopServer();
    await startServer();
    const { body } = await request('GET', '/api/settings');
    expect(body.appearance).toEqual({ scheme: 'coral', mode: 'light' });
  });

  it('saves custom colors, and keeps them when another scheme is picked', async () => {
    const custom = {
      dark: { bg: '#101010', text: '#fafafa', primary: '#ff8800', accent: '#00aaff' },
      light: { bg: '#fefefe', text: '#111111', primary: '#cc5500', accent: '#0077cc' },
    };
    const saved = await request('PUT', '/api/settings/appearance', {
      scheme: 'custom',
      mode: 'dark',
      custom,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.appearance).toEqual({ scheme: 'custom', mode: 'dark', custom });

    const switched = await request('PUT', '/api/settings/appearance', {
      scheme: 'coral',
      mode: 'dark',
    });
    expect(switched.body.appearance).toEqual({ scheme: 'coral', mode: 'dark', custom });
  });

  it.each([
    ['a color that is not hex', { dark: { bg: 'red' } }],
    ['an unknown color', { dark: { border: '#000000' } }],
    ['an unknown mode', { dim: { bg: '#000000' } }],
    ['a list', [{ bg: '#000000' }]],
  ])('turns down custom colors with %s', async (_label, custom) => {
    const { status } = await request('PUT', '/api/settings/appearance', {
      scheme: 'custom',
      mode: 'dark',
      custom,
    });
    expect(status).toBe(400);
  });

  it('can follow the system mode', async () => {
    const saved = await request('PUT', '/api/settings/appearance', { scheme: 'coral', mode: 'system' });
    expect(saved.status).toBe(200);
    expect(saved.body.appearance).toEqual({ scheme: 'coral', mode: 'system' });
  });

  it('turns down an unknown mode', async () => {
    const { status } = await request('PUT', '/api/settings/appearance', {
      scheme: 'coral',
      mode: 'sepia',
    });
    expect(status).toBe(400);
  });

  it('copies the data to a new folder and keeps using it after a restart', async () => {
    const repository = path.join(sandbox, 'repo');
    await fs.mkdir(repository, { recursive: true });
    execFileSync('git', ['init', '--quiet', repository]);
    const linked = await request('POST', '/api/repositories', { path: repository });
    expect(linked.status).toBe(201);
    const target = path.join(sandbox, 'elsewhere');

    const { status, body } = await request('PUT', '/api/settings/data-dir', { path: target });
    expect(status).toBe(200);
    expect(body).toMatchObject({ dataDir: target, isDefaultDataDir: false, outcome: 'copied' });
    // The original stays put as a backup.
    expect(await fs.readdir(homeDir)).toContain('repositories.json');

    await stopServer();
    await startServer();
    const { body: repositories } = await request('GET', '/api/repositories');
    expect(repositories).toHaveLength(1);
    expect((await request('GET', '/api/settings')).body.dataDir).toBe(target);
  });

  it('uses data already in the chosen folder rather than overwriting it', async () => {
    const target = path.join(sandbox, 'existing');
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(
      path.join(target, 'repositories.json'),
      JSON.stringify({ repositories: [], groups: [{ id: 'abc', name: 'Kept' }] }),
    );

    const { body } = await request('PUT', '/api/settings/data-dir', { path: target });
    expect(body.outcome).toBe('existing');
    const { body: groups } = await request('GET', '/api/repositories/groups');
    expect(groups).toEqual([{ id: 'abc', name: 'Kept' }]);
  });

  it('moves back to the default folder', async () => {
    await request('PUT', '/api/settings/data-dir', { path: path.join(sandbox, 'elsewhere') });
    const { body } = await request('PUT', '/api/settings/data-dir', { path: null });
    expect(body).toMatchObject({ dataDir: homeDir, isDefaultDataDir: true });
  });

  it('turns down a relative path', async () => {
    const { status } = await request('PUT', '/api/settings/data-dir', { path: 'relative/folder' });
    expect(status).toBe(400);
  });
});
