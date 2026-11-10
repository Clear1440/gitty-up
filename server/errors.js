/**
 * An error with a stable code and HTTP status, serialized by the error handler.
 *
 * The static methods build each kind of error the API sends, so every code the client
 * can receive is listed in this one place.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The request itself is wrong, such as a missing field or an invalid ref. */
  static badRequest(message) {
    return new ApiError(400, 'BAD_REQUEST', message);
  }

  /** The request did not come from this machine. */
  static forbidden(message) {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message) {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  /** Git ran and refused or failed. `details` carries its raw output. */
  static gitFailure(message, details) {
    return new ApiError(409, 'GIT_FAILED', message, details);
  }

  /** Git stopped part way on conflicts, which the user resolves before carrying on. */
  static conflicts(message, details) {
    return new ApiError(409, 'CONFLICTS', message, details);
  }

  /** An action across a mono repo finished in some of its repositories but not all. */
  static partial(message, details) {
    return new ApiError(409, 'PARTIAL', message, details);
  }

  /** A merge would leave out commits that a branch's remote already has. */
  static branchBehind(message) {
    return new ApiError(409, 'BRANCH_BEHIND', message);
  }

  /**
   * A push would land on a remote branch that belongs to another branch, such as main.
   * `details` names both, `{ branch, remote, upstreamName }`, so the client can ask.
   */
  static upstreamMismatch(message, details) {
    return new ApiError(409, 'UPSTREAM_MISMATCH', message, details);
  }

  /** Anything unexpected. The real error is logged, never sent. */
  static internal() {
    return new ApiError(500, 'INTERNAL', 'Unexpected server error.');
  }
}

/** @deprecated Use ApiError.badRequest. */
export const badRequest = ApiError.badRequest;

/** @deprecated Use ApiError.notFound. */
export const notFound = ApiError.notFound;

/** @deprecated Use ApiError.gitFailure. */
export const gitFailure = ApiError.gitFailure;
