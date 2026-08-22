/**
 * Membership reader for the member API (spec 095).
 *
 * THREE STATES, AND ONLY ONE OF THEM CARRIES A VALUE. A read resolves `read`, `not-configured` (this
 * deployment records no membership contract on the reference chain — the question cannot be asked
 * here at all) or `unreadable` (it was asked and failed), and `tier` / `active` / `expiresAt` exist
 * only on `read`. There is deliberately no code path in this file that turns a failed eth_call into
 * tier 0: an unreadable membership is not an absent membership, and `?? 0` here would lock a paying
 * member out of their own data on an RPC hiccup (the estate rule, and spec 071's version verbatim).
 *
 * ONE CHAIN, NAMED. Membership lives on exactly one chain per environment cohort, so this reads the
 * gateway's configured reference chain and reports which one it read. Reading "whichever chain the
 * caller mentioned" would let a testnet answer stand in for a mainnet fact.
 *
 * Cached briefly per account: an API key is used by a script, and a script polls. The cache bounds
 * the RPC fan-out a busy key can cause; it caches SUCCESS ONLY, because caching a failure would
 * turn one unreachable moment into a minute of them.
 */
import { ethers } from 'ethers'

/** `IMembershipManager.Membership` — tier + expiry in one call, so the two can never disagree. */
const MEMBERSHIP_IFACE = new ethers.Interface([
  'function getMembership(address user, bytes32 role) view returns (tuple(uint8 tier, uint64 expiresAt, uint32 monthCount, uint32 activeCount, uint64 monthAnchor))',
])

/** The paid-membership role every member-API grant is checked against. */
export const WAGER_PARTICIPANT_ROLE = ethers.id('WAGER_PARTICIPANT_ROLE')

/** Its member-facing name, echoed so a caller never has to reverse a keccak hash to know what was read. */
export const ROLE_NAME = 'WAGER_PARTICIPANT'

/** Tier index -> name. Index 0 is None and has no name — it is the absence of a tier, not a tier. */
export const TIER_NAMES = Object.freeze({ 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' })

/**
 * @param {object} config full gateway config (reads .memberApi.referenceChainId and .chains)
 * @param {Record<number, {call: Function}>} providers
 * @param {{now?: () => number, ttlMs?: number}} [opts] now returns MILLISECONDS
 */
export function createMembershipReader(config, providers, { now = () => Date.now(), ttlMs } = {}) {
  const chainId = config.memberApi.referenceChainId
  const chainCfg = config.chains[chainId] ?? null
  const provider = providers?.[chainId] ?? null
  const address = chainCfg?.targetsByKey?.membershipManager ?? null
  const cacheTtlMs = ttlMs ?? config.memberApi.membershipCacheTtlMs

  /** @type {Map<string, {value: object, fetchedAt: number}>} lowercase account -> successful read */
  const cache = new Map()

  return {
    chainId,
    /** Whether a read is even attemptable here (config-time fact, not a member fact). */
    configured: Boolean(provider && address),

    /**
     * @param {string} account
     * @returns {Promise<{state: 'read', chainId: number, role: string, tier: number, tierName: string|null, active: boolean, expiresAt: number}
     *                  | {state: 'not-configured'|'unreadable', chainId: number, role: string, reason: string}>}
     */
    async read(account) {
      const key = String(account).toLowerCase()
      const hit = cache.get(key)
      if (hit && now() - hit.fetchedAt < cacheTtlMs) return hit.value

      if (!provider || !address) {
        // NOT "no membership", and not an outage either: the question cannot be asked on this
        // deployment at all. Three states exist precisely so those two are distinguishable.
        return {
          state: 'not-configured',
          chainId,
          role: ROLE_NAME,
          reason: 'this gateway records no membership contract on its reference chain',
        }
      }

      let tier
      let expiresAt
      try {
        const data = MEMBERSHIP_IFACE.encodeFunctionData('getMembership', [account, WAGER_PARTICIPANT_ROLE])
        const ret = await provider.call({ to: address, data })
        const [m] = MEMBERSHIP_IFACE.decodeFunctionResult('getMembership', ret)
        tier = Number(m.tier)
        expiresAt = Number(m.expiresAt)
      } catch {
        // An unreachable or undecodable read is UNKNOWN. Never tier 0.
        return { state: 'unreadable', chainId, role: ROLE_NAME, reason: 'the membership contract could not be read; try again' }
      }

      const nowSec = Math.floor(now() / 1000)
      const active = tier > 0 && expiresAt > nowSec
      const value = {
        state: 'read',
        chainId,
        role: ROLE_NAME,
        tier,
        tierName: TIER_NAMES[tier] ?? null,
        active,
        expiresAt,
      }
      // Cache successes only: a cached failure multiplies one bad moment across a whole window.
      cache.set(key, { value, fetchedAt: now() })
      if (cache.size > 10_000) {
        for (const [k, entry] of cache) {
          if (now() - entry.fetchedAt >= cacheTtlMs) cache.delete(k)
        }
      }
      return value
    },
  }
}
