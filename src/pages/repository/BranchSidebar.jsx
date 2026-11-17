import { DisconnectOutlined, SearchOutlined, SortAscendingOutlined } from '@ant-design/icons';
import { Button, Collapse, Dropdown, Input, Spin } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Tooltip } from '../../components/Tooltip.jsx';
import { useBranches, useStashes, useWorktrees } from '../../queries/git.js';
import { TextHelper } from '../../utils/TextHelper.js';
import { useStoredState } from '../../utils/useStoredState.js';
import { BRANCH_SORTS, buildBranchTree, sortBranches } from './branchTree.js';
import { BranchTree, useFolderChoices } from './BranchTree.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import { StashList } from './StashList.jsx';
import { useBranchSort } from './useBranchSort.js';
import { WorktreeList } from './WorktreeList.jsx';
import styles from './BranchSidebar.module.css';

const SORT_ITEMS = BRANCH_SORTS.map(({ value, label, hint }) => ({
  key: value,
  label,
  title: hint,
}));

const HIDE_GONE_KEY = 'gitty-up.hide-gone-branches';

function filterBranches(branches, filter) {
  return branches.filter((branch) => TextHelper.includesIgnoringCase(branch.name, filter));
}

/** A branch whose upstream was deleted. The checked out one always shows, gone or not. */
const isHideableGone = (branch) => branch.upstreamGone && !branch.isCurrent;

function GoneToggle({ hidden, goneCount, onChange }) {
  const hint = hidden
    ? `Show branches whose upstream is gone (${goneCount} hidden)`
    : 'Hide branches whose upstream is gone';
  return (
    <Tooltip title={hint}>
      <Button
        icon={<DisconnectOutlined />}
        aria-label={hint}
        aria-pressed={hidden}
        color={hidden ? 'primary' : 'default'}
        variant={hidden ? 'filled' : 'outlined'}
        onClick={() => onChange(!hidden)}
      />
    </Tooltip>
  );
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
  const { data: worktrees = [] } = useWorktrees(repository.id);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useBranchSort();
  // One setting for the whole app, like the sort.
  const [hideGone, setHideGone] = useStoredState(HIDE_GONE_KEY, false, {
    isValid: (value) => typeof value === 'boolean',
  });
  const [folderChoices, setFolderOpen] = useFolderChoices(repository.id);
  const [searchParams] = useSearchParams();
  const selectedRef = searchParams.get('focus') ?? searchParams.get('ref');

  const matchingLocal = filterBranches(branches?.local ?? [], filter);
  const goneCount = matchingLocal.filter(isHideableGone).length;
  const local = sortBranches(
    hideGone ? matchingLocal.filter((branch) => !isHideableGone(branch)) : matchingLocal,
    sort,
  );
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
      label:
        hideGone && goneCount > 0
          ? `Local (${local.length}, ${goneCount} gone hidden)`
          : `Local (${local.length})`,
      children: renderBranches(local, 'local'),
    },
    {
      key: 'remote',
      label: `Remote (${remote.length})`,
      children: renderBranches(remote, 'remote'),
    },
    // Stashes and worktrees stay with each repository's own tab in a mono repo.
    ...(repository.isMono
      ? []
      : [
          {
            key: 'stashes',
            label: `Stashes (${stashes.length})`,
            children: <StashList stashes={stashes} />,
          },
          {
            key: 'worktrees',
            label: `Worktrees (${worktrees.length})`,
            children: <WorktreeList worktrees={worktrees} />,
          },
        ]),
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
        <GoneToggle hidden={hideGone} goneCount={goneCount} onChange={setHideGone} />
        <SortMenu sort={sort} onChange={setSort} />
      </div>
      {status.mono && (
        <p className={styles.monoNote}>
          Only branches every repository here has. The rest are in each repository&apos;s own
          tab.
        </p>
      )}
      <div className={styles.body}>
        {isPending ? (
          <Spin className="centered" />
        ) : (
          <Collapse
            ghost
            size="small"
            defaultActiveKey={['local', 'remote', 'stashes', 'worktrees']}
            items={sections}
          />
        )}
      </div>
      {resizeHandle}
    </aside>
  );
}
