import { TextHelper } from '../../utils/TextHelper.js';

export const UNGROUPED = 'ungrouped';

/** Search looks only at the names on show: the repository's and its current branch's. */
export function matchesSearch(repository, search) {
  const names = [repository.name, repository.summary?.branch ?? ''];
  return names.some((name) => TextHelper.includesIgnoringCase(name, search));
}

/**
 * Splits the repositories into a section per group, then one for the rest.
 * While searching, sections without a match drop out. Otherwise an empty group
 * stays listed, so it can be filled or deleted.
 */
export function buildSections(repositories, groups, search = '') {
  const visible = repositories.filter((repository) => matchesSearch(repository, search));
  const groupIds = new Set(groups.map((group) => group.id));

  const sections = groups.map((group) => ({
    id: group.id,
    name: group.name,
    group,
    repositories: visible.filter((repository) => repository.groupId === group.id),
  }));

  const ungrouped = visible.filter((repository) => !groupIds.has(repository.groupId));
  if (ungrouped.length > 0) {
    sections.push({ id: UNGROUPED, name: 'Ungrouped', group: null, repositories: ungrouped });
  }

  return search.trim() ? sections.filter((section) => section.repositories.length > 0) : sections;
}
