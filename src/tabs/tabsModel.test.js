import { describe, expect, it } from 'vitest';
import { findNeighbourTab, moveTab, openTab, rememberTab, removeTab } from './tabsModel.js';

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

describe('openTab', () => {
  it('opens new tabs at the end', () => {
    expect(openTab([tab('a')], 'b', '/b')).toEqual([tab('a'), tab('b')]);
  });

  it('leaves an open tab where it was, on the page it was showing', () => {
    const tabs = [tab('a')];
    expect(openTab(tabs, 'a', '/somewhere-else')).toBe(tabs);
  });
});

describe('moveTab', () => {
  const tabs = [tab('a'), tab('b'), tab('c')];
  const order = (moved) => moved.map(({ repositoryId }) => repositoryId).join('');

  it('moves a tab before the target', () => {
    expect(order(moveTab(tabs, 'c', 'a'))).toBe('cab');
  });

  it('moves a tab after the target', () => {
    expect(order(moveTab(tabs, 'a', 'b', true))).toBe('bac');
    expect(order(moveTab(tabs, 'a', 'c', true))).toBe('bca');
  });

  it('leaves the tabs alone when dropped on itself or an unknown tab', () => {
    expect(moveTab(tabs, 'a', 'a')).toBe(tabs);
    expect(moveTab(tabs, 'a', 'home')).toBe(tabs);
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
