import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../../utils/storage.js';

function useStoredValue(storageKey, fallback) {
  const [value, setValue] = useState(() => readStored(storageKey, fallback));

  useEffect(() => {
    writeStored(storageKey, value);
  }, [storageKey, value]);

  return [value, setValue];
}

/** A commit message that survives switching tabs and reloading the app. */
export function useCommitDraft(repositoryId) {
  return useStoredValue(`gity-up.commit-draft.${repositoryId}`, '');
}

/** Whether committing also pushes, remembered for each repository. */
export function usePushAfterCommit(repositoryId) {
  return useStoredValue(`gity-up.push-after-commit.${repositoryId}`, false);
}
