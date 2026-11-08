/** Sets, treated as immutable: every method returns a new set, as React state needs. */
export class SetHelper {
  /** A copy with `value` taken out if it was there, or added if it wasn't. */
  static toggle(set, value) {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  }

  /** A copy with every one of `values` added. */
  static addAll(set, values) {
    return new Set([...set, ...values]);
  }
}
