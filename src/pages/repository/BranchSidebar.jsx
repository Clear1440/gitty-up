import { SearchOutlined, SortAscendingOutlined } from '@ant-design/icons';
import { Button, Collapse, Dropdown, Input, Spin, Tooltip } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useBranches, useStashes } from '../../queries/git.js';
import { BRANCH_SORTS, buildBranchTree, sortBranches } from './branchTree.js';
import { BranchTree, useFolderChoices } from './BranchTree.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import { StashList } from './StashList.jsx';
import { useBranchSort } from './useBranchSort.js';
import styles from './BranchSidebar.module.css';

const SORT_ITEMS = BRANCH_SORTS.map(({ value, label, hint }) => ({
  key: value,
  label,
  title: hint,
}));

function filterBranches(branches, filter) {
  const text = filter.trim().toLowerCase();
  return branches.filter((branch) => branch.name.toLowerCase().includes(text));
}

function SortMenu({ sort, onChange }) {
  return (
    <Tooltip title="Sort branches">
      {/* The dropdown needs the button itself, so the tooltip wraps it from out here. */}
      <span>
        <Dropdown
          menu={{
            items: SORT_ITEMS,
            selectable: true,
            selectedKeys: [sort],
            onClick: ({ key }) => onChange(key),
          }}
          trigger={['click']}
        >
          <Button icon={<SortAscendingOutlined />} aria-label="Sort branches" />
        </Dropdown>
      </span>
    </Tooltip>
  );
}

export function BranchSidebar({ resizeHandle }) {
  const { repository, status } = useRepositoryContext();
  const { data: branches, isPending } = useBranches(repository.id);
  const { data: stashes = [] } = useStashes(repository.id);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useBranchSort();
  const [folderChoices, setFolderOpen] = useFolderChoices(repository.id);
  const [searchParams] = useSearchParams();
  const selectedRef = searchParams.get('focus') ?? searchParams.get('ref');

  const local = sortBranches(filterBranches(branches?.local ?? [], filter), sort);
  const remote = sortBranches(filterBranches(branches?.remote ?? [], filter), sort);

  // Counted before filtering, or the folders would come and go while typing.
  const showRemotes = new Set(branches?.remote.map(({ remote: name }) => name)).size > 1;

  const renderBranches = (list, kind) => {
    if (list.length === 0) return <p className={styles.empty}>No branches</p>;
    return (
      <BranchTree
        nodes={buildBranchTree(list, { showRemotes })}
        kind={kind}
        selectedRef={selectedRef}
        // A match inside a closed folder would otherwise look like no match at all.
        showAll={Boolean(filter.trim())}
        folderChoices={folderChoices}
        onFolderToggle={setFolderOpen}
      />
    );
  };

  const sections = [
    {
      key: 'local',
      label: `Local (${local.length})`,
      children: renderBranches(local, 'local'),
    },
    {
      key: 'remote',
      label: `Remote (${remote.length})`,
      children: renderBranches(remote, 'remote'),
    },
    {
      key: 'stashes',
      label: `Stashes (${stashes.length})`,
      children: <StashList stashes={stashes} />,
    },
  ];

  return (
    <aside className={styles.sidebar} aria-label="Branches and stashes">
      <div className={styles.header}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Filter branches"
          aria-label="Filter branches"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <SortMenu sort={sort} onChange={setSort} />
      </div>
      {status.mono && (
        <p className={styles.monoNote}>Branches shared by every repository</p>
      )}
      <div className={styles.body}>
        {isPending ? (
          <Spin className="centered" />
        ) : (
          <Collapse
            ghost
            size="small"
            defaultActiveKey={['local', 'remote', 'stashes']}
            items={sections}
          />
        )}
      </div>
      {resizeHandle}
    </aside>
  );
}
