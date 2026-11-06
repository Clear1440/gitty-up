import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import styles from './AheadBehind.module.css';

/** Shows how far a branch has diverged from its upstream. Renders nothing when level. */
export function AheadBehind({ ahead, behind }) {
  if (!ahead && !behind) return null;
  return (
    <span className={styles.root}>
      {ahead > 0 && (
        <span title={`${ahead} ahead of upstream`}>
          <ArrowUpOutlined /> {ahead}
        </span>
      )}
      {behind > 0 && (
        <span title={`${behind} behind upstream`}>
          <ArrowDownOutlined /> {behind}
        </span>
      )}
    </span>
  );
}
