import { InboxOutlined, MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';
import clsx from 'clsx';
import { useMatch, useNavigate, useSearchParams } from 'react-router';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { StashSelection, paths } from '../../paths.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { useStashMenu } from './useStashMenu.js';
import styles from './StashList.module.css';

/**
 * Opens a stash in the history page's side pane, or closes it if it is already open.
 * On the history page this keeps whatever branch is showing.
 */
function useStashPreview() {
  const { repository } = useRepositoryContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const onHistory = Boolean(useMatch('/repositories/:repositoryId/history'));
  const openHash = onHistory ? StashSelection.toHash(searchParams.get('commit')) : null;

  const toggle = (hash) => {
    if (!onHistory) {
      navigate(paths.stash(repository.id, hash));
      return;
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (openHash === hash) next.delete('commit');
        else next.set('commit', StashSelection.toValue(hash));
        return next;
      },
      { replace: true },
    );
  };

  return { openHash, toggle };
}

function StashRow({ stash, selected, onPreview }) {
  const items = useStashMenu(stash);
  // React bubbles events out of the menu to here, though it is elsewhere on the page.
  const isInRow = (event) => event.currentTarget.contains(event.target);

  return (
    <Dropdown menu={{ items }} trigger={['contextMenu']}>
      <li
        className={clsx(styles.row, selected && styles.selected)}
        onClick={(event) => isInRow(event) && onPreview(stash.hash)}
      >
        <InboxOutlined className={styles.icon} />
        {/* The whole row is clickable. This is what keyboards and screen readers use. */}
        <button
          type="button"
          className={styles.text}
          title={stash.message}
          aria-pressed={selected}
          aria-label={`Preview stash ${stash.message}`}
        >
          <span className={styles.message}>{stash.message}</span>
          <span className={styles.meta}>
            {stash.repository && `${stash.repository} · `}
            {stash.branch && `${stash.branch} · `}
            <RelativeTime date={stash.date} />
          </span>
        </button>
        <Dropdown menu={{ items }} trigger={['click']}>
          <Button
            className={styles.menu}
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label={`Actions for stash ${stash.message}`}
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      </li>
    </Dropdown>
  );
}

export function StashList({ stashes }) {
  const { openHash, toggle } = useStashPreview();
  if (stashes.length === 0) return <p className={styles.empty}>No stashes</p>;
  return (
    <ul className={styles.list}>
      {stashes.map((stash) => (
        <StashRow
          key={stash.ref}
          stash={stash}
          selected={Boolean(openHash) && stash.hash === openHash}
          onPreview={toggle}
        />
      ))}
    </ul>
  );
}
