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
    });
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
