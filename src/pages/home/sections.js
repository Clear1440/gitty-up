import { TextHelper } from '../../utils/TextHelper.js';
import { groupIdsOf, isInGroup, UNGROUPED } from './groupMembership.js';

export { UNGROUPED };

/** Search looks only at the names on show: the repository's and its current branch's. */
export function matchesSearch(repository, search) {
  const names = [repository.name, repository.summary?.branch ?? ''];
  return names.some((name) => TextHelper.includesIgnoringCase(name, search));
}

export const ungroupedSection = (repositories = []) => ({
  id: UNGROUPED,
  name: 'Ungrouped',
  group: null,
  repositories,
});

/**
 * Splits the repositories into a section per group, in the groups' order, then one
 * for the rest. A repository in many groups shows in each of them. While searching,
 * sections without a match drop out. Otherwise an empty group stays listed, so it can
 * be filled or deleted.
 */
export function buildSections(repositories, groups, search = '') {
  const visible = repositories.filter((repository) => matchesSearch(repository, search));
  const groupIds = new Set(groups.map((group) => group.id));

  const sections = groups.map((group) => ({
    id: group.id,
    name: group.name,
    group,
    repositories: visible.filter((repository) => isInGroup(repository, group.id)),
  }));

  const ungrouped = visible.filter(
    (repository) => !groupIdsOf(repository).some((groupId) => groupIds.has(groupId)),
  );
  if (ungrouped.length > 0) sections.push(ungroupedSection(ungrouped));

  return search.trim() ? sections.filter((section) => section.repositories.length > 0) : sections;
}
