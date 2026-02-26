'use strict';

/**
 * Centralised error handler.
 *
 * Response shape follows the BitGo / Fireblocks convention:
 *   { error: "Human-readable", name: "ErrorCode", requestId: "..." }
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const name = err.name || 'InternalError';
  const message = err.expose !== false ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error(`[${req.requestId}] ${name}: ${err.message}`, err.stack);
  }

  res.status(status).json({
    error: message,
    name,
    requestId: req.requestId,
  });
}

/**
 * Helper to create operational errors with HTTP status codes.
 */
function apiError(message, status = 400, name = 'BadRequest') {
  const err = new Error(message);
  err.status = status;
  err.name = name;
  err.expose = true;
  return err;
}

module.exports = { errorHandler, apiError };
