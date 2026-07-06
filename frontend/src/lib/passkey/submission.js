/**
 * Submission routing for passkey accounts (spec 041, T020) — the decision
 * table from contracts/submission-and-fees.md:
 *
 *   1. 035-covered action + relayer healthy  → relayed intent (no user gas)
 *   2. account-native op                     → UserOp via ordered bundler list
 *   3. 035-covered action + relayer down     → UserOp fallback, honest notice
 *   4. both paths down                       → SubmissionUnavailable (+retryAfter)
 *
 * Honest lifecycle (FR-017, constitution III): draft → ceremony-signed →
 * submitted(route) → included(txHash) | failed(reason) | stalled(guidance).
 * Never spins, never silently retries with different effect, never reports
 * `included` before on-chain inclusion.
 *
 * Reuses the merged relay stack (probeHealth / relayIntent / pollStatus from
 * frontend/src/lib/relay/intentClient.js and the RelayError taxonomy) — the
 * passkey layer adds routing, not a parallel client.
 */

import { probeHealth } from '../relay/intentClient'
import { RelayerUnavailable } from '../relay/errors'

export class SubmissionUnavailable extends Error {
  constructor({ retryAfterSec = 30, causes = [] } = {}) {
    super('No submission path is currently available. Your funds are safe; retry shortly.')
    this.name = 'SubmissionUnavailable'
    this.retryAfterSec = retryAfterSec
    this.causes = causes
  }
}

export class InsufficientFeeBalance extends Error {
  constructor({ shortfall, denomination }) {
    super(`Balance is short ${shortfall} ${denomination} to cover this action's network fee.`)
    this.name = 'InsufficientFeeBalance'
    this.shortfall = shortfall
    this.denomination = denomination
  }
}

export const LIFECYCLE = Object.freeze({
  DRAFT: 'draft',
  SIGNED: 'ceremony-signed',
  SUBMITTED: 'submitted',
  INCLUDED: 'included',
  FAILED: 'failed',
  STALLED: 'stalled',
})

/**
 * Decide the route for one action. Pure given its probes — trivially testable.
 *
 * @param {object} opts
 *   intentCapable  boolean — the action has an 035 intent type AND the account
 *                  can sign it (ERC-1271 rails, research §11)
 *   accountNative  boolean — operates ON the account itself (deploy/controllers/upgrade)
 *   probeRelayer   () => Promise<{healthy: boolean}>
 *   probeBundler   () => Promise<{healthy: boolean}>
 * @returns {Promise<'intent'|'userop'>} — throws SubmissionUnavailable when neither works
 */
export async function chooseRoute({ intentCapable, accountNative, probeRelayer, probeBundler }) {
  const causes = []

  if (!accountNative && intentCapable) {
    try {
      const { healthy } = await probeRelayer()
      if (healthy) return 'intent'
      causes.push('relayer unhealthy')
    } catch (e) {
      causes.push(`relayer: ${e.message}`)
    }
  }

  try {
    const { healthy } = await probeBundler()
    if (healthy) return 'userop'
    causes.push('bundler unhealthy')
  } catch (e) {
    causes.push(`bundler: ${e.message}`)
  }

  throw new SubmissionUnavailable({ causes })
}

/** Default relayer probe: bounded-time health check via the relay client. */
export function defaultRelayerProbe(chainId) {
  return async () => {
    try {
      const h = await probeHealth(chainId)
      return { healthy: Boolean(h?.chains?.[chainId]?.ok ?? h?.ok) }
    } catch (e) {
      if (e instanceof RelayerUnavailable) return { healthy: false }
      throw e
    }
  }
}

/** Default bundler probe: eth_supportedEntryPoints against the first healthy URL. */
export function defaultBundlerProbe(bundlerUrls, { timeoutMs = 4000, fetchFn = globalThis.fetch } = {}) {
  return async () => {
    for (const url of bundlerUrls || []) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const res = await fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_supportedEntryPoints', params: [] }),
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (res.ok) {
          const body = await res.json()
          if (Array.isArray(body?.result) && body.result.length > 0) return { healthy: true, url }
        }
      } catch {
        // try the next configured endpoint (FR-013: replaceable via configuration)
      }
    }
    return { healthy: false }
  }
}

/**
 * Track a submission to an honest terminal state (FR-017).
 * `checkIncluded` polls the true source (relayer status API or
 * eth_getUserOperationReceipt); after `stallAfterMs` without inclusion the
 * state becomes STALLED with truthful route status — the caller surfaces
 * retry/fallback guidance, never a fake "confirmed".
 */
export async function trackToInclusion({ checkIncluded, onState, stallAfterMs = 90_000, pollMs = 3_000, sleep }) {
  const start = Date.now()
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  for (;;) {
    let status
    try {
      status = await checkIncluded()
    } catch (e) {
      status = { state: 'pending', error: e.message }
    }
    if (status.state === 'included') {
      onState?.({ state: LIFECYCLE.INCLUDED, txHash: status.txHash })
      return { state: LIFECYCLE.INCLUDED, txHash: status.txHash }
    }
    if (status.state === 'failed') {
      onState?.({ state: LIFECYCLE.FAILED, reason: status.reason })
      return { state: LIFECYCLE.FAILED, reason: status.reason }
    }
    if (Date.now() - start >= stallAfterMs) {
      const out = { state: LIFECYCLE.STALLED, lastKnown: status }
      onState?.(out)
      return out
    }
    onState?.({ state: LIFECYCLE.SUBMITTED, lastKnown: status })
    await wait(pollMs)
  }
}

/**
 * Pre-flight fee check (FR-014 / edge case "insufficient balance"): compares
 * the quoted total (action amount + fee, in the fee denomination) against the
 * balance and throws InsufficientFeeBalance with the exact shortfall.
 */
export function assertFeeBalance({ balance, required, denomination }) {
  if (balance >= required) return
  throw new InsufficientFeeBalance({ shortfall: (required - balance).toString(), denomination })
}
