import { describe, expect, it } from 'vitest';
import { groupIdsAfterDrop, reorderIds, toggleGroup, UNGROUPED } from './groupMembership.js';

const inGroups = (...groupIds) => ({ id: 'repo', groupIds });
const ungrouped = { id: 'repo' };

describe('toggleGroup', () => {
  it('adds a group the repository is not in', () => {
    expect(toggleGroup(inGroups('a'), 'b')).toEqual(['a', 'b']);
    expect(toggleGroup(ungrouped, 'a')).toEqual(['a']);
  });

  it('takes away a group the repository is in', () => {
    expect(toggleGroup(inGroups('a', 'b'), 'a')).toEqual(['b']);
  });
});

describe('groupIdsAfterDrop', () => {
  it('moves from one group to another', () => {
    expect(groupIdsAfterDrop(inGroups('a', 'c'), 'a', 'b')).toEqual(['c', 'b']);
  });

  it('copies into another group, staying where it was', () => {
    expect(groupIdsAfterDrop(inGroups('a'), 'a', 'b', { copy: true })).toEqual(['a', 'b']);
  });

  it('moves out of Ungrouped into a group', () => {
    expect(groupIdsAfterDrop(ungrouped, UNGROUPED, 'a')).toEqual(['a']);
  });

  it('takes the repository out of every group when dropped on Ungrouped', () => {
    expect(groupIdsAfterDrop(inGroups('a', 'b'), 'a', UNGROUPED)).toEqual([]);
  });

  it('changes nothing when dropped where it already is', () => {
    expect(groupIdsAfterDrop(inGroups('a'), 'a', 'a')).toBeNull();
    expect(groupIdsAfterDrop(inGroups('a', 'b'), 'a', 'b', { copy: true })).toBeNull();
  });

  it('just leaves the source when the target already has it', () => {
    expect(groupIdsAfterDrop(inGroups('a', 'b'), 'a', 'b')).toEqual(['b']);
  });
});

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves an id before another', () => {
    expect(reorderIds(ids, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves an id after another', () => {
    expect(reorderIds(ids, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('returns null when nothing moves', () => {
    expect(reorderIds(ids, 'b', 'b', 'before')).toBeNull();
    expect(reorderIds(ids, 'b', 'c', 'before')).toBeNull();
    expect(reorderIds(ids, 'b', 'a', 'after')).toBeNull();
    expect(reorderIds(ids, 'x', 'a', 'after')).toBeNull();
  });
});
