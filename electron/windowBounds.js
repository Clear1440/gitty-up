/**
 * Where the window opens. Kept free of Electron so it can be tested on its own.
 * A rectangle is `{ x, y, width, height }`, and a display is Electron's, with `workArea`
 * being the part of the screen not taken by the menu bar, Dock or taskbar.
 */

export const PREFERRED_SIZE = { width: 1440, height: 900 };
export const MIN_SIZE = { width: 900, height: 600 };

/** How much of the window's top edge must be on a screen for it to be grabbed and moved. */
const VISIBLE_TOP = { width: 120, height: 40 };

function overlap(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? { width, height } : null;
}

const isRectangle = (value) =>
  Boolean(value) && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(value[key]));

/** Shrinks a size to fit inside a work area, without going under the window's minimum. */
function fitSize({ width, height }, workArea) {
  return {
    width: Math.round(Math.max(Math.min(width, workArea.width), Math.min(MIN_SIZE.width, workArea.width))),
    height: Math.round(Math.max(Math.min(height, workArea.height), Math.min(MIN_SIZE.height, workArea.height))),
  };
}

/** The display a saved window's title bar is on, if it is still on one well enough to grab. */
function displayHolding(bounds, displays) {
  const topEdge = { x: bounds.x, y: bounds.y, width: bounds.width, height: VISIBLE_TOP.height };
  let best = null;
  for (const display of displays) {
    const shared = overlap(topEdge, display.workArea);
    if (!shared || shared.width < Math.min(VISIBLE_TOP.width, bounds.width)) continue;
    const area = shared.width * shared.height;
    if (!best || area > best.area) best = { display, area };
  }
  return best?.display ?? null;
}

/** A window centered in a work area, as large as it prefers to be but no larger than fits. */
export function centeredIn(workArea, size = PREFERRED_SIZE) {
  const { width, height } = fitSize(size, workArea);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

/**
 * The bounds to open with. The saved ones, when they are still on a connected screen,
 * shrunk to fit if that screen is now smaller. Otherwise centered on `fallbackDisplay`,
 * the one the pointer is on, sized to fit it. Opening larger than the screen lets the
 * system pick a size, and zooming then flips between that and something unexpected.
 */
export function chooseBounds(saved, displays, fallbackDisplay) {
  if (isRectangle(saved)) {
    const display = displayHolding(saved, displays);
    if (display) {
      const { workArea } = display;
      const { width, height } = fitSize(saved, workArea);
      // Pulled back inside if shrinking left it hanging off the right or bottom.
      const x = Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - width);
      const y = Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - height);
      return { x: Math.round(x), y: Math.round(y), width, height };
    }
  }
  return centeredIn(fallbackDisplay.workArea);
}
