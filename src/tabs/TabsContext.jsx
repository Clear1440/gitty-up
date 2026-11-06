import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { readStored, writeStored } from '../utils/storage.js';
import { removeTab, rememberTab } from './tabsModel.js';

const STORAGE_KEY = 'gity-up.tabs';

const TabsContext = createContext(null);

export function TabsProvider({ children }) {
  const [tabs, setTabs] = useState(() => readStored(STORAGE_KEY, []));

  useEffect(() => {
    writeStored(STORAGE_KEY, tabs);
  }, [tabs]);

  // Stable across renders, so effects can depend on these safely.
  const actions = useMemo(
    () => ({
      rememberTab: (repositoryId, path) =>
        setTabs((current) => rememberTab(current, repositoryId, path)),
      closeTab: (repositoryId) => setTabs((current) => removeTab(current, repositoryId)),
    }),
    [],
  );

  const value = useMemo(() => ({ tabs, ...actions }), [tabs, actions]);

  return <TabsContext value={value}>{children}</TabsContext>;
}

export function useTabs() {
  return useContext(TabsContext);
}
