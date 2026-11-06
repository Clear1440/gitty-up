import {
  AppstoreOutlined,
  FolderAddOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Button, Input, Result, Segmented, Spin } from 'antd';
import { useState } from 'react';
import { useRepositories } from '../../queries/repositories.js';
import { readStored, writeStored } from '../../utils/storage.js';
import styles from './HomePage.module.css';
import { LinkRepositoryDialog } from './LinkRepositoryDialog.jsx';
import { RepositoryCard } from './RepositoryCard.jsx';

const VIEW_STORAGE_KEY = 'gity-up.repositoryView';

const VIEWS = [
  { value: 'card', label: 'Cards', icon: <AppstoreOutlined /> },
  { value: 'list', label: 'List', icon: <UnorderedListOutlined /> },
];

function matches(repository, filter) {
  const location = repository.path ?? repository.remoteUrl;
  const text = `${repository.name} ${location}`.toLowerCase();
  return text.includes(filter.trim().toLowerCase());
}

export function HomePage() {
  const { data: repositories, isPending, error } = useRepositories();
  const [filter, setFilter] = useState('');
  const [linking, setLinking] = useState(false);
  const [view, setView] = useState(() => readStored(VIEW_STORAGE_KEY, 'card'));

  const changeView = (nextView) => {
    setView(nextView);
    writeStored(VIEW_STORAGE_KEY, nextView);
  };

  const linkButton = (
    <Button type="primary" icon={<FolderAddOutlined />} onClick={() => setLinking(true)}>
      Link repository
    </Button>
  );

  const renderContent = () => {
    if (isPending) return <Spin className="centered" size="large" />;
    if (error) return <Result status="error" title="Could not load" subTitle={error.message} />;
    if (repositories.length === 0) {
      return (
        <div className={styles.emptyState}>
          <h2>Link your first repository</h2>
          <p>Point gity-up at a folder on this machine, or add a repository by its git URL.</p>
          {linkButton}
        </div>
      );
    }

    const visible = repositories.filter((repository) => matches(repository, filter));
    if (visible.length === 0) {
      return <p className={styles.noMatches}>No repositories match “{filter}”.</p>;
    }
    return (
      <div className={view === 'list' ? styles.list : styles.grid}>
        {visible.map((repository) => (
          <RepositoryCard key={repository.id} repository={repository} view={view} />
        ))}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Repositories</h1>
          {repositories?.length > 0 && (
            <p className={styles.subtitle}>{repositories.length} linked</p>
          )}
        </div>
        {repositories?.length > 0 && (
          <div className={styles.headerActions}>
            <Segmented
              className={styles.viewToggle}
              aria-label="Repository view"
              options={VIEWS}
              value={view}
              onChange={changeView}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Filter repositories"
              aria-label="Filter repositories"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            {linkButton}
          </div>
        )}
      </header>
      {renderContent()}
      {linking && <LinkRepositoryDialog onClose={() => setLinking(false)} />}
    </div>
  );
}
