import { describe, expect, it } from 'vitest';
import { findBehindBranches } from './findBehindBranches.js';

const branch = (name, behind) => ({ name, behind, upstream: `origin/${name}` });

describe('findBehindBranches', () => {
  it('describes each named branch that is behind', () => {
    const local = [branch('main', 1), branch('topic', 3)];

    expect(findBehindBranches(local, ['main', 'topic'])).toEqual([
      'main is 1 commit behind origin/main.',
      'topic is 3 commits behind origin/topic.',
    ]);
  });

  it('ignores up to date branches, and branches not in the merge', () => {
    const local = [branch('main', 0), branch('other', 2)];

    expect(findBehindBranches(local, ['main', 'topic'])).toEqual([]);
  });

  it('copes with a detached HEAD or nothing chosen yet', () => {
    expect(findBehindBranches([branch('main', 1)], [null, undefined])).toEqual([]);
  });
});
