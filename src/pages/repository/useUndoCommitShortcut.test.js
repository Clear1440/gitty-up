import { describe, expect, it } from 'vitest';
import { isUndoCommitKey } from './useUndoCommitShortcut.js';

const page = { closest: () => null };
const field = { closest: () => ({}) };
const press = (overrides) => ({ key: 'z', ctrlKey: true, target: page, ...overrides });

describe('isUndoCommitKey', () => {
  it('accepts Ctrl+Z and Cmd+Z, with or without caps lock', () => {
    expect(isUndoCommitKey(press())).toBe(true);
    expect(isUndoCommitKey(press({ ctrlKey: false, metaKey: true }))).toBe(true);
    expect(isUndoCommitKey(press({ key: 'Z' }))).toBe(true);
  });

  it('leaves undo in a text field to the text field', () => {
    expect(isUndoCommitKey(press({ target: field }))).toBe(false);
  });

  it('ignores other keys and combinations', () => {
    expect(isUndoCommitKey(press({ key: 'y' }))).toBe(false);
    expect(isUndoCommitKey(press({ ctrlKey: false }))).toBe(false);
    expect(isUndoCommitKey(press({ shiftKey: true }))).toBe(false);
    expect(isUndoCommitKey(press({ altKey: true }))).toBe(false);
  });

  it('never fires again from a held key', () => {
    expect(isUndoCommitKey(press({ repeat: true }))).toBe(false);
  });
});
