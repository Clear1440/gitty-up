import { GROUP_COLORS } from '../home/groupColors.js';

/**
 * The group shades, reordered so that neighbours differ most: the first few
 * repositories of a mono repo, which are the usual case, never look alike.
 */
const ORDER = ['blue', 'orange', 'green', 'purple', 'pink', 'teal', 'yellow', 'red'];
const PALETTE = ORDER.map((id) => GROUP_COLORS.find((color) => color.id === id).value);

/** The color for a repository's slot in its mono repo. Past eight, they come round again. */
export function colorOfSlot(slot) {
  return PALETTE[(slot ?? 0) % PALETTE.length];
}

/**
 * Each repository's color in a mono repo, by name, as commits and files name their
 * repository. `mono` is a mono status's `mono`, or undefined outside a mono repo.
 */
export function mapRepositoryColors(mono) {
  if (!mono) return new Map();
  return new Map(
    [...mono.members, ...mono.leftOut].map(({ name, slot }) => [name, colorOfSlot(slot)]),
  );
}
