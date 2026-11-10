import { describe, expect, it } from 'vitest';
import { PatchHelper } from './patches.js';

const SHA1 = 'a'.repeat(40);
const SHA256 = 'b'.repeat(64);

describe('PatchHelper', () => {
  it('recognises format-patch files from SHA-1 and SHA-256 repositories', () => {
    expect(PatchHelper.isMailbox(`From ${SHA1} Mon Sep 17 00:00:00 2001\n`)).toBe(true);
    expect(PatchHelper.isMailbox(`From ${SHA256} Mon Sep 17 00:00:00 2001\n`)).toBe(true);
    expect(PatchHelper.isMailbox('diff --git a/x b/x\n')).toBe(false);
  });

  it('counts commits and files', () => {
    const patch = [
      `From ${SHA1} Mon Sep 17 00:00:00 2001`,
      'diff --git a/x b/x',
      `From ${SHA1} Mon Sep 17 00:00:00 2001`,
      'diff --git a/y b/y',
      'diff --git a/x b/x',
      '',
    ].join('\n');
    expect(PatchHelper.countCommits(patch)).toBe(2);
    // The same file changed by two commits is one file.
    expect(PatchHelper.countFiles(patch)).toBe(2);
    // Counting again gives the same answer, with no state left in the pattern.
    expect(PatchHelper.isMailbox(patch)).toBe(true);
    expect(PatchHelper.countCommits(patch)).toBe(2);
  });
});
