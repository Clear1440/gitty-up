import { describe, expect, it } from 'vitest';
import { avatarUrl } from './avatar.js';

describe('avatarUrl', () => {
  it('uses the account behind a GitHub private address', () => {
    expect(avatarUrl('583231+octocat@users.noreply.github.com')).toContain(
      'avatars.githubusercontent.com/u/583231',
    );
    expect(avatarUrl('octocat@users.noreply.github.com')).toContain('github.com/octocat.png');
  });

  it('looks up any other address on Gravatar, ignoring case and spaces', () => {
    const url = avatarUrl('ada@example.com');

    expect(url).toMatch(/^https:\/\/gravatar\.com\/avatar\/[0-9a-f]{64}\?/);
    expect(url).toContain('d=404');
    expect(avatarUrl(' Ada@Example.com ')).toBe(url);
  });

  it('has nothing to look up without an address', () => {
    expect(avatarUrl('')).toBeNull();
    expect(avatarUrl(undefined)).toBeNull();
  });
});
