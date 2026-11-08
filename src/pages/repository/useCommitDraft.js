import { useCallback, useSyncExternalStore } from 'react';
import { StorageHelper } from '../../utils/StorageHelper.js';

const storageKey = (repositoryId) => `gitty-up.commit-draft.${repositoryId}`;

// Kept here as well as in storage, so a draft still works when storage is blocked.
const drafts = new Map();
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readDraft(repositoryId) {
  if (!drafts.has(repositoryId)) {
    drafts.set(repositoryId, StorageHelper.read(storageKey(repositoryId), ''));
  }
  return drafts.get(repositoryId);
}

function writeDraft(repositoryId, draft) {
  drafts.set(repositoryId, draft);
  StorageHelper.write(storageKey(repositoryId), draft);
  listeners.forEach((listener) => listener());
}

/**
 * The draft to offer once a commit is undone. Its changes are staged alongside whatever
 * the draft was written for, so the draft stays, after the older commit's message.
 */
export function addToDraft(message, draft) {
  return [message, draft].filter((text) => text.trim()).join('\n\n');
}

/** Puts an undone commit's message back in the commit box, even if the box isn't open. */
export function restoreCommitMessage(repositoryId, message) {
  writeDraft(repositoryId, addToDraft(message, readDraft(repositoryId)));
}

/** A commit message that survives switching tabs and reloading the app. */
export function useCommitDraft(repositoryId) {
  const draft = useSyncExternalStore(subscribe, () => readDraft(repositoryId));
  const setDraft = useCallback((text) => writeDraft(repositoryId, text), [repositoryId]);
  return [draft, setDraft];
}
