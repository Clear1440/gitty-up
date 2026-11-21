import { TagOutlined } from '@ant-design/icons';
import { MenuRow } from '../../components/MenuRow.jsx';
import { RelativeTime } from '../../components/RelativeTime.jsx';
import { TagHelper } from './TagHelper.js';
import { useShowTag, useTagMenu } from './useTagMenu.js';
import styles from './TagList.module.css';

function TagRow({ tag }) {
  const showTag = useShowTag();
  const items = useTagMenu(tag.name, { show: true });
  const show = () => showTag(tag);

  return (
    <MenuRow
      items={items}
      className={styles.row}
      onActivate={show}
      menuLabel={`Actions for tag ${tag.name}`}
      menuClassName={styles.menu}
    >
      <TagOutlined className={styles.icon} />
      {/* The whole row is clickable. This is what keyboards and screen readers use. */}
      <button
        type="button"
        className={styles.text}
        title={TagHelper.describe(tag)}
        aria-label={`Show tag ${tag.name} in the history`}
      >
        <span className={styles.message}>{tag.name}</span>
        <span className={styles.meta}>
          {tag.commit} · <RelativeTime date={tag.date} />
        </span>
      </button>
    </MenuRow>
  );
}

/** `tags` are the ones to show, newest first. `filtered` says why the list may be empty. */
export function TagList({ tags, filtered = false }) {
  if (tags.length === 0) {
    return <p className={styles.empty}>{filtered ? 'No matching tags' : 'No tags'}</p>;
  }
  return (
    <ul className={styles.list}>
      {tags.map((tag) => (
        <TagRow key={tag.name} tag={tag} />
      ))}
    </ul>
  );
}
