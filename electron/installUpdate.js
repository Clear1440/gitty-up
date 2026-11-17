import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, shell } from 'electron';

const run = promisify(execFile);

/** Whether this copy of the app can replace itself with a downloaded installer. */
export function canInstallUpdates() {
  if (!app.isPackaged) return false;
  // On Linux only the AppImage is a single file that can be swapped for the new one.
  return process.platform !== 'linux' || Boolean(process.env.APPIMAGE);
}

/** Starts a program that carries on after this app quits, once it has really started. */
function startDetached(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', env });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * The NSIS installer closes this app if it is still open, installs over it quietly and
 * starts the new version (the flags electron-builder's own updater uses).
 */
async function installOnWindows(file) {
  await startDetached(file, ['--updated', '/S', '--force-run']);
  app.quit();
}

/**
 * Copies the new app out of the disk image next to this one, then swaps them over once
 * this app has quit, so nothing is replaced while it runs. If the swap fails, the old app
 * is put back. Either way the app is opened again.
 */
async function installOnMac(file) {
  const bundle = path.resolve(app.getPath('exe'), '../../..');
  const folder = path.dirname(bundle);
  if (!bundle.endsWith('.app')) throw new Error('Could not find the app to update.');
  try {
    await fs.access(folder, fs.constants.W_OK);
  } catch {
    await shell.openPath(file);
    throw new Error(
      `Gitty Up cannot replace itself in ${folder}, so the new version’s disk image is open instead. Drag the app from it into ${folder}.`,
    );
  }

  const mountPoint = path.join(path.dirname(file), 'mount');
  const staged = path.join(folder, `.${path.basename(bundle)}.update`);
  await run('hdiutil', ['attach', file, '-nobrowse', '-noautoopen', '-readonly', '-mountpoint', mountPoint]);
  try {
    const appName = (await fs.readdir(mountPoint)).find((name) => name.endsWith('.app'));
    if (!appName) throw new Error('The disk image has no app in it.');
    await fs.rm(staged, { recursive: true, force: true });
    await run('ditto', [path.join(mountPoint, appName), staged]);
  } finally {
    await run('hdiutil', ['detach', mountPoint, '-quiet']).catch(() => {});
  }
  await run('xattr', ['-dr', 'com.apple.quarantine', staged]).catch(() => {});

  const swap = [
    'while kill -0 "$APP_PID" 2>/dev/null; do sleep 0.2; done',
    'if mv "$TARGET" "$PREVIOUS"; then',
    '  if mv "$STAGED" "$TARGET"; then rm -rf "$PREVIOUS"; else mv "$PREVIOUS" "$TARGET"; fi',
    'fi',
    'open "$TARGET"',
  ].join('\n');
  await startDetached('/bin/sh', ['-c', swap], {
    ...process.env,
    APP_PID: String(process.pid),
    TARGET: bundle,
    STAGED: staged,
    PREVIOUS: `${staged}.previous`,
  });
  app.quit();
}

/** A running AppImage can be renamed over, as the system keeps the open one until it exits. */
async function installOnLinux(file) {
  const target = process.env.APPIMAGE;
  const staged = `${target}.update`;
  await fs.copyFile(file, staged);
  await fs.chmod(staged, 0o755);
  await fs.rename(staged, target);
  app.relaunch({ execPath: target, args: [] });
  app.exit(0);
}

/** Puts the downloaded installer in place and restarts into the new version. */
export async function installUpdate(file) {
  if (process.platform === 'win32') return installOnWindows(file);
  if (process.platform === 'darwin') return installOnMac(file);
  return installOnLinux(file);
}
