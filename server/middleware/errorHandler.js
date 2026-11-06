import { ApiError, notFound } from '../errors.js';

export function notFoundHandler(request, _response, next) {
  next(notFound(`No route for ${request.method} ${request.originalUrl}`));
}

// Express identifies error handlers by their four-argument signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _request, response, _next) {
  if (error instanceof ApiError) {
    const { status, code, message, details } = error;
    response.status(status).json({ error: { code, message, details } });
    return;
  }
  if (error.type === 'entity.parse.failed') {
    response.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON.' } });
    return;
  }
  console.error(error);
  response.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected server error.' } });
}
