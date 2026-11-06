import { useEffect } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router';
import { useTabs } from '../tabs/TabsContext.jsx';
import styles from './AppLayout.module.css';
import { TabBar } from './TabBar.jsx';

export function AppLayout() {
  const { pathname, search } = useLocation();
  const repositoryId = useMatch('/repositories/:repositoryId/*')?.params.repositoryId ?? null;
  const { rememberTab } = useTabs();

  // Any route into a repository opens its tab, so deep links and reloads just work.
  useEffect(() => {
    if (repositoryId) rememberTab(repositoryId, `${pathname}${search}`);
  }, [repositoryId, pathname, search, rememberTab]);

  return (
    <div className={styles.shell}>
      <TabBar activeRepositoryId={repositoryId} />
      <main className={styles.page}>
        <Outlet />
      </main>
    </div>
  );
}
