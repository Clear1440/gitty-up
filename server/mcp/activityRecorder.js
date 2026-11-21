import { captureForUndo, readHead } from './activityUndo.js';
import { findRepository } from './gitTools.js';

const MAX_VALUE_LENGTH = 120;
const MAX_LIST_ITEMS = 5;
const MAX_ARGUMENTS = 12;
const MAX_MESSAGE_LENGTH = 500;
/** Arguments that could carry a file's contents or a diff. Only their length is kept. */
const BULKY_ARGUMENTS = new Set(['content', 'contents', 'patch', 'diff', 'text', 'data']);

const cut = (text, length = MAX_VALUE_LENGTH) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

function summarizeValue(value) {
  if (typeof value === 'string') return cut(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_LIST_ITEMS).map(summarizeValue);
    return value.length > MAX_LIST_ITEMS ? [...items, `…and ${value.length - MAX_LIST_ITEMS} more`] : items;
  }
  return '{…}';
}

/**
 * The arguments, short enough to keep: long text is cut, long lists are trimmed, and
 * anything that could be a file's contents or a diff is replaced by its length.
 */
export function summarizeArguments(args) {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return {};
  return Object.fromEntries(
    Object.entries(args)
      .slice(0, MAX_ARGUMENTS)
      .map(([key, value]) => [
        cut(key, 40),
        BULKY_ARGUMENTS.has(key) && typeof value === 'string'
          ? `[${value.length} characters]`
          : summarizeValue(value),
      ]),
  );
}

/** The repository as the tool would find it, or what was asked for when none matches. */
async function resolveRepository(store, args) {
  try {
    const { id, name, path } = await findRepository(store, args);
    return { id, name, path };
  } catch {
    const asked = typeof args?.repository === 'string' ? args.repository.trim() : '';
    return asked ? { id: null, name: cut(asked, 80), path: null } : null;
  }
}

/** Runs `step`, resolving with null rather than failing: logging must never break a call. */
async function quietly(step) {
  try {
    return await step();
  } catch {
    return null;
  }
}

function outcomeOf(result, thrown) {
  const failure = thrown ? thrown.message : result?.isError ? result.content?.[0]?.text : null;
  if (failure === null || failure === undefined) return { outcome: 'ok' };
  return { outcome: 'error', error: cut(String(failure), MAX_MESSAGE_LENGTH) };
}

/**
 * Runs one tools/call through `call`, and logs what it did in `activity`. A call that
 * can change a repository also records where HEAD stood before and after, plus whatever
 * its undo needs. Nothing here can fail the call or change its answer: if logging goes
 * wrong, the call goes on without it.
 */
export async function recordToolCall({ store, activity }, { name, args, isWrite }, call) {
  const repository = await resolveRepository(store, args);
  const repoPath = repository?.path;
  const before = isWrite && repoPath ? await quietly(() => readHead(repoPath)) : null;

  const started = performance.now();
  let result;
  let thrown;
  try {
    result = await call();
  } catch (error) {
    thrown = error;
  }
  const durationMs = Math.round(performance.now() - started);

  try {
    const outcome = outcomeOf(result, thrown);
    const changes =
      isWrite && repoPath
        ? {
            before,
            after: await quietly(() => readHead(repoPath)),
            ...(outcome.outcome === 'ok' && (await quietly(() => captureForUndo(name, repoPath, args)))),
          }
        : {};
    await activity.add({
      time: new Date().toISOString(),
      tool: cut(String(name ?? ''), 80),
      write: isWrite,
      repository: repository && { id: repository.id, name: repository.name },
      args: summarizeArguments(args),
      ...outcome,
      durationMs,
      ...changes,
    });
  } catch (error) {
    console.error('Could not log an AI tool call:', error);
  }

  if (thrown) throw thrown;
  return result;
}
