import { CheckOutlined, MinusOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { Button, Empty, Popconfirm, Tooltip } from 'antd';
import { useRef } from 'react';
import { useSearchParams } from 'react-router';
import { ResizeHandle } from '../../components/ResizeHandle.jsx';
import { useResizableSizes } from '../../components/useResizableSizes.js';
import { DiffView } from './DiffView.jsx';
import { FileSection } from './FileSection.jsx';
import { useRepositoryContext } from './RepositoryContext.js';
import styles from './ChangesPage.module.css';

const CHANGES_LIMITS = { files: { min: 180, max: 900 } };

function IconAction({ label, icon, ...buttonProps }) {
  return (
    <Tooltip title={label}>
      <Button type="text" size="small" icon={icon} aria-label={label} {...buttonProps} />
    </Tooltip>
  );
}

function findSelectedFile(status, searchParams) {
  const path = searchParams.get('file');
  const area = searchParams.get('area');
  if (!path) return null;

  const files = area === 'staged' ? status.staged : [...status.conflicted, ...status.unstaged];
  const file = files.find((candidate) => candidate.path === path);
  if (!file) return null;
  return { path, staged: area === 'staged', untracked: file.status === 'untracked' };
}

export function ChangesPage() {
  const { status, run, isBusy } = useRepositoryContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const changesRef = useRef(null);
  const { style, handleFor } = useResizableSizes(changesRef, 'changes', CHANGES_LIMITS);
  const selected = findSelectedFile(status, searchParams);
  const { staged, unstaged, conflicted } = status;

  if (staged.length + unstaged.length + conflicted.length === 0) {
    return <Empty className="centered" description="No changes. The working tree is clean." />;
  }

  const select = (area) => (file) =>
    setSearchParams({ file: file.path, area }, { replace: true });

  const isSelected = (staging) => (file) =>
    selected?.path === file.path && selected.staged === staging;

  return (
    <div ref={changesRef} className={styles.changes} style={style}>
      <div className={styles.fileColumn}>
        <div className={styles.fileList}>
          <FileSection
            title="Conflicted"
            files={conflicted}
            isSelected={isSelected(false)}
            onSelect={select('unstaged')}
            renderActions={(file) => (
              <IconAction
                label="Mark as resolved"
                icon={<CheckOutlined />}
                disabled={isBusy}
                onClick={() => run('stage', { paths: [file.path] })}
              />
            )}
          />
          <FileSection
            title="Unstaged"
            files={unstaged}
            isSelected={isSelected(false)}
            onSelect={select('unstaged')}
            headerAction={
              <Button size="small" type="text" disabled={isBusy} onClick={() => run('stage')}>
                Stage all
              </Button>
            }
            renderActions={(file) => (
              <>
                <Popconfirm
                  title="Discard these changes?"
                  description={`${file.path} goes back to its last commit. This cannot be undone.`}
                  okText="Discard"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => run('discard', { paths: [file.path] })}
                >
                  <IconAction label="Discard" icon={<UndoOutlined />} disabled={isBusy} />
                </Popconfirm>
                <IconAction
                  label="Stage"
                  icon={<PlusOutlined />}
                  disabled={isBusy}
                  onClick={() => run('stage', { paths: [file.path] })}
                />
              </>
            )}
          />
          <FileSection
            title="Staged"
            files={staged}
            isSelected={isSelected(true)}
            onSelect={select('staged')}
            headerAction={
              <Button size="small" type="text" disabled={isBusy} onClick={() => run('unstage')}>
                Unstage all
              </Button>
            }
            renderActions={(file) => (
              <IconAction
                label="Unstage"
                icon={<MinusOutlined />}
                disabled={isBusy}
                onClick={() => run('unstage', { paths: [file.path] })}
              />
            )}
          />
        </div>
        <ResizeHandle label="Resize file list" {...handleFor('files')} />
      </div>
      <DiffView file={selected} />
    </div>
  );
}
