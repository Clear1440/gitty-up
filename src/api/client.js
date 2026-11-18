const BASE_URL = '/api';

/** Every failed request rejects with this, whatever went wrong. */
export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildUrl(path, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, value);
  }
  const search = params.toString();
  return `${BASE_URL}${path}${search ? `?${search}` : ''}`;
}

async function send(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    // Called off, as when the page that asked was left: not a fault to report.
    if (init.signal?.aborted) throw error;
    throw new ApiError({
      status: 0,
      code: 'NETWORK',
      message: 'Could not reach the gitty-up server. Is it running?',
    });
  }
}

async function request(method, path, { query, body, signal } = {}) {
  const hasBody = body !== undefined;
  const response = await send(buildUrl(path, query), {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  // Calling off a request partway through its reply must not pass for an empty answer.
  signal?.throwIfAborted();
  if (response.ok) return payload;

  throw new ApiError({
    status: response.status,
    code: payload?.error?.code ?? 'UNKNOWN',
    message: payload?.error?.message ?? 'The gitty-up server sent an unexpected response.',
    details: payload?.error?.details,
  });
}

/** The only place in the client that touches the network. */
export const http = {
  /** Server-sent events from `path`. The caller listens on it and closes it. */
  events: (path) => new EventSource(buildUrl(path)),
  /** `signal` calls the request off, as React Query does when nothing shows it any more. */
  get: (path, query, { signal } = {}) => request('GET', path, { query, signal }),
  post: (path, body = {}) => request('POST', path, { body }),
  put: (path, body = {}) => request('PUT', path, { body }),
  patch: (path, body = {}) => request('PATCH', path, { body }),
  delete: (path, query) => request('DELETE', path, { query }),
};
