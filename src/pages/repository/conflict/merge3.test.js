import { describe, expect, it } from 'vitest';
import { detectEol, initialLines, joinLines, matchLines, merge3, splitLines } from './merge3.js';

const lines = (text) => (text ? text.split(' ') : []);

/** The chunks as `kind:ours|theirs`, which keeps expectations short. */
function summarize(chunks) {
  return chunks.map(({ kind, ours, theirs }) =>
    kind === 'conflict' ? `conflict:${ours.join(' ')}|${theirs.join(' ')}` : `${kind}:${initialLines({ kind, ours, theirs }).join(' ')}`,
  );
}

const merge = (base, ours, theirs) => summarize(merge3(lines(base), lines(ours), lines(theirs)));

describe('matchLines', () => {
  it('matches a longest common subsequence', () => {
    expect(matchLines(lines('a b c d'), lines('a x c d e'))).toEqual([0, -1, 2, 3]);
  });

  it('handles empty sides', () => {
    expect(matchLines([], lines('a'))).toEqual([]);
    expect(matchLines(lines('a b'), [])).toEqual([-1, -1]);
  });

  it('finds matches between unrelated edits', () => {
    expect(matchLines(lines('a b c d e f'), lines('x b y d z f'))).toEqual([-1, 1, -1, 3, -1, 5]);
  });
});

describe('merge3', () => {
  it('leaves an unchanged file as one stable chunk', () => {
    expect(merge('a b c', 'a b c', 'a b c')).toEqual(['stable:a b c']);
  });

  it('takes changes made on only one side', () => {
    expect(merge('a b c d e', 'a B c d e', 'a b c d E')).toEqual([
      'stable:a',
      'ours:B',
      'stable:c d',
      'theirs:E',
    ]);
  });

  it('takes the same change made on both sides once', () => {
    expect(merge('a b c', 'a X c', 'a X c')).toEqual(['stable:a', 'both:X', 'stable:c']);
  });

  it('reports different changes to the same lines as a conflict', () => {
    expect(merge('a b c', 'a ours c', 'a theirs c')).toEqual([
      'stable:a',
      'conflict:ours|theirs',
      'stable:c',
    ]);
  });

  it('keeps lines both sides added alike out of the conflict', () => {
    expect(merge('a z', 'a same ours z', 'a same theirs z')).toEqual([
      'stable:a',
      'both:same',
      'conflict:ours|theirs',
      'stable:z',
    ]);
  });

  it('treats a file both sides added as a conflict against an empty ancestor', () => {
    expect(merge('', 'one two', 'one three')).toEqual(['both:one', 'conflict:two|three']);
  });

  it('treats a deleted side as a conflict with the other side changing it', () => {
    expect(merge('a b', '', 'a B')).toEqual(['conflict:|a B']);
  });

  it('handles additions at the end', () => {
    expect(merge('a', 'a b', 'a')).toEqual(['stable:a', 'ours:b']);
  });

  it('can rebuild either side from the chunks', () => {
    const base = lines('1 2 3 4 5 6 7 8');
    const ours = lines('1 x 3 4 5 y 7 8 9');
    const theirs = lines('0 1 2 3 z 5 6 7 8');
    const chunks = merge3(base, ours, theirs);
    expect(chunks.flatMap((chunk) => chunk.ours)).toEqual(ours);
    expect(chunks.flatMap((chunk) => chunk.theirs)).toEqual(theirs);
    expect(chunks.flatMap((chunk) => chunk.base)).toEqual(base);
  });
});

describe('line endings', () => {
  it('splits CRLF and LF alike and remembers the final newline', () => {
    expect(splitLines('a\r\nb\r\n')).toEqual({ lines: ['a', 'b'], finalNewline: true });
    expect(splitLines('a\nb')).toEqual({ lines: ['a', 'b'], finalNewline: false });
    expect(splitLines('')).toEqual({ lines: [], finalNewline: false });
    expect(splitLines(null)).toEqual({ lines: [], finalNewline: false });
  });

  it('detects CRLF and joins with it', () => {
    const eol = detectEol(null, 'a\r\nb');
    expect(eol).toBe('\r\n');
    expect(joinLines(['a', 'b'], { eol, finalNewline: true })).toBe('a\r\nb\r\n');
    expect(joinLines([], { eol })).toBe('');
  });
});
