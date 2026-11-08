import { ApiError } from '../errors.js';

export function notFoundHandler(request, _response, next) {
  next(ApiError.notFound(`No route for ${request.method} ${request.originalUrl}`));
}

function sendError(response, { status, code, message, details }) {
  response.status(status).json({ error: { code, message, details } });
}

// Express identifies error handlers by their four-argument signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _request, response, _next) {
  if (error instanceof ApiError) {
    sendError(response, error);
    return;
  }
  if (error.type === 'entity.parse.failed') {
    sendError(response, ApiError.badRequest('Malformed JSON.'));
    return;
  }
  console.error(error);
  sendError(response, ApiError.internal());
}
