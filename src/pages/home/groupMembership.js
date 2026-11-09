import { ListHelper } from '../../utils/ListHelper.js';

export const UNGROUPED = 'ungrouped';

/** The groups a repository is in, as ids. */
export const groupIdsOf = (repository) => repository.groupIds ?? [];

/** Whether a repository is in a group. */
export const isInGroup = (repository, groupId) => groupIdsOf(repository).includes(groupId);

/** A repository's groups with one more added, or that one taken away if it was there. */
export const toggleGroup = (repository, groupId) =>
  ListHelper.toggle(groupIdsOf(repository), groupId);

/**
 * The groups a repository ends up in when dragged from one section to another.
 * A move leaves the section it came from; a copy (`copy`) keeps it there too.
 * Dropping on Ungrouped takes it out of every group, as that is the only way to land
 * there. Null means nothing would change.
 */
export function groupIdsAfterDrop(repository, fromSectionId, toSectionId, { copy = false } = {}) {
  if (fromSectionId === toSectionId) return null;
  if (toSectionId === UNGROUPED) return groupIdsOf(repository).length > 0 ? [] : null;

  const current = groupIdsOf(repository);
  const kept = copy ? current : current.filter((groupId) => groupId !== fromSectionId);
  const next = ListHelper.unique([...kept, toSectionId]);
  const unchanged = next.length === current.length && next.every((id) => current.includes(id));
  return unchanged ? null : next;
}

/**
 * The ids with `movedId` taken out and put back before or after `targetId`.
 * Null means it would stay where it is.
 */
export function reorderIds(ids, movedId, targetId, position) {
  if (movedId === targetId || !ids.includes(movedId) || !ids.includes(targetId)) return null;
  const rest = ids.filter((id) => id !== movedId);
  const targetIndex = rest.indexOf(targetId);
  const index = position === 'before' ? targetIndex : targetIndex + 1;
  const reordered = [...rest.slice(0, index), movedId, ...rest.slice(index)];
  return reordered.every((id, i) => id === ids[i]) ? null : reordered;
}
