import { useEffect, useState } from 'react';
import { StorageHelper } from '../utils/StorageHelper.js';
import { ChangelogDialog } from './ChangelogDialog.jsx';
import { newReleasesSinceLastStart } from './changelog.js';
import { APP_VERSION, RELEASES } from './releases.js';

const STORAGE_KEY = 'gitty-up.last-seen-version';

/** Shows what changed, once, the first time the app starts after an update. */
export function WhatsNewAfterUpdate() {
  const [releases] = useState(() =>
    newReleasesSinceLastStart(StorageHelper.read(STORAGE_KEY, null), APP_VERSION, RELEASES),
  );
  const [open, setOpen] = useState(releases.length > 0);

  // Remembered straight away, so it is shown once even if the app closes with it open.
  useEffect(() => StorageHelper.write(STORAGE_KEY, APP_VERSION), []);

  if (releases.length === 0) return null;
  return (
    <ChangelogDialog
      open={open}
      title={`Gitty Up is now v${APP_VERSION}`}
      releases={releases}
      current={APP_VERSION}
      onClose={() => setOpen(false)}
    />
  );
}
