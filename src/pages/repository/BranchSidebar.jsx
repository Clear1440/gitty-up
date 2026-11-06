import { SearchOutlined } from '@ant-design/icons';
import { Collapse, Input, Spin } from 'antd';
import { useState } from 'react';
import { useMatch, useSearchParams } from 'react-router';
import { useBranches } from '../../queries/git.js';
import { BranchRow } from './BranchRow.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './BranchSidebar.module.css';

const byCurrentFirst = (a, b) => Number(b.isCurrent ?? false) - Number(a.isCurrent ?? false);

function filterBranches(branches, filter) {
  const text = filter.trim().toLowerCase();
  return branches.filter((branch) => branch.name.toLowerCase().includes(text));
}

function BranchList({ branches, kind, selectedRef }) {
  if (branches.length === 0) return <p className={styles.empty}>No branches</p>;
  return (
    <ul className={styles.list}>
      {branches.map((branch) => (
        <BranchRow
          key={branch.name}
          branch={branch}
          kind={kind}
          selected={branch.name === selectedRef}
        />
      ))}
    </ul>
  );
}

export function BranchSidebar() {
  const { repository, status } = useRepositoryContext();
  const { data: branches, isPending } = useBranches(repository.id);
  const [filter, setFilter] = useState('');
  const [searchParams] = useSearchParams();
  const onHistory = useMatch('/repositories/:repositoryId/history');
  const selectedRef = onHistory ? (searchParams.get('ref') ?? status.branch) : null;

  const local = filterBranches(branches?.local ?? [], filter).sort(byCurrentFirst);
  const remote = filterBranches(branches?.remote ?? [], filter);

  const sections = [
    {
      key: 'local',
      label: `Local (${local.length})`,
      children: <BranchList branches={local} kind="local" selectedRef={selectedRef} />,
    },
    {
      key: 'remote',
      label: `Remote (${remote.length})`,
      children: <BranchList branches={remote} kind="remote" selectedRef={selectedRef} />,
    },
  ];

  return (
    <aside className={styles.sidebar} aria-label="Branches">
      <div className={styles.header}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Filter branches"
          aria-label="Filter branches"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className={styles.body}>
        {isPending ? (
          <Spin className="centered" />
        ) : (
          <Collapse ghost size="small" defaultActiveKey={['local', 'remote']} items={sections} />
        )}
      </div>
    </aside>
  );
}
