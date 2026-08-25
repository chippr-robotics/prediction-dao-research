/**
 * x402 payment verification — the ordered checks that must ALL pass before anything is settled
 * (spec 096).
 *
 * Contract: specs/096-x402-agentic-payments/contracts/x402-gateway.md.
 *
 * VERIFICATION STRICTLY PRECEDES SETTLEMENT, and that ordering is the whole safety property of
 * this rail. A payment that fails any check here is never submitted, so a refused request costs
 * the payer nothing; and because the request is served only AFTER the engine accepts the
 * settlement, there is no path where money moves and no answer comes back, nor one where an answer
 * is served for a payment that was never submitted.
 *
 * THE ORDER IS CHEAPEST-AND-MOST-CERTAIN FIRST, exactly like memberApi/auth.js:
 *   1. parse                     — pure, on bytes the caller supplied.
 *   2. scheme / network / asset / payTo match the offer   — pure comparison against OUR offer.
 *   3. value >= amount           — pure arithmetic.
 *   4. validity window           — pure arithmetic against the settle buffer.
 *   5. signature recovers to `from` — local cryptography, no network.
 *   6. sanctions screen `from`   — a chain read, FAIL-CLOSED, reusing policy/sanctions.js unchanged.
 *   7. nonce dedup               — an in-process fact (see the Phase-1 note on the store).
 *   8. payer balance             — a chain read, and the last thing before money moves.
 *
 * Steps 1-5 and 7 answer 402 with a distinct code, because each leads to different client
 * behaviour. Step 6 answers with the house 403/503 the shared screen already throws: a sanctioned
 * account is not being asked to pay more, it is being refused, and a screening outage is UNKNOWN
 * rather than a refusal.
 *
 * ERC-1271 IS NOT SUPPORTED HERE, deliberately and documented. EIP-3009 is verified by the TOKEN
 * contract, and the USDC implementations this platform uses recover an ECDSA signature — a
 * contract account's 1271 endorsement would pass this gateway and then revert at the token, which
 * is the worst of both (we would have accepted a payment the chain will refuse). x402 v1 on this
 * gateway is therefore EOA-signer only, and `payment_signature_invalid` says so.
 */
import { ethers } from 'ethers'
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from '@fairwins/intent-types'
import { X402_ERROR_CODES, X402_VERSION, caip2 } from './requirements.js'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/

/** Longest X-PAYMENT header we will even attempt to decode. A payload is a few hundred bytes. */
const MAX_HEADER_BYTES = 8192

const ERC20_IFACE = new ethers.Interface(['function balanceOf(address account) view returns (uint256)'])

/**
 * A refusal that belongs in the 402 body. Carries the machine code; the paywall turns it into the
 * full PaymentRequired offer so the client sees what it could pay as well as why this failed.
 */
export class PaymentInvalidError extends Error {
  constructor(code, reason) {
    super(reason ?? X402_ERROR_CODES[code] ?? code)
    this.name = 'PaymentInvalidError'
    this.code = code
    this.reason = this.message
  }
}

const refuse = (code, reason) => new PaymentInvalidError(code, reason)

/**
 * In-process nonce set.
 *
 * PHASE 1, AND HONEST ABOUT IT — the same posture as spec-095 revocation (`durable: false`). The
 * REAL uniqueness guarantee for an EIP-3009 authorization is the TOKEN's own on-chain
 * authorization state: a replayed nonce reverts at the token, so a restart of this gateway cannot
 * turn a replay into a double spend. What this set buys is that a replay is refused here for free
 * instead of being submitted and burning gas to revert. It is bounded because an unbounded Set
 * keyed by caller-supplied bytes is a memory-growth surface.
 */
export function createNonceStore({ max = 50_000 } = {}) {
  const seen = new Set()
  return {
    /** @returns {boolean} true if this nonce is new (and it is now recorded) */
    claim(nonce) {
      const key = String(nonce).toLowerCase()
      if (seen.has(key)) return false
      // Oldest-first eviction: a Set preserves insertion order, so the first key is the oldest.
      if (seen.size >= max) seen.delete(seen.values().next().value)
      seen.add(key)
      return true
    },
    /** Release a claim — used when a LATER check fails, so a refused payment can be retried fixed. */
    release(nonce) {
      seen.delete(String(nonce).toLowerCase())
    },
    get size() {
      return seen.size
    },
  }
}

/**
 * Decode + structurally validate the `X-PAYMENT` header. Never touches the network.
 *
 * Everything here is a statement about BYTES THE CALLER SUPPLIED, so every failure is
 * `payment_malformed` (or the version code) — none of it says anything about whether a payment
 * would have been accepted.
 *
 * @param {string} raw the header value
 * @returns {{accepted: object, payload: {signature: string, authorization: object}}}
 */
