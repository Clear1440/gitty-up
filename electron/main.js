import path from 'node:path';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { config } from '../server/config.js';
import { startServer } from '../server/start.js';
import { UrlHelper } from '../server/utils/UrlHelper.js';
import { MIN_SIZE } from './windowBounds.js';
import { initialWindowState, rememberWindowState } from './windowState.js';

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

/** Whether a link points at a web page outside the app, to open in the default browser. */
function isExternal(url, appOrigin) {
  const parsed = UrlHelper.tryParse(url);
  if (!parsed) return false;
  const isWeb = parsed.protocol === 'https:' || parsed.protocol === 'http:';
  return isWeb && parsed.origin !== appOrigin;
}

function createWindow(appUrl) {
  const { bounds, maximized } = initialWindowState();
  const window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: 'Gitty Up',
    backgroundColor: BACKGROUND_COLOR,
    autoHideMenuBar: true,
    show: false,
  });
  rememberWindowState(window);
  const appOrigin = new URL(appUrl).origin;

  // Links such as pull requests open in the default browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url, appOrigin)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (UrlHelper.tryParse(url)?.origin === appOrigin) return;
    event.preventDefault();
    if (isExternal(url, appOrigin)) shell.openExternal(url);
  });

  window.once('ready-to-show', () => {
    // Maximizing shows the window, so it waits until there is something to show.
    if (maximized) window.maximize();
    window.show();
  });
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
      dialog.showErrorBox('Gitty Up could not start', error.message);
      app.quit();
    });
}
