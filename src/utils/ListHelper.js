/** Arrays, treated as immutable: every method returns a new array or a value. */
export class ListHelper {
  /** A copy with `value` taken out if it was there, or added at the end if it wasn't. */
  static toggle(list, value) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  /** The items from one index to another, both included, whichever way round they come. */
  static sliceBetween(list, fromIndex, toIndex) {
    return list.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
  }

  /** The items without repeats, each where it first appeared. */
  static unique(items) {
    return [...new Set(items)];
  }

  /** How many different keys the items have, by `keyOf`. */
  static countUnique(items, keyOf) {
    return new Set(items.map(keyOf)).size;
  }
}
