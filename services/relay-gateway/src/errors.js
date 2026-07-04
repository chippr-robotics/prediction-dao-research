/**
 * GatewayError — the single error type surfaced to clients.
 *
 * Error body shape is ALWAYS `{ error: { code, reason } }` (contracts/relay-gateway-api.md).
 * `code` values are the exact enum from the API contract; `reason` is a specific,
 * user-actionable sentence (spec 035 FR-019). Never leak internals or key material.
 */
export class GatewayError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code   machine-readable error code from the API contract
   * @param {string} reason user-actionable reason
   * @param {{retryAfterSec?: number}} [opts]
   */
  constructor(status, code, reason, opts = {}) {
    super(reason)
    this.status = status
    this.code = code
    this.reason = reason
    this.retryAfterSec = opts.retryAfterSec
  }

  toBody() {
    return { error: { code: this.code, reason: this.reason } }
  }
}

/** Engine unreachable / persistent non-2xx — mapped to 503 chain_unavailable at the route. */
export class EngineUnavailableError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'EngineUnavailableError'
    this.cause = cause
  }
}
