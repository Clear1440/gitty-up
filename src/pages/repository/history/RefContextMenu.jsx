import { Dropdown } from 'antd';
import { useBranches } from '../../../queries/git.js';
import { useRepositoryContext } from '../RepositoryContext.js';
import { useBranchMenu } from '../useBranchMenu.js';

function BranchContextMenu({ branch, kind, children }) {
  const { items } = useBranchMenu(branch, kind);
  return (
    <Dropdown menu={{ items }} trigger={['contextMenu']}>
      {children}
    </Dropdown>
  );
}

/**
 * Gives a label in the tree the branch menu from the sidebar. A label can stand for a
 * local branch and its remote copies at once, and then it acts on the local one. Tags
 * and a detached HEAD match no branch, so they keep no menu.
 */
export function RefContextMenu({ group, children }) {
  const { repository } = useRepositoryContext();
  const { data: branches } = useBranches(repository.id);

  const local = group.local && branches?.local.find(({ name }) => name === group.name);
  const remote = branches?.remote.find(({ name }) => group.remotes.includes(name));
  const branch = local || remote;
  if (!branch) return children;

  return (
    <BranchContextMenu branch={branch} kind={local ? 'local' : 'remote'}>
      {children}
    </BranchContextMenu>
  );
}
