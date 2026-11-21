import crypto from 'node:crypto';

const TOKEN_BYTES = 32;

/** A new secret for AI tools to send: 32 random bytes, as base64url so it needs no escaping. */
export const createMcpToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url');

/** The token in an `Authorization: Bearer <token>` header, or null when there is none. */
export function bearerToken(header) {
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header ?? '');
  return match ? match[1] : null;
}

const digest = (text) => crypto.createHash('sha256').update(text).digest();

/**
 * Whether `given` is the token. Both are hashed first, so the comparison always takes the
 * same time and never throws, whatever the length of what was sent.
 */
export function isMcpToken(expected, given) {
  if (typeof expected !== 'string' || expected === '' || typeof given !== 'string') return false;
  return crypto.timingSafeEqual(digest(expected), digest(given));
}

/** Calls already making a token, so two at once agree on the same one. */
const pending = new WeakMap();

/**
 * The saved token, made and saved first if there is none yet, as for someone who turned
 * the MCP server on before it needed one.
 */
export function ensureMcpToken(settings) {
  if (!pending.has(settings)) {
    const making = (async () => {
      const { mcp } = await settings.get();
      if (mcp.token) return mcp.token;
      const token = createMcpToken();
      await settings.update({ mcp: { ...mcp, token } });
      return token;
    })().finally(() => pending.delete(settings));
    pending.set(settings, making);
  }
  return pending.get(settings);
}
