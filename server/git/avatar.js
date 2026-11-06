import { createHash } from 'node:crypto';

// Twice the size it is drawn at, to stay sharp on high density screens.
const AVATAR_PIXELS = 40;

// GitHub's private addresses: 123+octocat@users.noreply.github.com, or the older octocat@…
const GITHUB_NOREPLY = /^(?:(\d+)\+)?([^@+]+)@users\.noreply\.github\.com$/;

/**
 * Where to find the avatar of a commit's author. Git itself stores none, so this
 * goes by the email: GitHub's private addresses name their account, and anything else
 * is looked up on Gravatar, which replies 404 when it has no picture for that address.
 */
export function avatarUrl(email) {
  const address = email?.trim().toLowerCase();
  if (!address) return null;

  const github = GITHUB_NOREPLY.exec(address);
  if (github) {
    const [, id, login] = github;
    return id
      ? `https://avatars.githubusercontent.com/u/${id}?s=${AVATAR_PIXELS}`
      : `https://github.com/${encodeURIComponent(login)}.png?size=${AVATAR_PIXELS}`;
  }

  const hash = createHash('sha256').update(address).digest('hex');
  return `https://gravatar.com/avatar/${hash}?s=${AVATAR_PIXELS}&d=404`;
}
