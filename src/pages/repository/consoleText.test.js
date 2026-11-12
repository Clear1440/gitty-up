import { describe, expect, it } from 'vitest';
import { toConsoleText } from './consoleText.js';

describe('toConsoleText', () => {
  it('drops color codes and other terminal escapes', () => {
    expect(toConsoleText('\u001b[32m✓\u001b[0m passed \u001b]0;title\u0007done')).toBe('✓ passed done');
  });

  it('shows only the last state of a line rewritten with carriage returns', () => {
    expect(toConsoleText('start\r\n10%\r50%\r100%\nnext')).toBe('start\n100%\nnext');
    expect(toConsoleText('working 30%\r')).toBe('working 30%');
  });
});
