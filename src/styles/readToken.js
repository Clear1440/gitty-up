/** Reads a value from tokens.css, for code that cannot use CSS directly. */
export function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readPixels(name) {
  return Number.parseInt(readToken(name), 10);
}
