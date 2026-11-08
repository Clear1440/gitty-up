import { ClusterOutlined, HomeFilled } from '@ant-design/icons';
import { Tabs } from 'antd';
import clsx from 'clsx';
import { cloneElement, useState } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '../components/Logo.jsx';
import { paths } from '../paths.js';
import { useRepositories, useRepositoryGroups } from '../queries/repositories.js';
import { useTabs } from '../tabs/TabsContext.jsx';
import { findNeighbourTab } from '../tabs/tabsModel.js';
import { MonoIdHelper } from '../utils/MonoIdHelper.js';
import styles from './TabBar.module.css';

const HOME_TAB = 'home';

/** A private type, so a dragged tab cannot drop as text into a field. */
const DRAG_TYPE = 'application/x-gitty-up-tab';

const HOME_ITEM = {
  key: HOME_TAB,
  label: 'Repositories',
  icon: <HomeFilled />,
  closable: false,
};

/**
 * Drag state for reordering. Home is left out on purpose: it can neither be
 * dragged nor dropped on, so it always stays first.
 */
function useTabDrag(onMove) {
  const [dragged, setDragged] = useState(null);
  const [drop, setDrop] = useState(null);

  const finish = () => {
    setDragged(null);
    setDrop(null);
  };

  const wrapTab = (node) => {
    const repositoryId = node.key;
    if (repositoryId === HOME_TAB) return node;

    const isDropTarget = drop?.targetId === repositoryId;
    return cloneElement(node, {
      draggable: true,
      className: clsx(
        node.props.className,
        repositoryId === dragged && styles.dragging,
        isDropTarget && (drop.after ? styles.dropAfter : styles.dropBefore),
      ),
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(DRAG_TYPE, repositoryId);
        setDragged(repositoryId);
      },
      onDragOver: (event) => {
        if (!dragged) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (repositoryId === dragged) {
          setDrop(null);
          return;
        }
        const { left, width } = event.currentTarget.getBoundingClientRect();
        const after = event.clientX > left + width / 2;
        if (!isDropTarget || drop.after !== after) setDrop({ targetId: repositoryId, after });
      },
      onDragLeave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDrop(null);
      },
      onDrop: (event) => {
        event.preventDefault();
        if (drop) onMove(dragged, drop.targetId, drop.after);
        finish();
      },
      onDragEnd: finish,
    });
  };

  return wrapTab;
}

export function TabBar({ activeRepositoryId }) {
  const navigate = useNavigate();
  const { tabs, closeTab, moveTab } = useTabs();
  const { data: repositories } = useRepositories();
  const { data: groups } = useRepositoryGroups();
  const wrapTab = useTabDrag(moveTab);
  // The next repository can take a moment to load, and its page only appears once it
  // has. Showing the clicked tab as active straight away makes the click feel instant.
  const [switching, setSwitching] = useState(null);
  const activeKey = activeRepositoryId ?? HOME_TAB;
  if (switching && switching.from !== activeKey) setSwitching(null);

  const nameOf = (repositoryId) => {
    if (MonoIdHelper.isMonoId(repositoryId)) {
      const groupId = MonoIdHelper.toGroupId(repositoryId);
      return groups?.find((group) => group.id === groupId)?.name;
    }
    return repositories?.find((repository) => repository.id === repositoryId)?.name;
  };

  // A tab can outlive its repository if it was unlinked in another window.
  const openTabs = repositories && groups ? tabs.filter((tab) => nameOf(tab.repositoryId)) : tabs;

  const items = [
    HOME_ITEM,
    ...openTabs.map((tab) => ({
      key: tab.repositoryId,
      label: nameOf(tab.repositoryId) ?? '…',
      icon: MonoIdHelper.isMonoId(tab.repositoryId) ? <ClusterOutlined /> : undefined,
    })),
  ];

  const handleChange = (key) => {
    const tab = tabs.find(({ repositoryId }) => repositoryId === key);
    setSwitching({ from: activeKey, to: key });
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
        activeKey={switching?.to ?? activeKey}
        items={items}
        tabBarExtraContent={{ left: <Logo /> }}
        renderTabBar={(tabBarProps, DefaultTabBar) => (
          <DefaultTabBar {...tabBarProps}>{wrapTab}</DefaultTabBar>
        )}
        onChange={handleChange}
        onEdit={(key, action) => {
          if (action === 'remove') handleClose(key);
        }}
      />
    </header>
  );
}