export function decodePaymentHeader(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') throw refuse('payment_malformed', 'the X-PAYMENT header is empty')
  const trimmed = raw.trim()
  if (Buffer.byteLength(trimmed, 'utf8') > MAX_HEADER_BYTES) {
    throw refuse('payment_malformed', 'the X-PAYMENT header is implausibly large')
  }
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'))
  } catch {
    throw refuse('payment_malformed', 'the X-PAYMENT header is not base64-encoded JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw refuse('payment_malformed', 'the decoded X-PAYMENT header must be a JSON object')
  }
  if (parsed.x402Version !== X402_VERSION) {
    throw refuse('payment_version_unsupported', `this gateway speaks x402 version ${X402_VERSION}`)
  }
  const accepted = parsed.accepted
  if (!accepted || typeof accepted !== 'object' || Array.isArray(accepted)) {
    throw refuse('payment_malformed', 'payload.accepted must be the requirement you chose from accepts[]')
  }
  const payload = parsed.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw refuse('payment_malformed', 'payload.payload must carry { signature, authorization }')
  }
  if (!SIGNATURE_RE.test(payload.signature ?? '')) {
    throw refuse('payment_malformed', 'payload.signature must be a 0x-prefixed 65-byte hex signature')
  }
  const a = payload.authorization
  if (!a || typeof a !== 'object' || Array.isArray(a)) {
    throw refuse('payment_malformed', 'payload.authorization is required')
  }
  if (!ADDRESS_RE.test(a.from ?? '')) throw refuse('payment_malformed', 'authorization.from must be an address')
  if (!ADDRESS_RE.test(a.to ?? '')) throw refuse('payment_malformed', 'authorization.to must be an address')
  if (!BYTES32_RE.test(a.nonce ?? '')) throw refuse('payment_malformed', 'authorization.nonce must be 32 bytes of hex')
  const value = asUint(a.value, 'authorization.value')
  const validAfter = asUint(a.validAfter, 'authorization.validAfter')
  const validBefore = asUint(a.validBefore, 'authorization.validBefore')
  return {
    accepted,
    payload: {
      signature: payload.signature,
      authorization: { from: a.from, to: a.to, value, validAfter, validBefore, nonce: a.nonce },
    },
  }
}

/** Wire uint -> BigInt. JSON cannot hold a uint256, so decimal strings are the normal case. */
function asUint(v, name) {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0) throw refuse('payment_malformed', `${name} must be a non-negative integer`)
    return BigInt(v)
  }
  if (typeof v === 'string' && /^[0-9]+$/.test(v)) return BigInt(v)
  throw refuse('payment_malformed', `${name} must be a non-negative integer (decimal string)`)
}

/** Case-insensitive address/string comparison, tolerating a missing value. */
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()

/**
 * Verify a decoded payment against the offer this gateway made. Steps 2-5 and 7-8; the sanctions
 * screen (step 6) is passed in and throws its own house errors.
 *
 * @param {{
 *   requirement: object,                 // the accepts[] entry this gateway offers
 *   accepted: object,                    // the requirement the client says it chose
 *   authorization: object,               // decoded, BigInt-valued
 *   signature: string,
 *   chainCfg: object,                    // config.chains[x402.chainId]
 *   tokenDomain: {name: string, version: string},
 *   nowSec: number,
 *   settleBufferSec: number,
 *   nonces: ReturnType<typeof createNonceStore>,
 *   screen: {screen: (chainId: number, account: string) => Promise<void>},
 *   provider: {call: Function}|null,
 *   onBalanceUnreadable: (reason: string) => never,   // house 503, injected so this stays pure-ish
 * }} args
 * @returns {Promise<{payer: string}>}
 */
