import fs from 'node:fs';
import path from 'node:path';
import { app, screen } from 'electron';
import { chooseBounds } from './windowBounds.js';

/** How long the window must sit still before its place is written down. */
const SAVE_DELAY_MS = 500;

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // Not worth failing over: the window just opens in the default place next time.
  }
}

/**
 * Where to open the window: where it was last, if that screen is still connected, or
 * else on the screen the pointer is on, sized to fit. `maximized` says to maximize it.
 */
export function initialWindowState() {
  const saved = readState();
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = chooseBounds(saved?.bounds, screen.getAllDisplays(), cursorDisplay);
  return { bounds, maximized: Boolean(saved?.maximized) };
}

/** Writes down where the window is whenever it moves, resizes or closes. */
export function rememberWindowState(window) {
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    // The size it returns to from maximized, so un-maximizing next time still works.
    writeState({ bounds: window.getNormalBounds(), maximized: window.isMaximized() });
  };
  const saveSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };

  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) window.on(event, saveSoon);
  window.on('close', save);
}
