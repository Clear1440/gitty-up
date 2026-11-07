import { useQueryClient } from '@tanstack/react-query';
import { Spin } from 'antd';
import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router';
import { loadRepository, refFromPath } from '../queries/loadRepository.js';
import { useTabs } from '../tabs/TabsContext.jsx';
import styles from './AppLayout.module.css';
import { TabBar } from './TabBar.jsx';

/**
 * Once the page has settled, loads the other open tabs one at a time, so switching to
 * them later is instant. Runs once per app start; later tabs open on demand.
 */
function useWarmOpenTabs(activeRepositoryId) {
  const queryClient = useQueryClient();
  const { tabs } = useTabs();
  // The tabs open at start. Restarting is cheap, as finished loads are skipped.
  const startingTabs = useRef({ tabs, activeRepositoryId });

  useEffect(() => {
    const { tabs: openTabs, activeRepositoryId: activeId } = startingTabs.current;
    const others = openTabs.filter((tab) => tab.repositoryId !== activeId);
    let isCancelled = false;

    const warm = async () => {
      for (const tab of others) {
        if (isCancelled) return;
        await loadRepository(queryClient, tab.repositoryId, refFromPath(tab.path));
      }
    };
    const whenIdle = window.requestIdleCallback ?? ((callback) => setTimeout(callback, 1000));
    const cancelIdle = window.cancelIdleCallback ?? clearTimeout;
    const handle = whenIdle(warm);
    return () => {
      isCancelled = true;
      cancelIdle(handle);
    };
  }, [queryClient]);
}

export function AppLayout() {
  const { pathname, search } = useLocation();
  const repositoryId = useMatch('/repositories/:repositoryId/*')?.params.repositoryId ?? null;
  const { rememberTab } = useTabs();
  useWarmOpenTabs(repositoryId);

  // Any route into a repository opens its tab, so deep links and reloads just work.
  useEffect(() => {
    if (repositoryId) rememberTab(repositoryId, `${pathname}${search}`);
  }, [repositoryId, pathname, search, rememberTab]);

  return (
    <div className={styles.shell}>
      <TabBar activeRepositoryId={repositoryId} />
      <main className={styles.page}>
        {/* Only seen on a first load. Later navigations keep the previous page up. */}
        <Suspense fallback={<Spin className="centered" size="large" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
