import { DownOutlined, FolderOutlined, RightOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { readStored, writeStored } from '../../utils/storage.js';
import { BranchRow } from './BranchRow.jsx';
import rowStyles from './BranchRow.module.css';
import styles from './BranchSidebar.module.css';

/**
 * Which folders the user has opened or closed, remembered per repository. Folders
 * they never touched have no entry, so they keep following `opensByDefault`.
 */
export function useFolderChoices(repositoryId) {
  const storageKey = `gity-up.branch-folders.${repositoryId}`;
  const [choices, setChoices] = useState(() => readStored(storageKey, {}));

  const setFolderOpen = (key, open) => {
    const next = { ...choices, [key]: open };
    setChoices(next);
    writeStored(storageKey, next);
  };

  return [choices, setFolderOpen];
}

/** A folder starts closed unless closing it would hide where the user is. */
function opensByDefault(folder, selectedRef) {
  // A closed remote would hide all of its branches for no gain.
  if (folder.isRemote) return true;
  return folder.branches.some((branch) => branch.isCurrent || branch.name === selectedRef);
}

function FolderRow({ folder, depth, open, onToggle, children }) {
  const Caret = open ? DownOutlined : RightOutlined;
  return (
    <li>
      <div className={rowStyles.row}>
        <button
          type="button"
          className={rowStyles.button}
          style={{ '--branch-depth': depth }}
          aria-expanded={open}
          title={folder.path}
          onClick={onToggle}
        >
          <Caret className={styles.caret} />
          <FolderOutlined className={styles.folderIcon} />
          <span className={rowStyles.name}>{folder.name}</span>
          <span className={styles.folderCount}>{folder.branches.length}</span>
        </button>
      </div>
      {open && children}
    </li>
  );
}

/** One level of the branch tree, and through its folders every level below it. */
export function BranchTree({ nodes, depth = 0, ...tree }) {
  const { kind, selectedRef, showAll, folderChoices, onFolderToggle } = tree;

  return (
    <ul className={styles.list}>
      {nodes.map((node) => {
        if (node.type === 'branch') {
          return (
            <BranchRow
              key={node.branch.name}
              branch={node.branch}
              label={node.label}
              kind={kind}
              depth={depth}
              selected={node.branch.name === selectedRef}
            />
          );
        }

        const key = `${kind}:${node.path}`;
        const chosen = folderChoices[key] ?? opensByDefault(node, selectedRef);
        const open = showAll || chosen;
        return (
          <FolderRow
            key={key}
            folder={node}
            depth={depth}
            open={open}
            onToggle={() => onFolderToggle(key, !open)}
          >
            <BranchTree nodes={node.children} depth={depth + 1} {...tree} />
          </FolderRow>
        );
      })}
    </ul>
  );
}
