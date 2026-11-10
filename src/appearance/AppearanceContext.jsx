import { ConfigProvider } from 'antd';
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useSaveAppearance, useSettings } from '../queries/settings.js';
import { createAntdTheme } from '../styles/antdTheme.js';
import {
  DEFAULT_APPEARANCE,
  applyTheme,
  normalizeAppearance,
  SYSTEM_MODE,
  systemPrefersDark,
  watchSystemMode,
} from '../styles/themes.js';
import { StorageHelper } from '../utils/StorageHelper.js';

const STORAGE_KEY = 'gitty-up.appearance';

/** Normalized appearances list their keys in the same order, so equal ones match. */
const keyOf = (appearance) => JSON.stringify(appearance);

/**
 * The appearance last shown on this machine. The server holds the real one, but this
 * copy can be applied before anything loads, so the app opens in the right colors.
 */
export function readStoredAppearance() {
  return normalizeAppearance(StorageHelper.read(STORAGE_KEY, DEFAULT_APPEARANCE));
}

const AppearanceContext = createContext(null);

/** Applies the chosen color scheme and mode to the page and to Ant Design. */
export function AppearanceProvider({ children }) {
  const [appearance, setAppearanceState] = useState(readStoredAppearance);
  const { data: settings } = useSettings();
  const save = useSaveAppearance();
  const { mutateAsync: saveAppearance, isPending: isSaving } = save;

  // The server's copy wins whenever it changes. The stored copy can be stale, or lost
  // when the app is served from another port. A save in flight is left to finish first.
  const serverAppearance = settings && normalizeAppearance(settings.appearance);
  const [adoptedKey, setAdoptedKey] = useState(null);
  if (serverAppearance && !isSaving && keyOf(serverAppearance) !== adoptedKey) {
    setAdoptedKey(keyOf(serverAppearance));
    setAppearanceState(serverAppearance);
  }

  // Subscribing re-renders when the OS switches, so following the system repaints too.
  const systemMode = useSyncExternalStore(watchSystemMode, () =>
    systemPrefersDark() ? 'dark' : 'light',
  );
  const resolvedMode = appearance.mode === SYSTEM_MODE ? systemMode : appearance.mode;
  /** What is on show: the appearance with 'system' swapped for the OS's mode. */
  const shown = useMemo(() => ({ ...appearance, mode: resolvedMode }), [appearance, resolvedMode]);

  // Before paint, so the page and Ant's components change colors in the same frame.
  useLayoutEffect(() => {
    applyTheme(shown);
    StorageHelper.write(STORAGE_KEY, appearance);
  }, [shown, appearance]);

  /**
   * Shows the new appearance at once, and goes back if the server cannot save it.
   * `save: false` only previews it, such as while a color is being dragged; the server's
   * copy is left alone, so the preview stays until the next save or reload.
   */
  const setAppearance = useCallback(
    async (next, { save: shouldSave = true } = {}) => {
      const normalized = normalizeAppearance(next);
      setAppearanceState(normalized);
      if (!shouldSave) return;
      try {
        await saveAppearance(normalized);
      } catch (error) {
        // Adopts the server's copy again on the next render, which undoes the change.
        setAdoptedKey(null);
        throw error;
      }
    },
    [saveAppearance],
  );

  const antdTheme = useMemo(() => createAntdTheme(shown), [shown]);
  /** `resolvedMode` is the mode on show, 'dark' or 'light', even when following the system. */
  const value = useMemo(
    () => ({ appearance, resolvedMode, setAppearance }),
    [appearance, resolvedMode, setAppearance],
  );

  return (
    <AppearanceContext value={value}>
      <ConfigProvider theme={antdTheme} modal={{ mask: { blur: false } }}>
        {children}
      </ConfigProvider>
    </AppearanceContext>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
