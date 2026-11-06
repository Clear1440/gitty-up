import { HomeFilled } from '@ant-design/icons';
import { Tabs } from 'antd';
import clsx from 'clsx';
import { cloneElement, useState } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '../components/Logo.jsx';
import { paths } from '../paths.js';
import { useRepositories } from '../queries/repositories.js';
import { useTabs } from '../tabs/TabsContext.jsx';
import { findNeighbourTab } from '../tabs/tabsModel.js';
import styles from './TabBar.module.css';

const HOME_TAB = 'home';

/** A private type, so a dragged tab cannot drop as text into a field. */
const DRAG_TYPE = 'application/x-gity-up-tab';

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
  const wrapTab = useTabDrag(moveTab);

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
