import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import clsx from 'clsx';
import { TextHelper } from '../utils/TextHelper.js';
import styles from './AheadBehind.module.css';

/**
 * Shows how far a branch has diverged from its upstream. Renders nothing when level,
 * unless `aligned`: then each count always takes its own grid cell of the parent, empty
 * or not, so the counts line up down a list.
 */
export function AheadBehind({ ahead, behind, aligned = false }) {
  if (!aligned && !ahead && !behind) return null;
  const blank = aligned ? <span /> : null;
  return (
    <span className={clsx(styles.root, aligned && styles.aligned)}>
      {ahead > 0 ? (
        <span title={`${TextHelper.countOf(ahead, 'commit')} to push`}>
          <ArrowUpOutlined /> {ahead}
        </span>
      ) : (
        blank
      )}
      {behind > 0 ? (
        <span title={`${TextHelper.countOf(behind, 'commit')} to pull`}>
          <ArrowDownOutlined /> {behind}
        </span>
      ) : (
        blank
      )}
    </span>
  );
}
