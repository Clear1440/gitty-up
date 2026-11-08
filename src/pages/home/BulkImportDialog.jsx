import { Alert, App, Checkbox, Input, Spin } from 'antd';
import { useState } from 'react';
import { ActionDialog } from '../../components/ActionDialog.jsx';
import { useLinkRepositories, useRepositoryScan } from '../../queries/repositories.js';
import { SetHelper } from '../../utils/SetHelper.js';
import { TextHelper } from '../../utils/TextHelper.js';
import { FolderPicker, useFolderPicker } from './FolderPicker.jsx';
import styles from './LinkRepositoryDialog.module.css';

/** Used when the scanned folder has no name of its own, as with a drive's root. */
const FALLBACK_GROUP_NAME = 'Imported';

const countLabel = (count) => TextHelper.countOf(count, 'repository', 'repositories');

function ScanResults({ scan, excluded, onToggle }) {
  if (scan.isPending) {
    return (
      <div className={styles.folderList}>
        <Spin className="centered" />
      </div>
    );
  }

  return (
    <div className={styles.folderList}>
      {scan.data?.repositories.length === 0 && (
        <p className={styles.noFolders}>No repositories in this folder.</p>
      )}
      {scan.data?.repositories.map((repository) => (
        <Checkbox
          key={repository.path}
          className={styles.scanRow}
          checked={!excluded.has(repository.path)}
          onChange={() => onToggle(repository.path)}
        >
          {repository.name}
          <span className={styles.scanPath} title={repository.path}>
            {repository.relativePath}
          </span>
        </Checkbox>
      ))}
    </div>
  );
}

/**
 * Links many repositories at once: either the ones ticked while browsing, or every
 * repository found below a folder, which then share a group named after that folder.
 */
export function BulkImportDialog({ onClose }) {
  const { notification } = App.useApp();
  const picker = useFolderPicker();
  const link = useLinkRepositories();
  const [includeAll, setIncludeAll] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [excluded, setExcluded] = useState(() => new Set());
  const [editedGroupName, setEditedGroupName] = useState(null);

  const scan = useRepositoryScan(includeAll ? picker.listing?.path : null);

  const groupName = editedGroupName ?? (scan.data?.name || FALLBACK_GROUP_NAME);
  const paths = includeAll
    ? (scan.data?.repositories ?? [])
        .map((repository) => repository.path)
        .filter((path) => !excluded.has(path))
    : [...selected];

  const submit = async () => {
    try {
      const { linkedCount, failures } = await link.mutateAsync({
        paths,
        groupName: includeAll ? groupName.trim() : undefined,
      });
      if (failures.length > 0) {
        notification.warning({
          title: `Imported ${countLabel(linkedCount)}, ${failures.length} failed`,
          description: failures.map((failure) => failure.message).join(' '),
        });
      } else {
        notification.success({ title: `Imported ${countLabel(linkedCount)}` });
      }
      return true;
    } catch {
      return false;
    }
  };

  const error = link.error ?? picker.error ?? scan.error;

  return (
    <ActionDialog
      title="Bulk import repositories"
      okText={paths.length > 0 ? `Import ${countLabel(paths.length)}` : 'Import'}
      canSubmit={paths.length > 0 && (!includeAll || Boolean(groupName.trim()))}
      onSubmit={submit}
      onClose={onClose}
    >
      <p className={styles.hint}>
        Browse to a folder and tick the repositories to link. Nothing is copied or moved.
      </p>
      <Checkbox
        className={styles.includeNested}
        checked={includeAll}
        onChange={(event) => setIncludeAll(event.target.checked)}
      >
        Import all sub-repositories of this folder into a group
      </Checkbox>
      <FolderPicker
        picker={picker}
        onChange={link.reset}
        selection={{
          selected,
          onToggle: (path) => setSelected((current) => SetHelper.toggle(current, path)),
        }}
        list={
          includeAll ? (
            <ScanResults
              scan={scan}
              excluded={excluded}
              onToggle={(path) => setExcluded((current) => SetHelper.toggle(current, path))}
            />
          ) : undefined
        }
      />
      {includeAll && (
        <label className={styles.groupName}>
          <span>Group name</span>
          <Input
            value={groupName}
            onChange={(event) => setEditedGroupName(event.target.value)}
          />
        </label>
      )}
      {includeAll && scan.data?.truncated && (
        <Alert
          className={styles.error}
          type="warning"
          showIcon
          title="This folder is too large to search fully. Choose a smaller one to find everything."
        />
      )}
      {error && <Alert className={styles.error} type="error" showIcon title={error.message} />}
    </ActionDialog>
  );
}
