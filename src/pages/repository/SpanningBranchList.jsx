import { ClusterOutlined } from '@ant-design/icons';
import { TextHelper } from '../../utils/TextHelper.js';
import { useRepositoryContext } from './RepositoryContext.js';
import { RepositoryDot } from './RepositoryTag.jsx';
import rowStyles from './BranchRow.module.css';
import styles from './SpanningBranchList.module.css';

/**
 * Branches some of the group's repositories have. Choosing one asks to line the whole
 * group up on it: see SwitchSpanDialog.
 */
export function SpanningBranchList({ branches }) {
  const { openDialog, isBusy } = useRepositoryContext();
  if (branches.length === 0) return <p className={styles.empty}>No branches</p>;

  return (
    <ul className={styles.list}>
      {branches.map(({ name, repositories, total }) => {
        const names = TextHelper.joinWithAnd(repositories.map((repository) => repository.name));
        return (
          <li key={name} className={rowStyles.row}>
            <button
              type="button"
              className={rowStyles.button}
              title={`${names} ${repositories.length === 1 ? 'has' : 'have'} ${name}.\nClick to switch the group to it.`}
              disabled={isBusy}
              onClick={() => openDialog('switchSpan', { branch: name })}
            >
              <ClusterOutlined />
              <span className={rowStyles.name}>{name}</span>
              <span className={styles.dots} aria-label={`In ${names}`}>
                {repositories.map(({ id, slot }) => (
                  <RepositoryDot key={id} slot={slot} />
                ))}
              </span>
              <span className={styles.count}>
                {repositories.length}/{total}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
