import { describe, expect, it } from 'vitest';
import { parseDiff } from './diffRows.js';
import { annotateWordChanges, diffWords } from './wordDiff.js';

const changedText = (segments) =>
  segments.filter(({ changed }) => changed).map(({ text }) => text);

describe('diffWords', () => {
  it('marks just the words that changed', () => {
    const result = diffWords('const total = price * 2;', 'const total = price * 3;');
    expect(changedText(result.before)).toEqual(['2']);
    expect(changedText(result.after)).toEqual(['3']);
    expect(result.after.map(({ text }) => text).join('')).toBe('const total = price * 3;');
  });

  it('catches a subtle change such as one punctuation mark', () => {
    const result = diffWords('if (a == b) {', 'if (a === b) {');
    expect(changedText(result.after).join('')).toContain('=');
  });

  it('leaves lines that have little in common unmarked', () => {
    expect(diffWords('import React from "react";', 'return null;')).toBeNull();
  });

  it('leaves identical and very long lines alone', () => {
    expect(diffWords('same', 'same')).toBeNull();
    expect(diffWords('a'.repeat(2_000), 'b'.repeat(2_000))).toBeNull();
  });
});

describe('annotateWordChanges', () => {
  it('pairs the nth deleted line with the nth added one in each run', () => {
    const hunks = parseDiff(
      [
        '@@ -1,3 +1,3 @@',
        ' keep',
        '-let count = 1;',
        '-let name = "a";',
        '+let count = 2;',
        '+let name = "b";',
        ' keep',
      ].join('\n'),
    );
    annotateWordChanges(hunks);
    const [, oldCount, oldName, newCount, newName] = hunks[0].lines;
    expect(changedText(oldCount.segments)).toEqual(['1']);
    expect(changedText(newCount.segments)).toEqual(['2']);
    expect(changedText(oldName.segments)).toEqual(['a']);
    expect(changedText(newName.segments)).toEqual(['b']);
  });

  it('leaves a lone addition unmarked', () => {
    const hunks = annotateWordChanges(parseDiff('@@ -1,0 +1 @@\n+new line'));
    expect(hunks[0].lines[0].segments).toBeUndefined();
  });
});
