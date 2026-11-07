import {
  FolderAddOutlined,
  FolderOutlined,
  ImportOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { App, Button, Input, Result, Spin, Tooltip } from 'antd';
import { useState } from 'react';
import {
  useCreateGroup,
  useFetchAllRepositories,
  useRepositories,
  useRepositoryGroups,
} from '../../queries/repositories.js';
import { readStored, writeStored } from '../../utils/storage.js';
import { BulkImportDialog } from './BulkImportDialog.jsx';
import { GroupNameDialog } from './GroupNameDialog.jsx';
import styles from './HomePage.module.css';
import { LinkRepositoryDialog } from './LinkRepositoryDialog.jsx';
import { RepositoryRow } from './RepositoryRow.jsx';
import { RepositorySection } from './RepositorySection.jsx';
import { buildSections } from './sections.js';

const COLLAPSED_STORAGE_KEY = 'gity-up.collapsedGroups';
const NO_GROUPS = [];

function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_STORAGE_KEY, []));

  const toggle = (sectionId) => {
    const next = collapsed.includes(sectionId)
      ? collapsed.filter((id) => id !== sectionId)
      : [...collapsed, sectionId];
    setCollapsed(next);
    writeStored(COLLAPSED_STORAGE_KEY, next);
  };

  return { collapsed, toggle };
}

const repositoryCount = (count) => (count === 1 ? '1 repository' : `${count} repositories`);

/** Fetches every linked repository, so ahead and behind counts catch up with the remotes. */
function RefreshAllButton() {
  const { notification } = App.useApp();
  const fetchAll = useFetchAllRepositories();

  const refresh = async () => {
    try {
      const { fetchedCount, failures } = await fetchAll.mutateAsync();
      if (failures.length === 0) {
        notification.success({ title: `Fetched ${repositoryCount(fetchedCount)}` });
        return;
      }
      notification.warning({
        title: `Could not fetch ${repositoryCount(failures.length)}`,
        description: (
          <ul className={styles.failures}>
            {failures.map(({ id, name, message }) => (
              <li key={id}>
                <strong>{name}</strong>: {message}
              </li>
            ))}
          </ul>
        ),
        duration: 0,
      });
    } catch (error) {
      notification.error({ title: 'Could not fetch the repositories', description: error.message });
    }
  };

  return (
    <Tooltip title="Fetch all repositories">
      <Button
        type="text"
        icon={<SyncOutlined spin={fetchAll.isPending} />}
        disabled={fetchAll.isPending}
        aria-label="Fetch all repositories"
        onClick={refresh}
      />
    </Tooltip>
  );
}

export function HomePage() {
  const { data: repositories, isPending, error } = useRepositories();
  const { data: groups = NO_GROUPS, error: groupsError } = useRepositoryGroups();
  const createGroup = useCreateGroup();
  const { collapsed, toggle } = useCollapsedSections();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);

  const closeDialog = () => setDialog(null);
  const isSearching = Boolean(search.trim());
  const hasContent = repositories?.length > 0 || groups.length > 0;

  const linkButton = (
    <Button type="primary" icon={<FolderAddOutlined />} onClick={() => setDialog('link')}>
      Link repository
    </Button>
  );
  const bulkImportButton = (
    <Button icon={<ImportOutlined />} onClick={() => setDialog('bulk')}>
      Bulk import
    </Button>
  );

  const renderContent = () => {
    if (isPending) return <Spin className="centered" size="large" />;
    if (error || groupsError) {
      const { message } = error ?? groupsError;
      return <Result status="error" title="Could not load" subTitle={message} />;
    }
    if (!hasContent) {
      return (
        <div className={styles.emptyState}>
          <h2>Link your first repository</h2>
          <p>Point gity-up at a folder on this machine, or add a repository by its git URL.</p>
          <div className={styles.emptyActions}>
            {linkButton}
            {bulkImportButton}
          </div>
        </div>
      );
    }

    const sections = buildSections(repositories, groups, search);
    if (sections.length === 0) {
      return <p className={styles.noMatches}>No repositories match “{search}”.</p>;
    }
    // With no groups there is nothing to tell apart, so the list needs no heading.
    if (groups.length === 0) {
      return (
        <div className={styles.list}>
          {sections[0].repositories.map((repository) => (
            <RepositoryRow key={repository.id} repository={repository} groups={groups} />
          ))}
        </div>
      );
    }
    return (
      <div className={styles.sections}>
        {sections.map((section) => (
          <RepositorySection
            key={section.id}
            section={section}
            groups={groups}
            // A match inside a collapsed section must still be seen.
            collapsed={!isSearching && collapsed.includes(section.id)}
            onToggle={() => toggle(section.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            {repositories?.length > 0 && <RefreshAllButton />}
            <h1 className={styles.title}>Repositories</h1>
          </div>
          {repositories?.length > 0 && (
            <p className={styles.subtitle}>{repositories.length} linked</p>
          )}
        </div>
        {hasContent && (
          <div className={styles.headerActions}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search repositories and branches"
              aria-label="Search repositories and branches"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button icon={<FolderOutlined />} onClick={() => setDialog('group')}>
              New group
            </Button>
            {bulkImportButton}
            {linkButton}
          </div>
        )}
      </header>
      {renderContent()}
      {dialog === 'link' && <LinkRepositoryDialog onClose={closeDialog} />}
      {dialog === 'bulk' && <BulkImportDialog onClose={closeDialog} />}
      {dialog === 'group' && (
        <GroupNameDialog
          title="New group"
          okText="Create group"
          onSave={createGroup.mutateAsync}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