export async function verifyPayment({
  requirement,
  accepted,
  authorization,
  signature,
  chainCfg,
  tokenDomain,
  nowSec,
  settleBufferSec,
  nonces,
  screen,
  provider,
  onBalanceUnreadable,
}) {
  // ---- 2. the payload must name the offer we actually made -------------------------------------
  // Compared against OUR requirement, never against the client's echo of it: a client that edits
  // `accepted` cannot talk this gateway into a cheaper offer, because the numbers below all come
  // from `requirement`.
  if (accepted.scheme != null && !same(accepted.scheme, requirement.scheme)) {
    throw refuse('payment_scheme_unsupported', `this gateway offers scheme "${requirement.scheme}"`)
  }
  if (accepted.network != null && !same(accepted.network, requirement.network)) {
    throw refuse('payment_network_mismatch', `this gateway settles on ${requirement.network}`)
  }
  if (accepted.asset != null && !same(accepted.asset, requirement.asset)) {
    throw refuse('payment_asset_mismatch', `this gateway settles in ${requirement.asset}`)
  }
  if (!same(authorization.to, requirement.payTo)) {
    throw refuse('payment_recipient_mismatch', 'authorization.to must be the payTo address from the offer')
  }

  // ---- 3. value ---------------------------------------------------------------------------------
  const amount = BigInt(requirement.amount)
  if (authorization.value < amount) {
    throw refuse('payment_insufficient', `this operation costs ${amount} base units of ${requirement.asset}`)
  }

  // ---- 4. validity window -----------------------------------------------------------------------
  // The buffer is the point: an authorization that is still valid RIGHT NOW but expires before the
  // engine can get it mined would be accepted here and refused by the token. Refusing it now costs
  // the payer nothing; submitting it costs gas and serves nothing.
  if (authorization.validAfter > BigInt(nowSec)) {
    throw refuse('payment_not_yet_valid', 'authorization.validAfter is in the future')
  }
  if (authorization.validBefore < BigInt(nowSec + settleBufferSec)) {
    throw refuse(
      'payment_expired',
      `authorization.validBefore must leave at least ${settleBufferSec}s for settlement`
    )
  }

  // ---- 5. signature ----------------------------------------------------------------------------
  const domain = {
    name: tokenDomain.name,
    version: tokenDomain.version,
    chainId: chainCfg.chainId,
    verifyingContract: chainCfg.paymentToken,
  }
  const message = {
    from: authorization.from,
    to: authorization.to,
    value: authorization.value,
    validAfter: authorization.validAfter,
    validBefore: authorization.validBefore,
    nonce: authorization.nonce,
  }
  let recovered = null
  try {
    recovered = ethers.verifyTypedData(domain, TRANSFER_WITH_AUTHORIZATION_TYPES, message, signature)
  } catch {
    recovered = null
  }
  if (!recovered || !same(recovered, authorization.from)) {
    throw refuse(
      'payment_signature_invalid',
      'the signature does not recover to authorization.from under the token’s EIP-712 domain. ' +
        'This gateway verifies EOA (ECDSA) signatures only — a smart-account signature would pass here and ' +
        'revert at the token, so it is refused up front.'
    )
  }
  const payer = ethers.getAddress(authorization.from)

  // ---- 6. sanctions, fail-closed (the shared screen, unchanged) --------------------------------
  // Throws 403 sanctioned_signer / 503 screening_unavailable itself. A sanctioned payer is REFUSED,
  // not re-quoted: there is no amount that makes this request servable.
  await screen.screen(chainCfg.chainId, payer)

  // ---- 7. nonce dedup (in-process; see the store's Phase-1 note) --------------------------------
  if (!nonces.claim(authorization.nonce)) {
    throw refuse('payment_replayed', 'this authorization nonce was already presented to this gateway')
  }

  // ---- 8. balance -------------------------------------------------------------------------------
  // The LAST thing before money moves, and the only check whose failure is not the payer's fault in
  // a way they can fix by re-signing. An UNREADABLE balance is not a pass: we cannot know, so we
  // settle nothing and serve nothing (fail-closed), and the payer is charged nothing.
  let balance
  try {
    const data = ERC20_IFACE.encodeFunctionData('balanceOf', [payer])
    const ret = await provider.call({ to: chainCfg.paymentToken, data })
    ;[balance] = ERC20_IFACE.decodeFunctionResult('balanceOf', ret)
  } catch {
    nonces.release(authorization.nonce)
    onBalanceUnreadable(
      'the payer’s token balance could not be read, so this payment was NOT settled; nothing was charged — try again'
    )
  }
  // Check the balance against what the payer SIGNED, not against what we quoted.
  //
  // Step 3 only requires `authorization.value >= amount`, and settle.js transfers
  // `authorization.value` — not `amount`. Checking `amount` here therefore passed an agent who
  // signed a huge value while holding only the price: verification succeeded, the engine broadcast,
  // the answer was served, and the token then reverted for insufficient balance. Free answer, and
  // FairWins paid gas for a reverting transaction. Repeatable at the per-account quota with fresh
  // nonces, so it was a paywall bypass, not an edge case.
  if (BigInt(balance) < authorization.value) {
    nonces.release(authorization.nonce)
    throw refuse(
      'payment_insufficient_balance',
      `the payer holds less than the authorized ${authorization.value} base units of ${requirement.asset}`
    )
  }

  // `amount` is what the offer QUOTED; `value` is what the token will actually move. They differ
  // whenever an agent authorizes more than the price, so the receipt must report `value` — see
  // paywall.js, which puts it in the audit line, X-PAYMENT-RESPONSE and the settlement object.
  return { payer, amount, value: authorization.value, network: caip2(chainCfg.chainId) }
}
