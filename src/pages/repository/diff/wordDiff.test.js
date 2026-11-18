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

  it('compares only lines that can be among the first rows on screen', () => {
    const edits = (count) =>
      Array.from({ length: count }, (_, index) => [`-let v${index} = 1;`, `+let v${index} = 2;`]);
    const hunks = parseDiff(
      ['@@ -1,4 +1,4 @@', ...edits(4).flatMap(([before, after]) => [' keep', before, after])].join(
        '\n',
      ),
    );

    // Context, edit, context, edit... each takes at least a row in either layout.
    annotateWordChanges(hunks, { maxRows: 4 });

    const edited = hunks[0].lines.filter((line) => line.kind !== 'context');
    expect(edited.map((line) => Boolean(line.segments))).toEqual([
      true, true, true, true, false, false, false, false,
    ]);
  });

  it('marks a drawn line whose split-view partner sits further down the run', () => {
    // The split view pairs the run's nth deletion with its nth addition, so the second
    // edit's addition shares the second row, though its own deletion comes far later.
    const deletions = Array.from({ length: 10 }, (_, index) => `-let old${index} = 0;`);
    const hunks = parseDiff(
      ['@@ -1,11 +1,2 @@', ...deletions, '+let old0 = 1;', '-let total = 1;', '+let total = 2;'].join(
        '\n',
      ),
    );

    annotateWordChanges(hunks, { maxRows: 3 });

    const lines = hunks[0].lines;
    expect(lines.at(-1).segments).toBeDefined();
    expect(lines.at(-2).segments).toBeDefined();
  });

  it('leaves a lone addition unmarked', () => {
    const hunks = annotateWordChanges(parseDiff('@@ -1,0 +1 @@\n+new line'));
    expect(hunks[0].lines[0].segments).toBeUndefined();
  });
});
