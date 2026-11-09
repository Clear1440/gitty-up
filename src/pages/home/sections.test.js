import { describe, expect, it } from 'vitest';
import { buildSections, matchesSearch, UNGROUPED } from './sections.js';

const repository = (name, branch, ...groupIds) => ({
  id: name,
  name,
  groupIds,
  path: `/code/needle/${name}`,
  remoteUrl: 'https://example.com/needle.git',
  summary: branch ? { branch, lastCommit: { subject: 'needle' } } : null,
});

describe('matchesSearch', () => {
  it('matches the repository name, ignoring case', () => {
    expect(matchesSearch(repository('Gitty-Up', 'main'), 'gitty')).toBe(true);
  });

  it('matches the current branch', () => {
    expect(matchesSearch(repository('app', 'feature/login'), 'LOGIN')).toBe(true);
  });

  it('ignores the path, remote and commit message', () => {
    expect(matchesSearch(repository('app', 'main'), 'needle')).toBe(false);
  });

  it('does not match across the two names', () => {
    expect(matchesSearch(repository('app', 'main'), 'appmain')).toBe(false);
  });

  it('handles a repository with no summary', () => {
    expect(matchesSearch(repository('stub', null), 'stub')).toBe(true);
    expect(matchesSearch(repository('stub', null), 'main')).toBe(false);
  });
});

describe('buildSections', () => {
  const groups = [
    { id: 'g1', name: 'Work' },
    { id: 'g2', name: 'Empty' },
  ];
  const repositories = [
    repository('one', 'main', 'g1'),
    repository('two', 'develop'),
    repository('three', 'main', 'deleted-group'),
  ];

  it('lists groups in order, then whatever has no group', () => {
    const sections = buildSections(repositories, groups);
    expect(sections.map(({ id }) => id)).toEqual(['g1', 'g2', UNGROUPED]);
    expect(sections[0].repositories.map(({ name }) => name)).toEqual(['one']);
    expect(sections[2].repositories.map(({ name }) => name)).toEqual(['two', 'three']);
  });

  it('leaves out the ungrouped section when everything has a group', () => {
    const sections = buildSections([repositories[0]], groups);
    expect(sections.map(({ id }) => id)).toEqual(['g1', 'g2']);
  });

  it('shows a repository in every group it is in', () => {
    const both = repository('both', 'main', 'g1', 'g2');
    const sections = buildSections([both], groups);
    expect(sections.map(({ repositories }) => repositories.length)).toEqual([1, 1]);
  });

  it('keeps only sections with a match while searching', () => {
    const sections = buildSections(repositories, groups, 'develop');
    expect(sections.map(({ id }) => id)).toEqual([UNGROUPED]);
  });
});
