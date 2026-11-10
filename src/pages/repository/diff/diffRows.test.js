import { describe, expect, it } from 'vitest';
import { buildRows, parseDiff, selectableIds, toDiffView } from './diffRows.js';

const DIFF = [
  'diff --git a/file.txt b/file.txt',
  'index 1111111..2222222 100644',
  '--- a/file.txt',
  '+++ b/file.txt',
  '@@ -10,4 +10,4 @@ function example',
  ' before',
  '-old one',
  '-old two',
  '+new one',
  ' between',
  '+added',
  ' after',
  '\\ No newline at end of file',
  '',
].join('\n');

const lineIds = (rows) => rows.filter((row) => row.type === 'line').map((row) => row.line.id);

describe('parseDiff', () => {
  const [hunk] = parseDiff(DIFF);

  it('numbers lines on each side, and identifies them by their place in the diff', () => {
    expect(hunk.lines.slice(0, 4)).toEqual([
      { id: 5, kind: 'context', text: 'before', oldNumber: 10, newNumber: 10 },
      { id: 6, kind: 'deleted', text: 'old one', oldNumber: 11, newNumber: null },
      { id: 7, kind: 'deleted', text: 'old two', oldNumber: 12, newNumber: null },
      { id: 8, kind: 'added', text: 'new one', oldNumber: null, newNumber: 11 },
    ]);
  });

  it('marks a line with no newline, without counting the marker as a line', () => {
    expect(hunk.lines.at(-1)).toMatchObject({ text: 'after', noNewline: true });
    expect(hunk.lines).toHaveLength(7);
  });

  it('keeps lines that look like headers when they are content', () => {
    const [{ lines }] = parseDiff('@@ -1 +1 @@\n-@@ -9 +9 @@\n+--- a/file\n');
    expect(lines.map((line) => line.text)).toEqual(['@@ -9 +9 @@', '--- a/file']);
  });

  it('finds no hunks in a binary file or a combined conflict diff', () => {
    expect(parseDiff('Binary files a/x and b/x differ\n')).toEqual([]);
    expect(parseDiff('@@@ -1,2 -1,2 +1,3 @@@\n  text\n')).toEqual([]);
  });
});

describe('selectableIds', () => {
  it('lists changed lines only', () => {
    expect(selectableIds(parseDiff(DIFF))).toEqual([6, 7, 8, 10]);
  });
});

describe('buildRows', () => {
  const hunks = parseDiff(DIFF);

  it('heads each of git\'s hunks in the hunk view', () => {
    const rows = buildRows(hunks, 'hunk');
    expect(rows[0]).toMatchObject({
      type: 'hunk',
      text: '@@ -10,4 +10,4 @@ function example',
      ids: [6, 7, 8, 10],
    });
    expect(lineIds(rows)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it('treats each run of changes as a hunk in the inline view', () => {
    const rows = buildRows(hunks, 'inline');
    expect(rows.filter((row) => row.type === 'hunk').map((row) => row.ids)).toEqual([
      [6, 7, 8],
      [10],
    ]);
    expect(lineIds(rows)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });

  it('puts each deletion beside an addition in the split view', () => {
    const pairs = buildRows(hunks, 'split').filter((row) => row.type === 'pair');
    expect(pairs.map((row) => [row.left?.id ?? null, row.right?.id ?? null])).toEqual([
      [5, 5],
      [6, 8],
      [7, null],
      [9, 9],
      [null, 10],
      [11, 11],
    ]);
  });

  it('can show git\'s hunks side by side', () => {
    const rows = buildRows(hunks, { context: 'hunk', layout: 'split' });
    expect(rows[0]).toMatchObject({ type: 'hunk', text: '@@ -10,4 +10,4 @@ function example' });
    expect(rows.filter((row) => row.type === 'hunk')).toHaveLength(1);
    expect(rows.slice(1).every((row) => row.type === 'pair')).toBe(true);
  });

  it('reads the single words older versions stored', () => {
    expect(toDiffView('split')).toEqual({ context: 'full', layout: 'split' });
    expect(toDiffView('nonsense')).toEqual({ context: 'hunk', layout: 'inline' });
    expect(toDiffView({ context: 'full', layout: 'inline' })).toEqual({
      context: 'full',
      layout: 'inline',
    });
  });

  it('gives every row a unique key', () => {
    for (const view of [
      'hunk',
      'inline',
      'split',
      { context: 'hunk', layout: 'split' },
    ]) {
      const keys = buildRows(hunks, view).map((row) => row.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
