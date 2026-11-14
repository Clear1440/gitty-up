import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { TextHelper } from '../utils/TextHelper.js';
import styles from './AheadBehind.module.css';

/** Shows how far a branch has diverged from its upstream. Renders nothing when level. */
export function AheadBehind({ ahead, behind }) {
  if (!ahead && !behind) return null;
  return (
    <span className={styles.root}>
      {ahead > 0 && (
        <span title={`${TextHelper.countOf(ahead, 'commit')} to push`}>
          <ArrowUpOutlined /> {ahead}
        </span>
      )}
      {behind > 0 && (
        <span title={`${TextHelper.countOf(behind, 'commit')} to pull`}>
          <ArrowDownOutlined /> {behind}
        </span>
      )}
    </span>
  );
}
