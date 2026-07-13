/**
 * Wager tag resolution against the on-chain WagerTagRegistry (spec 054). Forward (`%tag` → address) and
 * reverse (address → `%tag`) reads via direct contract views — no subgraph, so a value-bearing action never
 * routes through stale data (research R7).
 *
 * SOFT-FAIL BY DESIGN: every function returns a null-ish result rather than throwing when the tag is invalid,
 * the registry is undeployed on this chain, or the RPC errors. Callers fall back to raw-address entry / the
 * existing display chain — no surface ever hard-blocks on tag resolution (FR-013). Only status ACTIVE is safe
 * for a value-bearing action; the caller enforces that.
 */
import { Contract } from 'ethers'
import { getContractAddressForChain } from '../../config/contracts'
import { WAGER_TAG_REGISTRY_ABI, TagStatus } from '../../abis/wagerTagRegistry'
import { normalizeTag } from './normalizeTag'

export { TagStatus }

function getRegistry(provider, chainId, registryAddress) {
  const address = registryAddress || getContractAddressForChain('wagerTagRegistry', chainId)
  if (!address || !provider) return null
  return new Contract(address, WAGER_TAG_REGISTRY_ABI, provider)
}

function toInfo(raw, tag) {
  return {
    tag,
    address: raw.owner,
    status: Number(raw.status),
    verified: raw.verified,
    pendingOwner: raw.pendingOwner,
    repointEffectiveAt: Number(raw.repointEffectiveAt),
    quarantinedUntil: Number(raw.quarantinedUntil),
  }
}

/**
 * Forward-resolve a tag to its owner + status.
 * @returns {Promise<{tag,address,status,verified,pendingOwner,repointEffectiveAt,quarantinedUntil}|null>}
 *          null when the input is not a valid tag, the registry is unavailable, or the read errors.
 */
export async function resolveTag(input, { provider, chainId, registryAddress } = {}) {
  let canonical
  try {
    canonical = normalizeTag(input)
  } catch {
    return null // not a tag — caller treats input as a raw address
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
 * Reverse-resolve an address to its tag (only when the tag's forward resolution is ACTIVE).
 * @returns {Promise<{tag: string, verified: boolean}|null>} null when the address has no active tag.
 */
export async function lookupTagOf(address, { provider, chainId, registryAddress } = {}) {
  const registry = getRegistry(provider, chainId, registryAddress)
  if (!registry || !address) return null
  try {
    const tag = await registry.tagOf(address)
    if (!tag) return null
    // tagOf already returns "" unless ACTIVE; fetch verification for display.
    let verified = false
    try {
      const info = await registry.resolve(tag)
      verified = Boolean(info.verified) && Number(info.status) === TagStatus.ACTIVE
    } catch {
      /* verification is best-effort */
    }
    return { tag, verified }
  } catch {
    return null
  }
}

/** True only when a resolution result is safe to use for a value-bearing action (FR-011/022). */
export function isResolvableForValue(info) {
  return Boolean(info) && info.status === TagStatus.ACTIVE && info.address && info.address !== '0x0000000000000000000000000000000000000000'
}

/** Human-readable reason a non-ACTIVE status can't be used (honest state, constitution III). */
export function statusMessage(status) {
  switch (status) {
    case TagStatus.NONE:
      return 'No such tag'
    case TagStatus.REPOINTING:
      return 'This tag’s address is changing — try again after the security delay'
    case TagStatus.QUARANTINED:
      return 'This tag is no longer active'
    case TagStatus.SUSPENDED:
      return 'This tag is suspended'
    case TagStatus.LAPSED_RECLAIMABLE:
      return 'This tag’s membership has lapsed'
    default:
      return ''
  }
}
