import { Dropdown } from 'antd';
import { cloneElement } from 'react';
import { useBranches } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { useBranchMenu } from '../useBranchMenu.js';
import { useTagMenu } from '../useTagMenu.js';
import styles from './RefBranchActions.module.css';

function BranchActions({ branch, kind, children }) {
  const { items, checkout } = useBranchMenu(branch, kind);
  const label = cloneElement(children, {
    title: branch.isCurrent
      ? children.props.title
      : `${children.props.title}\nDouble-click to check out`,
    onDoubleClick: checkout,
  });

  // The commit row has a menu and double click of its own, which a label stands in for.
  const stop = (event) => event.stopPropagation();
  return (
    <span className={styles.actions} onContextMenu={stop} onDoubleClick={stop}>
      <Dropdown menu={{ items }} trigger={['contextMenu']}>
        {label}
      </Dropdown>
    </span>
  );
}

function TagActions({ name, children }) {
  const items = useTagMenu(name);
  // The commit row has a menu of its own, which a label stands in for.
  return (
    <span className={styles.actions} onContextMenu={(event) => event.stopPropagation()}>
      <Dropdown menu={{ items }} trigger={['contextMenu']}>
        {children}
      </Dropdown>
    </span>
  );
}

/**
 * Gives a label in the tree what a branch has in the sidebar: its menu on right click,
 * and checkout on double click. A label can stand for a local branch and its remote
 * copies at once, and then it acts on the local one. A tag gets the tag menu, with no
 * double click, and a detached HEAD matches no branch, so it gets neither.
 */
export function RefBranchActions({ group, children }) {
  const { repository } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);

  const local = group.local && branches?.local.find(({ name }) => name === group.name);
  const remote = branches?.remote.find(({ name }) => group.remotes.includes(name));
  const branch = local || remote;
  if (group.type === 'tag') {
    // Tags stay with each repository's own tab in a mono repo.
    return repository.isMono ? children : <TagActions name={group.name}>{children}</TagActions>;
  }
  if (!branch) return children;

  return (
    <BranchActions branch={branch} kind={local ? 'local' : 'remote'}>
      {children}
    </BranchActions>
  );
}
