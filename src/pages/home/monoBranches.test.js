import { describe, expect, it } from 'vitest';
import { describeLeftOut, findMonoBranches } from './monoBranches.js';

const repository = (name, branch) => ({
  name,
  available: true,
  summary: { branch, detached: branch === null },
});

describe('findMonoBranches', () => {
  it('puts the branch most repositories are on first', () => {
    const choices = findMonoBranches([
      repository('docs', 'dev'),
      repository('api', 'main'),
      repository('web', 'main'),
    ]);
    expect(choices.map(({ branch }) => branch)).toEqual(['main', 'dev']);
    expect(choices[0].repositories.map(({ name }) => name)).toEqual(['api', 'web']);
  });

  it('breaks a tie by name, so the order never jumps around', () => {
    const choices = findMonoBranches([repository('a', 'zebra'), repository('b', 'apple')]);
    expect(choices.map(({ branch }) => branch)).toEqual(['apple', 'zebra']);
  });

  it('skips repositories that are on no branch', () => {
    const choices = findMonoBranches([
      repository('detached', null),
      { name: 'stub', available: false, summary: null },
    ]);
    expect(choices).toEqual([]);
  });
});

describe('describeLeftOut', () => {
  it('says where a repository is instead', () => {
    expect(describeLeftOut(repository('web', 'dev'))).toBe('on dev');
    expect(describeLeftOut(repository('web', null))).toBe('detached HEAD');
    expect(describeLeftOut({ available: false, summary: null })).toBe('not on this machine');
  });
});
