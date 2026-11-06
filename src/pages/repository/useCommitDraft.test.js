import { describe, expect, it } from 'vitest';
import { addToDraft } from './useCommitDraft.js';

describe('addToDraft', () => {
  it('uses the message alone when there is no draft', () => {
    expect(addToDraft('Add login', '')).toBe('Add login');
    expect(addToDraft('Add login', ' \n')).toBe('Add login');
  });

  it('keeps a draft, after the message', () => {
    expect(addToDraft('Add login', 'Fix typo')).toBe('Add login\n\nFix typo');
  });

  it('keeps the draft when the commit had no message', () => {
    expect(addToDraft('', 'Fix typo')).toBe('Fix typo');
  });
});
