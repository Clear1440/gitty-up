import { HomeFilled } from '@ant-design/icons';
import { Tabs } from 'antd';
import { useNavigate } from 'react-router';
import { Logo } from '../components/Logo.jsx';
import { paths } from '../paths.js';
import { useRepositories } from '../queries/repositories.js';
import { useTabs } from '../tabs/TabsContext.jsx';
import { findNeighbourTab } from '../tabs/tabsModel.js';
import styles from './TabBar.module.css';

const HOME_TAB = 'home';

const HOME_ITEM = {
  key: HOME_TAB,
  label: 'Repositories',
  icon: <HomeFilled />,
  closable: false,
};

export function TabBar({ activeRepositoryId }) {
  const navigate = useNavigate();
  const { tabs, closeTab } = useTabs();
  const { data: repositories } = useRepositories();

  const nameOf = (repositoryId) =>
    repositories?.find((repository) => repository.id === repositoryId)?.name;

  // A tab can outlive its repository if it was unlinked in another window.
  const openTabs = repositories ? tabs.filter((tab) => nameOf(tab.repositoryId)) : tabs;

  const items = [
    HOME_ITEM,
    ...openTabs.map((tab) => ({
      key: tab.repositoryId,
      label: nameOf(tab.repositoryId) ?? '…',
    })),
  ];

  const handleChange = (key) => {
    const tab = tabs.find(({ repositoryId }) => repositoryId === key);
    navigate(tab ? tab.path : paths.home());
  };

  const handleClose = (repositoryId) => {
    if (repositoryId === activeRepositoryId) {
      const neighbour = findNeighbourTab(openTabs, repositoryId);
      navigate(neighbour ? neighbour.path : paths.home());
    }
    closeTab(repositoryId);
  };

  return (
    <header className={styles.tabBar}>
      <Tabs
        className={styles.tabs}
        type="editable-card"
        hideAdd
        size="small"
        activeKey={activeRepositoryId ?? HOME_TAB}
        items={items}
        tabBarExtraContent={{ left: <Logo /> }}
        onChange={handleChange}
        onEdit={(key, action) => {
          if (action === 'remove') handleClose(key);
        }}
      />
    </header>
  );
}
