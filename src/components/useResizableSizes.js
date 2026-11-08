import { useEffect, useState } from 'react';
import { StorageHelper } from '../utils/StorageHelper.js';

const KEYBOARD_STEP = 16;

/** How each edge of an element moves. Dragging right or down is positive. */
const EDGES = {
  right: { isVertical: false, direction: 1 },
  left: { isVertical: false, direction: -1 },
  bottom: { isVertical: true, direction: 1 },
};

export function clampSize(size, { min, max }) {
  return Math.min(Math.max(size, min), max);
}

/** Keeps the stored sizes that still apply. Stored data can be stale or hand edited. */
export function sanitizeSizes(stored, limits) {
  const entries = Object.entries(limits)
    .filter(([name]) => Number.isFinite(stored?.[name]))
    .map(([name, limit]) => [name, clampSize(stored[name], limit)]);
  return Object.fromEntries(entries);
}

/** How much an arrow key changes the size from this edge, or 0 if it doesn't apply. */
export function keyboardStep(key, edge) {
  const { isVertical, direction } = EDGES[edge];
  const steps = isVertical
    ? { ArrowUp: -KEYBOARD_STEP, ArrowDown: KEYBOARD_STEP }
    : { ArrowLeft: -KEYBOARD_STEP, ArrowRight: KEYBOARD_STEP };
  return (steps[key] ?? 0) * direction;
}

/**
 * Sizes the user can drag, remembered between sessions.
 *
 * Each size is the CSS variable `--{group}-{name}` on the container, and is unset
 * until the user resizes, so stylesheets keep their own default with
 * `var(--group-name, default)`.
 *
 * A drag writes to the variable directly and only reaches React state on release,
 * because re-rendering a long diff or history on every mouse move would stutter.
 *
 * `limits` must be a constant: `{ [name]: { min, max } }`.
 */
export function useResizableSizes(containerRef, group, limits) {
  const storageKey = `gitty-up.sizes.${group}`;
  const [sizes, setSizes] = useState(() =>
    sanitizeSizes(StorageHelper.read(storageKey, {}), limits),
  );

  useEffect(() => {
    StorageHelper.write(storageKey, sizes);
  }, [storageKey, sizes]);

  const variable = (name) => `--${group}-${name}`;
  const style = Object.fromEntries(
    Object.entries(sizes).map(([name, size]) => [variable(name), `${size}px`]),
  );

  /** `edge` is the side of the element being dragged. The handle must be its child. */
  const handleFor = (name, edge = 'right') => {
    const limit = limits[name];
    const { isVertical, direction } = EDGES[edge];
    const pointerPosition = (event) => (isVertical ? event.clientY : event.clientX);
    // Measured, because an unresized element's size only exists in the stylesheet.
    const measure = (handle) => {
      const { width, height } = handle.parentElement.getBoundingClientRect();
      return isVertical ? height : width;
    };
    const commit = (size) => setSizes((current) => ({ ...current, [name]: size }));

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      const handle = event.currentTarget;
      const start = pointerPosition(event);
      const startSize = measure(handle);
      let size = startSize;

      const onMove = (moveEvent) => {
        size = clampSize(startSize + (pointerPosition(moveEvent) - start) * direction, limit);
        containerRef.current?.style.setProperty(variable(name), `${size}px`);
      };
      const onEnd = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onEnd);
        handle.removeEventListener('pointercancel', onEnd);
        if (size !== startSize) commit(size);
      };

      handle.setPointerCapture(event.pointerId);
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onEnd);
      handle.addEventListener('pointercancel', onEnd);
    };

    const onKeyDown = (event) => {
      const step = keyboardStep(event.key, edge);
      if (!step) return;
      event.preventDefault();
      commit(clampSize(measure(event.currentTarget) + step, limit));
    };

    const onDoubleClick = () => {
      setSizes((current) => sanitizeSizes({ ...current, [name]: null }, limits));
    };

    return { edge, size: sizes[name], ...limit, onPointerDown, onKeyDown, onDoubleClick };
  };

  return { style, handleFor };
}
