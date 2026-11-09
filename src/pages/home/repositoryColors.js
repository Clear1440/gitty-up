/**
 * The labels a repository can be colored with. The ids are what the server keeps.
 * The shades sit mid-way in lightness, so they read on dark and light schemes alike.
 */
export const REPOSITORY_COLORS = [
  { id: 'red', label: 'Red', value: '#e5484d' },
  { id: 'orange', label: 'Orange', value: '#f76b15' },
  { id: 'yellow', label: 'Yellow', value: '#e2a336' },
  { id: 'green', label: 'Green', value: '#30a46c' },
  { id: 'teal', label: 'Teal', value: '#12a594' },
  { id: 'blue', label: 'Blue', value: '#0090ff' },
  { id: 'purple', label: 'Purple', value: '#8e4ec6' },
  { id: 'pink', label: 'Pink', value: '#d6409f' },
];

/** The shade for a color id, or null for none or one no longer offered. */
export const colorValueOf = (colorId) =>
  REPOSITORY_COLORS.find((color) => color.id === colorId)?.value ?? null;
