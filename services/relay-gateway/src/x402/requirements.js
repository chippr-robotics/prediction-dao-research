/**
 * x402 payment requirements — the 402 body this gateway offers, and the vocabulary of reasons it
 * can answer with (spec 096).
 *
 * Contract: specs/096-x402-agentic-payments/contracts/x402-gateway.md.
 *
 * WHAT THIS FILE IS FOR
 * An agent that holds no FairWins membership and no member key still has a way to call a priced
 * member-API operation: the gateway answers HTTP 402 with a machine-readable description of what
 * it would accept, the agent signs an EIP-3009 `TransferWithAuthorization` on the chain's USDC to
 * the platform treasury, and retries with an `X-PAYMENT` header. This module builds the offer.
 *
 * THE OFFER IS DERIVED, NEVER RESTATED. The asset address and the token's EIP-712 domain
 * (name/version) come from `config.chains[chainId]` — `paymentToken` and `tokenDomain`, the SAME
 * two values the spec-035 intent pipeline recovers EIP-3009 signatures against. A second table
 * here would be a second answer to "which token, under which domain", and a correct type table
 * under a wrong domain produces a signature that verifies nowhere (issue #1038, the exact failure
 * this rule exists to prevent).
 *
 * WHY `error` IS A CODE. x402 v2 gives the 402 body a single `error` string. This gateway puts a
 * MACHINE CODE there and the sentence in `errorReason`, so a client branches on the code and shows
 * the prose — the same split as the house `{ error: { code, reason } }` body, which this is not
 * (a 402 is the protocol's body, not ours).
 */

/** x402 protocol version this gateway speaks. Verified against coinbase/x402 v2 (research R1). */
export const X402_VERSION = 2

/** The op classes a request can belong to. A route's class decides which price applies. */
export const OP_CLASSES = Object.freeze(['read', 'build', 'assistant'])

/**
 * Every reason a presented payment can be refused, as the `error` code of the 402 body.
 *
 * These are NOT house error codes: they travel inside the x402 PaymentRequired body, which is the
 * protocol's shape rather than the gateway's. Each one is a distinct, actionable fact — "your
 * signature did not recover to `from`" and "this nonce was already used here" lead to completely
 * different client behaviour, and collapsing them into one `payment_invalid` would leave an agent
 * retrying the thing that cannot work.
 */
export const X402_ERROR_CODES = Object.freeze({
  payment_required: 'No payment was presented for a priced operation. Sign one of `accepts` and retry with X-PAYMENT.',
  payment_malformed: 'The X-PAYMENT header is not base64-encoded JSON of the expected shape.',
  payment_version_unsupported: 'The payload names an x402 version this gateway does not speak.',
  payment_scheme_unsupported: 'The chosen scheme is not one this gateway offers.',
  payment_network_mismatch: 'The payload names a different network than the offer.',
  payment_asset_mismatch: 'The payload names a different asset than the offer.',
  payment_recipient_mismatch: 'The authorization pays someone other than the offer’s payTo.',
  payment_insufficient: 'The authorized value is below the offer’s amount.',
  payment_not_yet_valid: 'The authorization’s validAfter is in the future.',
  payment_expired: 'The authorization expires too soon to be settled — see maxTimeoutSeconds.',
  payment_signature_invalid: 'The signature does not recover to authorization.from. EOA signers only here.',
  payment_replayed: 'This authorization nonce was already presented to this gateway process.',
  payment_insufficient_balance: 'The payer’s token balance is below the authorized value.',
})

/**
 * Codes this module can return in the HOUSE error body (`{ error: { code, reason } }`), with the
 * status each carries. Kept here rather than in memberApi/contract.js so that a gateway with x402
 * switched off serves a byte-identical OpenAPI document — `openapi.js` merges these in only when
 * the module is enabled.
 */
export const X402_GATEWAY_ERROR_CODES = Object.freeze({
  settlement_unavailable: {
    status: 503,
    summary:
      'The payment verified but could not be settled — the submission engine was unreachable, or a ' +
      'pre-settlement read failed. NOTHING was charged and NOTHING was served. Retry.',
  },
})

/** `eip155:<chainId>` — CAIP-2, the network identifier x402 v2 uses. */
export const caip2 = (chainId) => `eip155:${chainId}`

/**
 * Thrown to answer 402. Carries the protocol body verbatim rather than a house error, because the
 * 402 IS the offer: a client that gets `{ error: { code } }` here learns it was refused but not
 * what it could pay.
 */
export class PaymentRequiredError extends Error {
  /** @param {object} body the full x402 PaymentRequired body */
  constructor(body) {
    super(body?.error ?? 'payment_required')
    this.name = 'PaymentRequiredError'
    this.status = 402
    this.body = body
  }
}

/**
 * The single `accepts[]` entry this gateway offers for an op class.
 *
 * @param {object} config full gateway config (reads .x402 and .chains)
 * @param {{opClass: string}} args
 * @returns {object|null} null when the class is not priced on this deployment
 */
export function buildRequirement(config, { opClass }) {
  const x402 = config.x402
  const price = x402.prices[opClass]
  // Zero is NOT a free operation — it means this class is NOT OFFERED over the paid rail at all.
  // A zero-amount `accepts` entry would advertise a payment that settles nothing.
  if (!price || price <= 0) return null
  const chainCfg = config.chains[x402.chainId]
  if (!chainCfg?.paymentToken || !chainCfg?.tokenDomain) return null
  return {
    scheme: 'exact',
    network: caip2(x402.chainId),
    amount: String(price),
    asset: chainCfg.paymentToken,
    payTo: x402.payTo,
    maxTimeoutSeconds: x402.maxTimeoutSeconds,
    extra: {
      assetTransferMethod: 'eip3009',
      // The token's OWN EIP-712 domain, from the same config the intent pipeline recovers
      // EIP-3009 signatures against. Never a second table.
      name: chainCfg.tokenDomain.name,
      version: chainCfg.tokenDomain.version,
    },
  }
}

/**
 * The full 402 body.
 *
 * @param {object} config
 * @param {{opClass: string, resourceUrl: string, description: string, error?: string, reason?: string}} args
 */
export function buildPaymentRequired(config, { opClass, resourceUrl, description, error = 'payment_required', reason }) {
  const requirement = buildRequirement(config, { opClass })
  return {
    x402Version: X402_VERSION,
    error,
    errorReason: reason ?? X402_ERROR_CODES[error] ?? 'This request needs a payment.',
    resource: { url: resourceUrl, description, mimeType: 'application/json' },
    // Always an array, even at one entry: a client iterating `accepts` must not need a special case
    // the day this gateway offers a second chain.
    accepts: requirement ? [requirement] : [],
  }
}

/**
 * The `X-PAYMENT-RESPONSE` header value: base64(JSON SettlementResponse).
 *
 * `settlement: 'broadcast'` is stated out loud. The engine ACCEPTING a submission is not the chain
 * having mined it — the same posture the intent rail has always had — and a client that reads
 * `success: true` as finality would be reading something this gateway never claimed.
 */
export function encodeSettlementResponse({ transaction, transactionId, chainId, payer, amount }) {
  const body = {
    success: true,
    transaction,
    transactionId,
    network: caip2(chainId),
    payer,
    amount: String(amount),
    settlement: 'broadcast',
  }
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64')
}
