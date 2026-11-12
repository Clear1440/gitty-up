// Color codes and other terminal escapes: CSI sequences, OSC sequences such as window
// titles and links, and the two-character escapes.
// eslint-disable-next-line no-control-regex
const ESCAPES = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[@-Z\\-_]/g;

/**
 * Script output as a terminal would show it, as plain text: escapes removed, and a line
 * that a progress bar rewrote with carriage returns showing only what it was rewritten to.
 */
export function toConsoleText(raw) {
  return raw
    .replace(ESCAPES, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      // A trailing \r means the next write starts over, so show what is there until then.
      return line.split('\r').findLast(Boolean) ?? '';
    })
    .join('\n');
}
