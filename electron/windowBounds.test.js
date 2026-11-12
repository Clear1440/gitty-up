import { describe, expect, it } from 'vitest';
import { MIN_SIZE, centeredIn, chooseBounds } from './windowBounds.js';

const laptop = { id: 1, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const monitor = { id: 2, workArea: { x: 1440, y: 0, width: 2560, height: 1415 } };
const displays = [laptop, monitor];

describe('centeredIn', () => {
  it('fits the preferred size to a small screen, centered', () => {
    const bounds = centeredIn(laptop.workArea);
    expect(bounds.width).toBe(1440);
    expect(bounds.height).toBe(875);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(25);
  });

  it('keeps the preferred size on a large screen', () => {
    expect(centeredIn(monitor.workArea)).toEqual({ x: 2000, y: 258, width: 1440, height: 900 });
  });

  it('never goes under the minimum size unless the screen itself is smaller', () => {
    const tiny = { x: 0, y: 0, width: 800, height: 500 };
    expect(centeredIn(tiny)).toEqual({ x: 0, y: 0, width: 800, height: 500 });
    expect(centeredIn(monitor.workArea, { width: 100, height: 100 })).toMatchObject(MIN_SIZE);
  });
});

describe('chooseBounds', () => {
  it('reopens where it was, on the screen it was on', () => {
    const saved = { x: 1600, y: 100, width: 1200, height: 800 };
    expect(chooseBounds(saved, displays, laptop)).toEqual(saved);
  });

  it('opens on the fallback screen when the saved one is gone', () => {
    const saved = { x: 5000, y: 100, width: 1200, height: 800 };
    expect(chooseBounds(saved, displays, laptop)).toEqual(centeredIn(laptop.workArea));
  });

  it('opens on the fallback screen when nothing was saved or it is broken', () => {
    expect(chooseBounds(null, displays, monitor)).toEqual(centeredIn(monitor.workArea));
    expect(chooseBounds({ x: 'a' }, displays, monitor)).toEqual(centeredIn(monitor.workArea));
  });

  it('shrinks a window too big for its screen and pulls it back on', () => {
    const saved = { x: 200, y: 25, width: 2400, height: 1400 };
    expect(chooseBounds(saved, displays, monitor)).toEqual({ x: 0, y: 25, width: 1440, height: 875 });
  });

  it('does not count a window whose title bar is off screen', () => {
    const saved = { x: 100, y: -700, width: 1200, height: 800 };
    expect(chooseBounds(saved, displays, monitor)).toEqual(centeredIn(monitor.workArea));
  });
});
