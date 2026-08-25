/**
 * The paywall seam — the ONE place the member API's routes touch x402 (spec 096).
 *
 * Contract: specs/096-x402-agentic-payments/contracts/x402-gateway.md.
 *
 * WHAT IT IS. `routes.js` calls `settleOrChallenge` only when a request reaches a PRICED operation
 * WITHOUT a usable member token. It returns `{ payer, settlement }` once a payment has verified and
 * been submitted, or throws — `PaymentRequiredError` for a 402 offer, a house `GatewayError` for
 * anything that is not the payer's to fix.
 *
 * MEMBERS ARE NEVER CHARGED. This module is never reached on a request whose bearer token
 * authenticates: `routes.js` tries the token FIRST and only falls through on a token-invalidity or
 * no-membership verdict (never on a 503, never on a sanctions refusal, never on insufficient
 * scope). A member with a working key sees byte-identical behaviour to a gateway with x402 switched
 * off, because on that path not one line of this file runs.
 *
 * VERIFY, THEN SETTLE, THEN SERVE — in that order, with nothing in between. Every check lives in
 * `verify.js` and all of them precede `settle.js`, so:
 *   · a refused payment settles nothing and costs the payer nothing;
 *   · an engine that cannot take the settlement produces 503 `settlement_unavailable` and serves
 *     nothing — never a free answer, and never a charge without one;
 *   · the answer is served only after the engine ACCEPTS the submission, and `X-PAYMENT-RESPONSE`
 *     says `settlement: 'broadcast'` because acceptance is not finality.
 *
 * NOTHING IN THE AUDIT EVENT COULD REPLAY A PAYMENT. The signature and the authorization nonce are
 * never logged — not as a field name the audit logger would strip, but by never being passed. What
 * is logged is what an operator needs and the chain already publishes: the op, the payer, the
 * amount, the network and the transaction.
 */
import { GatewayError } from '../errors.js'
import {
  PaymentRequiredError,
  buildPaymentRequired,
  buildRequirement,
  encodeSettlementResponse,
} from './requirements.js'
import { PaymentInvalidError, createNonceStore, decodePaymentHeader, verifyPayment } from './verify.js'
import { settlePayment } from './settle.js'

/** The request header an agent retries with. */
export const PAYMENT_HEADER = 'x-payment'
/** The response header carrying the settlement receipt. */
export const PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE'

/**
 * @param {object} config full gateway config (reads .x402 and .chains)
 * @param {{
 *   providers: Record<number, {call: Function}>,
 *   screen: {screen: Function},
 *   engineClient: {submitTransaction: Function},
 *   quotas: {hit: Function},          // keyed by the SETTLED payer — an identified account
 *   publicQuotas: {hit: Function},    // the unauthenticated window, for the 402 challenge path
 *   killSwitch: {isActive: () => boolean},
 *   audit?: (fields: object) => void,
 *   now?: () => number,          // unix SECONDS, matching the gateway-wide clock
 *   nonces?: ReturnType<typeof createNonceStore>,
 * }} deps
 */
