/** `anchor` is where a shift-click range starts: the last row clicked with a modifier. */
export const EMPTY_SELECTION = { ids: [], anchor: null };

/**
 * Applies a modifier click to the selection, the way file managers do. `toggle`
 * (ctrl or cmd) adds or removes one row. `range` (shift) selects every row from the
 * anchor to this one, and with `toggle` too adds that range to what was selected.
 * `orderedIds` are the rows on show, top to bottom.
 */
export function clickSelection(selection, id, orderedIds, { toggle = false, range = false }) {
  const anchorIndex = orderedIds.indexOf(selection.anchor);
  const index = orderedIds.indexOf(id);

  if (range && anchorIndex !== -1 && index !== -1) {
    const span = orderedIds.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1);
    const ids = toggle ? [...new Set([...selection.ids, ...span])] : span;
    return { ids, anchor: selection.anchor };
  }
  if (range) return { ids: [...new Set([...selection.ids, id])], anchor: id };

  const ids = selection.ids.includes(id)
    ? selection.ids.filter((selected) => selected !== id)
    : [...selection.ids, id];
  return { ids, anchor: id };
}

/** The selected rows still on show, in the order they appear. */
export function selectedInOrder(selection, orderedIds) {
  return orderedIds.filter((id) => selection.ids.includes(id));
}
