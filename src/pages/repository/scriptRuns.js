import { useSyncExternalStore } from 'react';
import { gitApi } from '../../api';

/**
 * The latest script run in each repository, followed live from the server. It lives
 * outside React, so a run keeps being followed while its tab is closed, and its output
 * is all there when the tab opens again.
 */

/** Only the end of a long output is kept, as on the server. */
const MAX_OUTPUT_CHARS = 200_000;
/** Output is shown in batches, as a busy script can write thousands of lines a second. */
const FLUSH_MS = 60;

const runs = new Map();
const latestByRepository = new Map();
const streams = new Map();
const pendingOutput = new Map();
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(runId, patch) {
  const run = runs.get(runId);
  if (!run) return;
  runs.set(runId, { ...run, ...(typeof patch === 'function' ? patch(run) : patch) });
  emit();
}

const capped = (text) => (text.length > MAX_OUTPUT_CHARS ? text.slice(-MAX_OUTPUT_CHARS) : text);

function flush(runId) {
  const pending = pendingOutput.get(runId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingOutput.delete(runId);
  update(runId, (run) => ({ output: capped(run.output + pending.text) }));
}

function queueOutput(runId, text) {
  const pending = pendingOutput.get(runId);
  if (pending) {
    pending.text += text;
    return;
  }
  pendingOutput.set(runId, { text, timer: setTimeout(() => flush(runId), FLUSH_MS) });
}

function close(runId) {
  streams.get(runId)?.close();
  streams.delete(runId);
}

function forget(runId) {
  close(runId);
  clearTimeout(pendingOutput.get(runId)?.timer);
  pendingOutput.delete(runId);
  runs.delete(runId);
}

function follow(repositoryId, runId) {
  const source = gitApi.scriptRunEvents(repositoryId, runId);
  streams.set(runId, source);

  // Sent first, and again whenever the connection comes back, with all output so far.
  source.addEventListener('snapshot', (event) => {
    const { output, ...summary } = JSON.parse(event.data);
    clearTimeout(pendingOutput.get(runId)?.timer);
    pendingOutput.delete(runId);
    update(runId, { ...summary, output: capped(output) });
  });
  source.addEventListener('output', (event) => queueOutput(runId, JSON.parse(event.data).text));
  source.addEventListener('end', (event) => {
    flush(runId);
    update(runId, JSON.parse(event.data));
    // The server closes the stream next, which EventSource would otherwise reopen.
    close(runId);
  });
  source.addEventListener('error', () => {
    // EventSource retries a dropped connection by itself. Closed means it gave up, as
    // when the server restarted and no longer knows the run.
    if (source.readyState !== EventSource.CLOSED) return;
    flush(runId);
    update(runId, (run) => (run.status === 'running' ? { status: 'lost' } : {}));
    close(runId);
  });
}

/**
 * Starts the script `name` with `params` and follows its output. Resolves once it has
 * started, and rejects if it could not, such as for a missing required parameter.
 */
export async function startScriptRun(repositoryId, { name, params }) {
  const summary = await gitApi.startScript(repositoryId, { name, params });
  const previous = latestByRepository.get(repositoryId);
  if (previous) forget(previous);
  runs.set(summary.id, { ...summary, repositoryId, output: '', request: { name, params }, seen: false });
  latestByRepository.set(repositoryId, summary.id);
  emit();
  follow(repositoryId, summary.id);
  return summary;
}

export function stopScriptRun(repositoryId, runId) {
  return gitApi.stopScript(repositoryId, runId);
}

/** Notes that the user has been told how a run ended, so they are told only once. */
export function markScriptRunSeen(runId) {
  update(runId, { seen: true });
}

/** The repository's latest run, with its output so far, or undefined if it has had none. */
export function useLatestScriptRun(repositoryId) {
  return useSyncExternalStore(subscribe, () => runs.get(latestByRepository.get(repositoryId)));
}
