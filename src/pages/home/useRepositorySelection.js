import { createContext, useContext, useEffect, useState } from 'react';
import { paths } from '../../paths.js';
import { useTabs } from '../../tabs/TabsContext.jsx';
import { EMPTY_SELECTION, clickSelection, selectedInOrder } from './selection.js';

export const RepositorySelectionContext = createContext(null);

export function useRepositorySelectionContext() {
  return useContext(RepositorySelectionContext);
}

/**
 * Rows picked with ctrl and shift clicks, to open together. `orderedIds` are the rows
 * that can be picked, top to bottom: hidden ones keep their place in the selection but
 * are left out until they show again.
 */
export function useRepositorySelection(orderedIds) {
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const { openTab } = useTabs();
  const selectedIds = selectedInOrder(selection, orderedIds);
  const hasSelection = selectedIds.length > 0;

  useEffect(() => {
    if (!hasSelection) return undefined;
    const clearOnEscape = (event) => {
      if (event.key === 'Escape') setSelection(EMPTY_SELECTION);
    };
    document.addEventListener('keydown', clearOnEscape);
    return () => document.removeEventListener('keydown', clearOnEscape);
  }, [hasSelection]);

  const clear = () => setSelection(EMPTY_SELECTION);

  return {
    selectedIds,
    isSelected: (id) => selectedIds.includes(id),
    click: (id, modifiers) =>
      setSelection((current) => clickSelection(current, id, orderedIds, modifiers)),
    selectOnly: (id) => setSelection({ ids: [id], anchor: id }),
    clear,
    /** Opens each selected repository in a tab of its own, staying on this page. */
    openSelected: () => {
      for (const id of selectedIds) openTab(id, paths.repository(id));
      clear();
    },
  };
}
