/** An error with a stable code and HTTP status, serialized by the error handler. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message) => new ApiError(400, 'BAD_REQUEST', message);

export const notFound = (message) => new ApiError(404, 'NOT_FOUND', message);

/** Git ran and refused or failed. `details` carries its raw output. */
export const gitFailure = (message, details) => new ApiError(409, 'GIT_FAILED', message, details);
