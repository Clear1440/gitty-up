import { ApiError } from '../errors.js';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopback(url) {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Binding to loopback is not enough: any website open in the browser can still
 * send requests to localhost. Checking Host stops DNS rebinding, and checking
 * Origin stops cross-site requests.
 */
export function localOnly(request, _response, next) {
  const { host, origin } = request.headers;
  if (!isLoopback(`http://${host}`) || (origin && !isLoopback(origin))) {
    next(new ApiError(403, 'FORBIDDEN', 'Requests must come from this machine.'));
    return;
  }
  next();
}
