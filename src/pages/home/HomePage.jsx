import { FolderAddOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, Result, Spin } from 'antd';
import { useState } from 'react';
import { useRepositories } from '../../queries/repositories.js';
import styles from './HomePage.module.css';
import { LinkRepositoryDialog } from './LinkRepositoryDialog.jsx';
import { RepositoryCard } from './RepositoryCard.jsx';

function matches(repository, filter) {
  const text = `${repository.name} ${repository.path}`.toLowerCase();
  return text.includes(filter.trim().toLowerCase());
}

export function HomePage() {
  const { data: repositories, isPending, error } = useRepositories();
  const [filter, setFilter] = useState('');
  const [linking, setLinking] = useState(false);

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
          <p>Point gity-up at a folder on this machine that contains a git repository.</p>
          {linkButton}
        </div>
      );
    }

    const visible = repositories.filter((repository) => matches(repository, filter));
    if (visible.length === 0) {
      return <p className={styles.noMatches}>No repositories match “{filter}”.</p>;
    }
    return (
      <div className={styles.grid}>
        {visible.map((repository) => (
          <RepositoryCard key={repository.id} repository={repository} />
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
