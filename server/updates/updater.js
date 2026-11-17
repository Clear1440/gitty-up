import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ApiError } from '../errors.js';

const API_URL = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
/** A status older than this is checked again the next time it is asked for. */
const RECHECK_AFTER_MS = 6 * 60 * 60_000;

/** The file each release builds for each system, as named by electron-builder. */
const INSTALLER_EXTENSIONS = { win32: '.exe', darwin: '.dmg', linux: '.AppImage' };

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** `1.2.3` or `v1.2.3-beta.1` as `{ numbers, prerelease }`, or null if it isn't a version. */
export function parseVersion(text) {
  const match = VERSION.exec(text?.trim() ?? '');
  if (!match) return null;
  return { numbers: match.slice(1, 4).map(Number), prerelease: match[4] ?? null };
}

/** Below zero if `a` is older than `b`, zero if the same, above zero if newer. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index++) {
    const difference = left.numbers[index] - right.numbers[index];
    if (difference !== 0) return difference;
  }
  // A prerelease comes before the release it leads up to.
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease.localeCompare(right.prerelease, 'en', { numeric: true });
}

/** The release asset that installs on `platform`, as `{ name, url, size }`, or null. */
export function pickInstaller(assets, platform) {
  const extension = INSTALLER_EXTENSIONS[platform];
  if (!extension) return null;
  const asset = assets?.find(({ name }) => name.endsWith(extension));
  return asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null;
}

/**
 * Checks GitHub for a newer release of the app, and downloads and installs it.
 *
 * `repository` is `owner/name`. `install(file, release)` puts the downloaded installer
 * in place and restarts the app; it belongs to the desktop app, which is the only
 * place that can replace itself.
 */
export function createUpdater({
  repository,
  currentVersion,
  install,
  platform = process.platform,
  fetchImpl = fetch,
}) {
  let latest = null;
  let checkedAt = null;
  let checkError = null;
  let checking = null;
  /** 'idle', 'downloading' or 'installing'. */
  let phase = 'idle';
  let progress = null;
  let installError = null;

  const isAvailable = () =>
    Boolean(latest?.installer) && compareVersions(latest.version, currentVersion) > 0;

  const status = () => ({
    supported: true,
    currentVersion,
    latestVersion: latest?.version ?? null,
    available: isAvailable(),
    releaseUrl: latest?.url ?? null,
    checkedAt,
    checkError,
    phase,
    progress,
    installError,
  });

  async function fetchLatestRelease() {
    const response = await fetchImpl(`${API_URL}/repos/${repository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gitty-up' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // Nothing published yet.
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub answered with HTTP ${response.status}.`);
    const release = await response.json();
    return {
      version: release.tag_name.replace(/^v/, ''),
      url: release.html_url,
      installer: pickInstaller(release.assets, platform),
    };
  }

  /** Asks GitHub for the latest release. Calls made while one is under way share it. */
  async function check() {
    checking ??= (async () => {
      try {
        latest = await fetchLatestRelease();
        checkError = null;
      } catch (error) {
        checkError = error.name === 'TimeoutError' ? 'GitHub did not answer in time.' : error.message;
      } finally {
        checkedAt = new Date().toISOString();
        checking = null;
      }
    })();
    await checking;
    return status();
  }

  /** The status, checking first if it has never been checked or the check is stale. */
  async function currentStatus() {
    const isStale = !checkedAt || Date.now() - Date.parse(checkedAt) > RECHECK_AFTER_MS;
    if (checking || (isStale && phase === 'idle')) await check();
    return status();
  }

  async function download({ name, url, size }) {
    const folder = await fsp.mkdtemp(path.join(os.tmpdir(), 'gitty-up-update-'));
    const file = path.join(folder, name);
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': 'gitty-up' },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      throw new Error(`The download failed with HTTP ${response.status}.`);
    }

    const total = Number(response.headers.get('content-length')) || size || 0;
    let received = 0;
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        if (total) progress = Math.min(received / total, 1);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(file));
    if (size && received !== size) throw new Error('The download was cut short. Try again.');
    return file;
  }

  /**
   * Starts downloading and installing the latest release, and answers straight away.
   * The status follows its progress, and the app restarts once it is installed.
   */
  async function startInstall() {
    if (phase !== 'idle') return status();
    if (!isAvailable()) throw ApiError.badRequest('There is no update to install.');

    const release = latest;
    phase = 'downloading';
    progress = 0;
    installError = null;
    (async () => {
      try {
        const file = await download(release.installer);
        phase = 'installing';
        progress = null;
        await install(file, release);
      } catch (error) {
        console.error('Could not install the update:', error);
        phase = 'idle';
        progress = null;
        installError =
          error.name === 'TimeoutError' ? 'The download took too long. Try again.' : error.message;
      }
    })();
    return status();
  }

  return { status: currentStatus, check, install: startInstall };
}
