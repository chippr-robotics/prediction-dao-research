/**
 * Typed errors for the shared intent-relay client (specs 035 + 036).
 *
 * Callers branch on these classes (or their stable `code`) to enforce the never-stranded rule
 * (spec 035 FR-014, spec 036 FR-016/SC-004): RelayerUnavailable and PaymentUnsupportedOnChain mean
 * "fall back to self-submit" (identical on-chain result, user pays gas); RelayRejected means the
 * gateway validated and refused the intent (no funds moved) — surface `code`/`reason` to the user.
 */

/** Base class so `err instanceof RelayError` catches every relay-client failure. */
export class RelayError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message)
    this.name = 'RelayError'
    this.code = code || 'relay_error'
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * The relayer cannot take the intent right now: unset/unreachable endpoint, timeout, 429 back-pressure
 * or 503 (kill switch, screening outage, chain down). Never a validation verdict — the same intent may
 * be self-submitted immediately (spec 036 relay-gateway-api.md 429/503 semantics).
 */
export class RelayerUnavailable extends RelayError {
  constructor(message, { code, status, retryAfterSeconds, cause } = {}) {
    super(message, { code: code || 'relayer_unavailable', cause })
    this.name = 'RelayerUnavailable'
    this.status = status ?? null
    this.retryAfterSeconds = retryAfterSeconds ?? null
  }
}

/**
 * The gateway rejected the intent (4xx other than 429): invalid_signature, chain_mismatch,
 * target_not_allowlisted, param_binding_mismatch, expired, not_yet_valid, fee_exceeds_cap,
 * sanctioned_signer, duplicate_in_flight, … `code` carries the gateway's `error.code` verbatim.
 */
export class RelayRejected extends RelayError {
  constructor(message, { code, status, reason, cause } = {}) {
    super(message, { code: code || 'relay_rejected', cause })
    this.name = 'RelayRejected'
    this.status = status ?? null
    this.reason = reason || message
  }
}

/**
 * Payment-class intents are impossible on this chain: the configured stablecoin has no EIP-3009
 * `receiveWithAuthorization` (networks.js `stablecoin.domainVersion === null`, e.g. Mordor/ETC USC).
 * Thrown BEFORE any wallet signature is requested (FR-020 pre-sign check) — the caller self-submits.
 */
export class PaymentUnsupportedOnChain extends RelayError {
  constructor(message, { chainId, cause } = {}) {
    super(message, { code: 'payment_unsupported_on_chain', cause })
    this.name = 'PaymentUnsupportedOnChain'
    this.chainId = chainId ?? null
  }
}
