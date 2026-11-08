import { ApiError } from '../errors.js';

/** Checks values sent in a request, throwing a 400 that names the field when one is wrong. */
export class ValidationHelper {
  /** A string with something other than spaces in it. It comes back exactly as sent. */
  static requireString(value, name) {
    if (typeof value !== 'string' || !value.trim()) {
      throw ApiError.badRequest(`"${name}" is required.`);
    }
    return value;
  }

  /** A string with something other than spaces in it, without spaces around it. */
  static requireTrimmedString(value, name) {
    return ValidationHelper.requireString(value, name).trim();
  }

  /** A trimmed string, or undefined when the field was left out or null. */
  static optionalString(value, name) {
    if (value === undefined || value === null) return undefined;
    return ValidationHelper.requireString(value, name).trim();
  }

  /** A non-empty list of file paths. */
  static requirePaths(paths) {
    const isValid =
      Array.isArray(paths) && paths.length > 0 && paths.every((path) => typeof path === 'string');
    if (!isValid) throw ApiError.badRequest('"paths" must be a non-empty list of file paths.');
    return paths;
  }

  /** A non-empty list of file paths, or undefined when the field was left out. */
  static optionalPaths(paths) {
    return paths === undefined ? undefined : ValidationHelper.requirePaths(paths);
  }

  /** A non-empty list of line numbers. */
  static requireLines(lines) {
    const isValid = Array.isArray(lines) && lines.length > 0 && lines.every(Number.isInteger);
    if (!isValid) throw ApiError.badRequest('"lines" must be a non-empty list of line numbers.');
    return lines;
  }

  /** A whole number from a query string, at most `max`, or `fallback` when it isn't one. */
  static toCount(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    const count = Number.parseInt(value, 10);
    return Number.isNaN(count) || count < 0 ? fallback : Math.min(count, max);
  }
}
