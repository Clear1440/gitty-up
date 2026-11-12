import { ClusterOutlined, HomeFilled, SettingFilled, SettingOutlined } from '@ant-design/icons';
import { Button, Tabs, Tooltip } from 'antd';
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
/** Shown only while the settings page is open, and never saved with the other tabs. */
const SETTINGS_TAB = 'settings';
const FIXED_TABS = new Set([HOME_TAB, SETTINGS_TAB]);

/** A private type, so a dragged tab cannot drop as text into a field. */
const DRAG_TYPE = 'application/x-gitty-up-tab';

const HOME_ITEM = {
  key: HOME_TAB,
  label: 'Repositories',
  icon: <HomeFilled />,
  closable: false,
};

const SETTINGS_ITEM = {
  key: SETTINGS_TAB,
  label: 'Settings',
  icon: <SettingFilled />,
};

/**
 * Drag state for reordering. Home and settings are left out on purpose: they can
 * neither be dragged nor dropped on, so home always stays first.
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
    if (FIXED_TABS.has(repositoryId)) return node;

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

export function TabBar({ activeRepositoryId, isSettings = false }) {
  const navigate = useNavigate();
  const { tabs, closeTab, moveTab } = useTabs();
  const { data: repositories } = useRepositories();
  const { data: groups } = useRepositoryGroups();
  const wrapTab = useTabDrag(moveTab);
  // The next repository can take a moment to load, and its page only appears once it
  // has. Showing the clicked tab as active straight away makes the click feel instant.
  const [switching, setSwitching] = useState(null);
  const activeKey = isSettings ? SETTINGS_TAB : (activeRepositoryId ?? HOME_TAB);
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
    ...(isSettings ? [SETTINGS_ITEM] : []),
  ];

  const handleChange = (key) => {
    if (key === SETTINGS_TAB) {
      navigate(paths.settings());
      return;
    }
    const tab = tabs.find(({ repositoryId }) => repositoryId === key);
    setSwitching({ from: activeKey, to: key });
    navigate(tab ? tab.path : paths.home());
  };

  const handleClose = (repositoryId) => {
    if (repositoryId === SETTINGS_TAB) {
      navigate(paths.home());
      return;
    }
    if (repositoryId === activeRepositoryId) {
      const neighbour = findNeighbourTab(openTabs, repositoryId);
      navigate(neighbour ? neighbour.path : paths.home());
    }
    closeTab(repositoryId);
  };

  /**
   * Middle-clicking anywhere on a tab closes it, as in a browser. Ant Design only does
   * this for a click on the tab's label, so the rest of the tab, its padding and its close
   * button, is handled here, leaving the label to Ant's own handler.
   */
  const withMiddleClickClose = (node) => {
    if (node.key === HOME_TAB) return node;
    return cloneElement(node, {
      onMouseDown: (event) => {
        if (event.button !== 1) return;
        // Stops Windows and Linux starting to autoscroll the page.
        event.preventDefault();
        if (!event.target.closest('.ant-tabs-tab-btn')) handleClose(node.key);
      },
    });
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
        tabBarExtraContent={{
          left: <Logo />,
          right: (
            <Tooltip title="Settings" placement="bottomRight">
              <Button
                type="text"
                aria-label="Settings"
                aria-pressed={isSettings}
                icon={isSettings ? <SettingFilled /> : <SettingOutlined />}
                onClick={() => navigate(paths.settings())}
              />
            </Tooltip>
          ),
        }}
        renderTabBar={(tabBarProps, DefaultTabBar) => (
          <DefaultTabBar {...tabBarProps}>{(node) => wrapTab(withMiddleClickClose(node))}</DefaultTabBar>
        )}
        onChange={handleChange}
        onEdit={(key, action) => {
          if (action === 'remove') handleClose(key);
        }}
      />
    </header>
  );
}
