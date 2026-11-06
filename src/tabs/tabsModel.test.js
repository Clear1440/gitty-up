import { describe, expect, it } from 'vitest';
import { findNeighbourTab, rememberTab, removeTab } from './tabsModel.js';

const tab = (repositoryId) => ({ repositoryId, path: `/${repositoryId}` });

describe('rememberTab', () => {
  it('opens new tabs at the end', () => {
    expect(rememberTab([tab('a')], 'b', '/b')).toEqual([tab('a'), tab('b')]);
  });

  it('updates the path of an open tab without moving it', () => {
    const tabs = rememberTab([tab('a'), tab('b')], 'a', '/a/changes');
    expect(tabs).toEqual([{ repositoryId: 'a', path: '/a/changes' }, tab('b')]);
  });

  it('keeps the same array when nothing changed, so renders can bail out', () => {
    const tabs = [tab('a')];
    expect(rememberTab(tabs, 'a', '/a')).toBe(tabs);
  });
});

describe('removeTab', () => {
  it('removes only the given tab', () => {
    expect(removeTab([tab('a'), tab('b')], 'a')).toEqual([tab('b')]);
  });
});

describe('findNeighbourTab', () => {
  const tabs = [tab('a'), tab('b'), tab('c')];

  it('prefers the next tab', () => {
    expect(findNeighbourTab(tabs, 'b')).toEqual(tab('c'));
  });

  it('falls back to the previous tab', () => {
    expect(findNeighbourTab(tabs, 'c')).toEqual(tab('b'));
  });

  it('returns null for the only tab', () => {
    expect(findNeighbourTab([tab('a')], 'a')).toBeNull();
  });
});
