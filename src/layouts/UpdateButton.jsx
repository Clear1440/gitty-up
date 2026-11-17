import { CloudDownloadOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useEffect, useRef } from 'react';
import { Tooltip } from '../components/Tooltip.jsx';
import { isUpdating, useInstallUpdate, useUpdateStatus } from '../queries/updates.js';

/** What the update is doing, as a button label. */
export function updateLabel(status) {
  if (status.phase === 'downloading') return `Downloading ${Math.round((status.progress ?? 0) * 100)}%`;
  if (status.phase === 'installing') return 'Restarting…';
  return 'Update available';
}

/** Starts installing the latest release. The app restarts into it once it is in place. */
export function useStartUpdate() {
  const { notification } = App.useApp();
  const install = useInstallUpdate();
  return async () => {
    try {
      await install.mutateAsync();
    } catch (error) {
      notification.error({ title: 'Could not update Gitty Up', description: error.message });
    }
  };
}

/**
 * The download and install go on in the background, so a failure only shows up in a
 * later status. Each one is told once.
 */
function useInstallFailureNotice(installError) {
  const { notification } = App.useApp();
  const shown = useRef(installError);
  useEffect(() => {
    if (!installError || installError === shown.current) return;
    shown.current = installError;
    notification.error({ title: 'Could not update Gitty Up', description: installError });
  }, [installError, notification]);
}

/** Shown beside the settings button only while a newer release can be installed. */
export function UpdateButton() {
  const { data: status } = useUpdateStatus();
  const startUpdate = useStartUpdate();
  useInstallFailureNotice(status?.installError ?? null);

  if (!status?.supported || !(status.available || isUpdating(status))) return null;
  return (
    <Tooltip
      title={
        isUpdating(status)
          ? `Installing v${status.latestVersion}. Gitty Up restarts when it is done.`
          : `Install v${status.latestVersion} and restart (you have v${status.currentVersion})`
      }
      placement="bottomRight"
    >
      <Button
        type="primary"
        size="small"
        icon={<CloudDownloadOutlined />}
        loading={isUpdating(status)}
        onClick={startUpdate}
      >
        {updateLabel(status)}
      </Button>
    </Tooltip>
  );
}
