import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { config } from '../server/config.js';
import { startServer } from '../server/start.js';

/** The app's own background, so the window doesn't flash white while it loads. */
const BACKGROUND_COLOR = '#0f1218';

/**
 * Apps opened from Finder or the Dock get only the system PATH, which misses
 * git (and credential helpers) installed by Homebrew or MacPorts.
 */
function addCommonToolPaths() {
  if (process.platform === 'win32') return;
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin'];
  const current = (process.env.PATH ?? '').split(path.delimiter);
  process.env.PATH = [...new Set([...extra, ...current])].filter(Boolean).join(path.delimiter);
}

/**
 * Prefers the usual port, so the page keeps the same origin and its saved tabs
 * between launches, and falls back to any free port if something else holds it.
 */
async function startLocalServer() {
  const options = { host: '127.0.0.1', dataDir: config.dataDir };
  try {
    return await startServer({ ...options, port: config.port });
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    return startServer({ ...options, port: 0 });
  }
}

function isExternal(url, appOrigin) {
  try {
    const { origin, protocol } = new URL(url);
    return origin !== appOrigin && (protocol === 'https:' || protocol === 'http:');
  } catch {
    return false;
  }
}

function createWindow(appUrl) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Gity Up',
    backgroundColor: BACKGROUND_COLOR,
    autoHideMenuBar: true,
    show: false,
  });
  const appOrigin = new URL(appUrl).origin;

  // Links such as pull requests open in the default browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url, appOrigin)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === appOrigin) return;
    event.preventDefault();
    if (isExternal(url, appOrigin)) shell.openExternal(url);
  });

  window.once('ready-to-show', () => window.show());
  window.loadURL(appUrl);
  return window;
}

// A second launch focuses the open window instead of starting another server.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  addCommonToolPaths();
  let appUrl;

  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  // macOS keeps the app running with no windows, and the Dock icon opens a new one.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (appUrl && BrowserWindow.getAllWindows().length === 0) createWindow(appUrl);
  });

  // Not a top-level await: Electron only becomes ready once this module has finished loading.
  app
    .whenReady()
    .then(startLocalServer)
    .then(({ port }) => {
      appUrl = `http://127.0.0.1:${port}`;
      createWindow(appUrl);
    })
    .catch((error) => {
      dialog.showErrorBox('Gity Up could not start', error.message);
      app.quit();
    });
}
