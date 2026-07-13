/**
 * Callsign resolution against the on-chain CallsignRegistry (spec 054). Forward (`%callsign` → address) and
 * reverse (address → `%callsign`) reads via direct contract views — no subgraph, so a value-bearing action never
 * routes through stale data (research R7).
 *
 * SOFT-FAIL BY DESIGN: every function returns a null-ish result rather than throwing when the callsign is invalid,
 * the registry is undeployed on this chain, or the RPC errors. Callers fall back to raw-address entry / the
 * existing display chain — no surface ever hard-blocks on callsign resolution (FR-013). Only status ACTIVE is safe
 * for a value-bearing action; the caller enforces that.
 */
import { Contract } from 'ethers'
import { getContractAddressForChain } from '../../config/contracts'
import { CALLSIGN_REGISTRY_ABI, CallsignStatus } from '../../abis/callsignRegistry'
import { normalizeCallsign } from './normalizeCallsign'

export { CallsignStatus }

function getRegistry(provider, chainId, registryAddress) {
  const address = registryAddress || getContractAddressForChain('callsignRegistry', chainId)
  if (!address || !provider) return null
  return new Contract(address, CALLSIGN_REGISTRY_ABI, provider)
}

function toInfo(raw, callsign) {
  return {
    callsign,
    address: raw.owner,
    status: Number(raw.status),
    verified: raw.verified,
    pendingOwner: raw.pendingOwner,
    repointEffectiveAt: Number(raw.repointEffectiveAt),
    quarantinedUntil: Number(raw.quarantinedUntil),
  }
}

/**
 * Forward-resolve a callsign to its owner + status.
 * @returns {Promise<{callsign,address,status,verified,pendingOwner,repointEffectiveAt,quarantinedUntil}|null>}
 *          null when the input is not a valid callsign, the registry is unavailable, or the read errors.
 */
export async function resolveCallsign(input, { provider, chainId, registryAddress } = {}) {
  let canonical
  try {
    canonical = normalizeCallsign(input)
  } catch {
    return null // not a callsign — caller treats input as a raw address
  }
  const registry = getRegistry(provider, chainId, registryAddress)
  if (!registry) return null
  try {
    const raw = await registry.resolve(canonical)
    return toInfo(raw, canonical)
  } catch {
    return null // soft-fail (FR-013)
  }
}

/**
 * Reverse-resolve an address to its callsign (only when the callsign's forward resolution is ACTIVE).
 * @returns {Promise<{callsign: string, verified: boolean}|null>} null when the address has no active callsign.
 */
export async function lookupCallsignOf(address, { provider, chainId, registryAddress } = {}) {
  const registry = getRegistry(provider, chainId, registryAddress)
  if (!registry || !address) return null
  try {
    const callsign = await registry.callsignOf(address)
    if (!callsign) return null
    // callsignOf already returns "" unless ACTIVE; fetch verification for display.
    let verified = false
    try {
      const info = await registry.resolve(callsign)
      verified = Boolean(info.verified) && Number(info.status) === CallsignStatus.ACTIVE
    } catch {
      /* verification is best-effort */
    }
    return { callsign, verified }
  } catch {
    return null
  }
}

/** True only when a resolution result is safe to use for a value-bearing action (FR-011/022). */
export function isResolvableForValue(info) {
  return Boolean(info) && info.status === CallsignStatus.ACTIVE && info.address && info.address !== '0x0000000000000000000000000000000000000000'
}

/** Human-readable reason a non-ACTIVE status can't be used (honest state, constitution III). */
export function statusMessage(status) {
  switch (status) {
    case CallsignStatus.NONE:
      return 'No such callsign'
    case CallsignStatus.REPOINTING:
      return 'This callsign’s address is changing — try again after the security delay'
    case CallsignStatus.QUARANTINED:
      return 'This callsign is no longer active'
    case CallsignStatus.SUSPENDED:
      return 'This callsign is suspended'
    case CallsignStatus.LAPSED_RECLAIMABLE:
      return 'This callsign’s membership has lapsed'
    default:
      return ''
  }
}
