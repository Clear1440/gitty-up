import { useCallback, useState } from 'react';
import { StorageHelper } from './StorageHelper.js';

const acceptAnything = () => true;

/**
 * Like useState, but remembered in localStorage between sessions. `isValid` can turn
 * down a stored value that no longer applies, which then falls back to `fallback`.
 */
export function useStoredState(key, fallback, { isValid = acceptAnything } = {}) {
  const [value, setValue] = useState(() => {
    const stored = StorageHelper.read(key, fallback);
    return isValid(stored) ? stored : fallback;
  });

  const setAndStore = useCallback(
    (next) => {
      setValue(next);
      StorageHelper.write(key, next);
    },
    [key],
  );

  return [value, setAndStore];
}
