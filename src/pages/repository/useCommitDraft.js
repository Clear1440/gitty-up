import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../../utils/storage.js';

/** A commit message that survives switching tabs and reloading the app. */
export function useCommitDraft(repositoryId) {
  const storageKey = `gity-up.commit-draft.${repositoryId}`;
  const [draft, setDraft] = useState(() => readStored(storageKey, ''));

  useEffect(() => {
    writeStored(storageKey, draft);
  }, [storageKey, draft]);

  return [draft, setDraft];
}
