/** Comparing the ISO dates git reports. */
export class DateHelper {
  /** Whether `date` is later than `than`. */
  static isNewer(date, than) {
    return Date.parse(date) > Date.parse(than);
  }

  /** A sort comparator that puts the later of two dates first. */
  static newestFirst(a, b) {
    return Date.parse(b) - Date.parse(a);
  }
}
