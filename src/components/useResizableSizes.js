import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../utils/storage.js';

const KEYBOARD_STEP = 16;

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
  const storageKey = `gity-up.sizes.${group}`;
  const [sizes, setSizes] = useState(() => sanitizeSizes(readStored(storageKey, {}), limits));

  useEffect(() => {
    writeStored(storageKey, sizes);
  }, [storageKey, sizes]);

  const variable = (name) => `--${group}-${name}`;
  const style = Object.fromEntries(
    Object.entries(sizes).map(([name, size]) => [variable(name), `${size}px`]),
  );

  /** `edge` is the side of the element being dragged. The handle must be its child. */
  const handleFor = (name, edge = 'right') => {
    const limit = limits[name];
    const direction = edge === 'right' ? 1 : -1;
    // Measured, because an unresized element's size only exists in the stylesheet.
    const measure = (handle) => handle.parentElement.getBoundingClientRect().width;
    const commit = (size) => setSizes((current) => ({ ...current, [name]: size }));

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startSize = measure(handle);
      let size = startSize;

      const onMove = (moveEvent) => {
        size = clampSize(startSize + (moveEvent.clientX - startX) * direction, limit);
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
      const step = { ArrowLeft: -KEYBOARD_STEP, ArrowRight: KEYBOARD_STEP }[event.key];
      if (!step) return;
      event.preventDefault();
      commit(clampSize(measure(event.currentTarget) + step * direction, limit));
    };

    const onDoubleClick = () => {
      setSizes((current) => sanitizeSizes({ ...current, [name]: null }, limits));
    };

    return { edge, size: sizes[name], ...limit, onPointerDown, onKeyDown, onDoubleClick };
  };

  return { style, handleFor };
}
