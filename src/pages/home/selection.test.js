import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, clickSelection, selectedInOrder } from './selection.js';

const ROWS = ['a', 'b', 'c', 'd', 'e'];

const click = (selection, id, modifiers) => clickSelection(selection, id, ROWS, modifiers);

describe('clickSelection', () => {
  it('toggles single rows with ctrl', () => {
    let selection = click(EMPTY_SELECTION, 'b', { toggle: true });
    selection = click(selection, 'd', { toggle: true });
    expect(selection).toEqual({ ids: ['b', 'd'], anchor: 'd' });

    expect(click(selection, 'b', { toggle: true })).toEqual({ ids: ['d'], anchor: 'b' });
  });

  it('selects a range from the anchor with shift, in either direction', () => {
    const anchored = click(EMPTY_SELECTION, 'b', { toggle: true });
    expect(click(anchored, 'd', { range: true }).ids).toEqual(['b', 'c', 'd']);

    const fromBelow = click(EMPTY_SELECTION, 'd', { toggle: true });
    expect(click(fromBelow, 'a', { range: true }).ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('replaces the selection with a new range, keeping the anchor', () => {
    let selection = click(EMPTY_SELECTION, 'c', { toggle: true });
    selection = click(selection, 'e', { range: true });
    selection = click(selection, 'a', { range: true });
    expect(selection).toEqual({ ids: ['a', 'b', 'c'], anchor: 'c' });
  });

  it('adds a range to the selection with ctrl and shift', () => {
    let selection = click(EMPTY_SELECTION, 'a', { toggle: true });
    selection = click(selection, 'c', { toggle: true });
    selection = click(selection, 'e', { toggle: true, range: true });
    expect(selection.ids).toEqual(['a', 'c', 'd', 'e']);
  });

  it('starts with just the row when shift-clicking without an anchor', () => {
    expect(click(EMPTY_SELECTION, 'c', { range: true })).toEqual({ ids: ['c'], anchor: 'c' });
  });

  it('starts afresh when the anchor is no longer on show', () => {
    const selection = { ids: ['gone'], anchor: 'gone' };
    expect(click(selection, 'b', { range: true })).toEqual({ ids: ['gone', 'b'], anchor: 'b' });
  });
});

describe('selectedInOrder', () => {
  it('lists the selected rows on show, top to bottom', () => {
    expect(selectedInOrder({ ids: ['d', 'hidden', 'a'], anchor: 'a' }, ROWS)).toEqual(['a', 'd']);
  });
});
