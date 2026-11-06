import { Dropdown } from 'antd';
import { cloneElement } from 'react';
import { useBranches } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { useBranchMenu } from '../useBranchMenu.js';

function BranchActions({ branch, kind, children }) {
  const { items, checkout } = useBranchMenu(branch, kind);
  const label = cloneElement(children, {
    title: branch.isCurrent
      ? children.props.title
      : `${children.props.title}\nDouble-click to check out`,
    onDoubleClick: checkout,
  });

  return (
    <Dropdown menu={{ items }} trigger={['contextMenu']}>
      {label}
    </Dropdown>
  );
}

/**
 * Gives a label in the tree what a branch has in the sidebar: its menu on right click,
 * and checkout on double click. A label can stand for a local branch and its remote
 * copies at once, and then it acts on the local one. Tags and a detached HEAD match no
 * branch, so they get neither.
 */
export function RefBranchActions({ group, children }) {
  const { repository } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);

  const local = group.local && branches?.local.find(({ name }) => name === group.name);
  const remote = branches?.remote.find(({ name }) => group.remotes.includes(name));
  const branch = local || remote;
  if (!branch) return children;

  return (
    <BranchActions branch={branch} kind={local ? 'local' : 'remote'}>
      {children}
    </BranchActions>
  );
}
