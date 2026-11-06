import { describe, expect, it } from 'vitest';
import { formatBranchName } from './formatBranchName.js';

describe('formatBranchName', () => {
  it('turns spaces into dashes', () => {
    expect(formatBranchName('my new branch')).toBe('my-new-branch');
  });

  it('never allows two dashes in a row', () => {
    expect(formatBranchName('my--branch')).toBe('my-branch');
    expect(formatBranchName('my----branch')).toBe('my-branch');
  });

  it('does not add a dash after a dash, or for repeated spaces', () => {
    expect(formatBranchName('my- ')).toBe('my-');
    expect(formatBranchName('my   branch')).toBe('my-branch');
  });

  it('keeps a space at the end, as a dash, so the next word can follow it', () => {
    expect(formatBranchName('my ')).toBe('my-');
  });

  it('handles tabs and line breaks from pasted text', () => {
    expect(formatBranchName('my\tnew\nbranch')).toBe('my-new-branch');
  });

  it('drops leading spaces', () => {
    expect(formatBranchName('  my branch')).toBe('my-branch');
    expect(formatBranchName(' ')).toBe('');
  });

  it('leaves everything else alone', () => {
    expect(formatBranchName('feature/login_v2.1')).toBe('feature/login_v2.1');
  });
});