export function createPaywall(config, { providers, screen, engineClient, quotas, publicQuotas, killSwitch, audit = () => {}, now = () => Math.floor(Date.now() / 1000), nonces } = {}) {
  const x402 = config.x402
  const nonceStore = nonces ?? createNonceStore({ max: x402.nonceMaxEntries })

  // The challenge path draws on the UNAUTHENTICATED window (see settleOrChallenge). A missing
  // instance would surface as a TypeError inside a request handler and be laundered into a generic
  // error — and, worse, would leave the challenge unmetered. Fail the boot instead.
  if (!publicQuotas || typeof publicQuotas.hit !== 'function') {
    throw new Error('[relay-gateway] the x402 paywall requires a `publicQuotas` instance for its challenge path')
  }

  /** Liveness of the paid rail: config on, module not killed, gateway not killed. */
  function live() {
    return Boolean(x402.enabled) && !x402.killSwitch && !killSwitch.isActive()
  }

  /**
   * Is this op class actually offered right now?
   *
   * A price of 0 means NOT OFFERED — not free. Answering 402 with a zero-amount offer would ask an
   * agent to sign a payment that settles nothing, and answering 200 would give away a priced
   * operation; so a class at 0 simply never reaches this module and the route 401s exactly as it
   * does today.
   */
  function offers(opClass) {
    if (!opClass || !live()) return false
    return Boolean(buildRequirement(config, { opClass }))
  }

  /** The URL an agent asked for, for the 402 body's `resource`. */
  const resourceUrlOf = (req) => {
    const host = req.get('host')
    return host ? `${req.protocol}://${host}${req.originalUrl}` : req.originalUrl
  }

  /**
   * Either serve a 402 offer, or verify + settle a presented payment.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {{opClass: string, routeId: string, description: string, error?: string, reason?: string}} ctx
   *   `error`/`reason` carry WHY the bearer path did not admit this request (e.g. `token_expired`),
   *   so the 402 body keeps that diagnostic instead of replacing it with a generic "pay me".
   * @returns {Promise<{payer: string, settlement: object}>}
   */
  async function settleOrChallenge(req, res, { opClass, routeId, description, error, reason }) {
    const requirement = buildRequirement(config, { opClass })
    const chainCfg = config.chains[x402.chainId]
    const challenge = (code, why) =>
      new PaymentRequiredError(
        buildPaymentRequired(config, {
          opClass,
          resourceUrl: resourceUrlOf(req),
          description,
          error: code,
          reason: why,
        })
      )

    const presented = req.get(PAYMENT_HEADER)
    if (!presented) {
      // No payment yet. Rate-limit the CHALLENGE by caller IP — the only key available before a
      // signature exists — against the UNAUTHENTICATED window, never the members'. `req.ip` is the
      // proxy on the VM deployment (`trust proxy` is unset), so every anonymous caller shares one
      // key; drawing that from the same instance members use would let a flood of unpaid challenges
      // spend the whole module's global counter and 429 every authenticated request. Same fix, same
      // reason, as the member API's own public routes.
      const q = publicQuotas.hit(`ip:${req.ip ?? 'unknown'}`)
      if (!q.allowed) {
        throw new GatewayError(429, 'quota_exceeded', `${q.scope} member API quota exceeded`, { retryAfterSec: q.retryAfterSec })
      }
      throw challenge(error ?? 'payment_required', reason)
    }

    // ---- verify (all of it) before settling anything --------------------------------------------
    let decoded
    let verified
    try {
      decoded = decodePaymentHeader(presented)
      verified = await verifyPayment({
        requirement,
        accepted: decoded.accepted,
        authorization: decoded.payload.authorization,
        signature: decoded.payload.signature,
        chainCfg,
        tokenDomain: chainCfg.tokenDomain,
        nowSec: now(),
        settleBufferSec: x402.settleBufferSeconds,
        nonces: nonceStore,
        screen,
        provider: providers?.[x402.chainId] ?? null,
        onBalanceUnreadable: (why) => {
          throw new GatewayError(503, 'settlement_unavailable', why)
        },
      })
    } catch (err) {
      if (err instanceof PaymentInvalidError) {
        // A refused payment: NOTHING was submitted, so the payer is out nothing. Answer with the
        // offer again, carrying the specific code so the agent can fix exactly one thing.
        audit({ action: 'x402_payment_refused', op: routeId, opClass, code: err.code, outcome: 'refused' })
        throw challenge(err.code, err.reason)
      }
      throw err
    }

    // The payer is now known and screened, so the quota keys on THEM rather than on an IP.
    const q = quotas.hit(verified.payer)
    if (!q.allowed) {
      // Refused BEFORE settlement, so a rate-limited agent is never charged for the request it did
      // not get. The nonce claim is released so the same authorization can be retried later.
      nonceStore.release(decoded.payload.authorization.nonce)
      throw new GatewayError(429, 'quota_exceeded', `${q.scope} member API quota exceeded`, { retryAfterSec: q.retryAfterSec })
    }

    // ---- settle ----------------------------------------------------------------------------------
    let receipt
    try {
      receipt = await settlePayment({
        engineClient,
        chainCfg,
        authorization: decoded.payload.authorization,
        signature: decoded.payload.signature,
      })
    } catch (err) {
      // The engine refused or was unreachable. Release the nonce claim: this authorization was
      // never submitted, so it must stay usable on a retry.
      nonceStore.release(decoded.payload.authorization.nonce)
      audit({ action: 'x402_settlement_failed', op: routeId, opClass, payer: verified.payer, outcome: 'unavailable' })
      throw err
    }

    // NEVER the signature, NEVER the nonce. Those two bytes are the whole payment instrument; the
    // rest is what the chain publishes anyway.
    audit({
      action: 'x402_payment_settled',
      op: routeId,
      opClass,
      payer: verified.payer,
      amount: String(verified.value), // what the token actually moved, not the quoted price
      asset: requirement.asset,
      network: verified.network,
      chainId: x402.chainId,
      txHash: receipt.transaction,
      transactionId: receipt.transactionId,
      outcome: 'settled',
    })

    res.set(
      PAYMENT_RESPONSE_HEADER,
      encodeSettlementResponse({
        transaction: receipt.transaction,
        transactionId: receipt.transactionId,
        chainId: x402.chainId,
        payer: verified.payer,
        amount: verified.value,
      })
    )

    return {
      payer: verified.payer,
      settlement: { ...receipt, network: verified.network, amount: String(verified.value), asset: requirement.asset },
    }
  }

  return { live, offers, settleOrChallenge, priceFor: (opClass) => x402.prices[opClass] ?? 0 }
}

/**
 * /status contribution: PUBLIC CONFIG ONLY.
 *
 * The prices and the network are already in every 402 body, so publishing them here tells nobody
 * anything new. The treasury's BALANCE is deliberately absent — an operational surface that
 * reports how much money is sitting at an address is a targeting aid, and no operator decision
 * needs it here.
 *
 * `enabled` is honest liveness, the same rule as `memberApiStatus`: it answers "would a paid
 * request be served right now?", so either killswitch (or the member API being off) makes it false.
 */
export function x402Status(config, { killSwitch }) {
  const x402 = config.x402
  const enabled =
    Boolean(x402.enabled) &&
    !x402.killSwitch &&
    Boolean(config.memberApi.enabled) &&
    !config.memberApi.killSwitch &&
    !killSwitch.isActive()
  // A class at 0 is NOT OFFERED, which is a different fact from "costs nothing" — so it is null
  // here, never "0".
  const priced = Object.fromEntries(
    Object.entries(x402.prices).map(([cls, amount]) => [cls, amount > 0 ? String(amount) : null])
  )
  return {
    enabled,
    killSwitch: Boolean(x402.killSwitch),
    network: x402.enabled ? `eip155:${x402.chainId}` : null,
    priced,
  }
}
