import fs from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { compareVersions, createUpdater, pickInstaller } from './updater.js';

const ASSETS = [
  { name: 'gitty-up-0.3.0-win-x64.exe.blockmap', browser_download_url: 'https://x/exe.blockmap', size: 1 },
  { name: 'gitty-up-0.3.0-win-x64.exe', browser_download_url: 'https://x/exe', size: 5 },
  { name: 'gitty-up-0.3.0-mac-universal.dmg', browser_download_url: 'https://x/dmg', size: 5 },
  { name: 'gitty-up-0.3.0-linux-x86_64.AppImage', browser_download_url: 'https://x/appimage', size: 5 },
  { name: 'latest.yml', browser_download_url: 'https://x/latest.yml', size: 1 },
];

const release = (tag, assets = ASSETS) => ({
  tag_name: tag,
  html_url: `https://github.com/owner/repo/releases/tag/${tag}`,
  assets,
});

/** Answers GitHub's latest-release request with `latest`, and downloads with five bytes. */
function fakeGitHub(latest) {
  return vi.fn(async (url) => {
    if (url.endsWith('/releases/latest')) {
      return latest ? Response.json(latest) : new Response('{}', { status: 404 });
    }
    return new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { 'content-length': '5' } });
  });
}

describe('compareVersions', () => {
  it('orders by major, minor and patch', () => {
    expect(compareVersions('0.3.0', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.2.10', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('puts a prerelease before its release', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
  });
});

describe('pickInstaller', () => {
  it('finds the installer for each system and skips blockmaps', () => {
    expect(pickInstaller(ASSETS, 'win32')).toEqual({
      name: 'gitty-up-0.3.0-win-x64.exe',
      url: 'https://x/exe',
      size: 5,
    });
    expect(pickInstaller(ASSETS, 'darwin').name).toMatch(/\.dmg$/);
    expect(pickInstaller(ASSETS, 'linux').name).toMatch(/\.AppImage$/);
    expect(pickInstaller(ASSETS, 'freebsd')).toBeNull();
    expect(pickInstaller([], 'win32')).toBeNull();
  });
});

describe('createUpdater', () => {
  const options = (fetchImpl, install = vi.fn()) => ({
    repository: 'owner/repo',
    currentVersion: '0.2.3',
    platform: 'darwin',
    fetchImpl,
    install,
  });

  it('offers a newer release that has an installer for this system', async () => {
    const updater = createUpdater(options(fakeGitHub(release('v0.3.0'))));
    expect(await updater.status()).toMatchObject({
      supported: true,
      currentVersion: '0.2.3',
      latestVersion: '0.3.0',
      available: true,
      phase: 'idle',
    });
  });

  it('offers nothing when up to date, unpublished or missing this system’s installer', async () => {
    for (const latest of [release('v0.2.3'), null, release('v0.3.0', ASSETS.slice(0, 2))]) {
      const updater = createUpdater(options(fakeGitHub(latest)));
      expect((await updater.check()).available).toBe(false);
    }
  });

  it('reports a failed check without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }));
    const status = await createUpdater(options(fetchImpl)).check();
    expect(status).toMatchObject({ available: false, checkError: 'GitHub answered with HTTP 500.' });
    expect(status.checkedAt).toBeTruthy();
  });

  it('shares a check already under way and reuses a fresh one', async () => {
    const fetchImpl = fakeGitHub(release('v0.3.0'));
    const updater = createUpdater(options(fetchImpl));
    await Promise.all([updater.check(), updater.status()]);
    await updater.status();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('downloads the installer and hands it over to install', async () => {
    let installed;
    const install = vi.fn(async (file) => {
      installed = await fs.readFile(file);
    });
    const updater = createUpdater(options(fakeGitHub(release('v0.3.0')), install));
    await updater.check();

    expect((await updater.install()).phase).toBe('downloading');
    await vi.waitFor(() => expect(install).toHaveBeenCalled());
    expect([...installed]).toEqual([1, 2, 3, 4, 5]);
    expect(install.mock.calls[0][1]).toMatchObject({ version: '0.3.0' });
  });

  it('goes back to idle with the reason when installing fails', async () => {
    const install = vi.fn(async () => {
      throw new Error('No room left.');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const updater = createUpdater(options(fakeGitHub(release('v0.3.0')), install));
    await updater.check();
    await updater.install();

    await vi.waitFor(async () =>
      expect(await updater.status()).toMatchObject({ phase: 'idle', installError: 'No room left.' }),
    );
  });

  it('refuses to install when there is nothing newer', async () => {
    const updater = createUpdater(options(fakeGitHub(release('v0.2.3'))));
    await updater.check();
    await expect(updater.install()).rejects.toMatchObject({ status: 400 });
  });
});
