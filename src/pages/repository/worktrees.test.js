import { describe, expect, it } from 'vitest';
import { localNameOf, suggestWorktreeFolder } from './worktrees.js';

describe('suggestWorktreeFolder', () => {
  it('puts it beside the main working tree, named after the branch', () => {
    expect(suggestWorktreeFolder('D:\\code\\app', 'feature/login')).toBe(
      'D:\\code\\app-feature-login',
    );
    expect(suggestWorktreeFolder('/home/me/app/', 'fix it')).toBe('/home/me/app-fix-it');
  });

  it('falls back to a plain name without a branch', () => {
    expect(suggestWorktreeFolder('/srv/app', '')).toBe('/srv/app-worktree');
    expect(suggestWorktreeFolder('', 'x')).toBe('');
  });
});

describe('localNameOf', () => {
  it('maps a remote branch to the local branch it would become', () => {
    const remote = [{ name: 'origin/feature/x', localName: 'feature/x' }];
    expect(localNameOf('origin/feature/x', remote)).toBe('feature/x');
    expect(localNameOf('main', remote)).toBe('main');
  });
});
