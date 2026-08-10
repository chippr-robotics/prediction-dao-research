/**
 * Activity capability profiles (spec 064) — the single source of truth for WHICH
 * selectable assets each activity may offer, so an asset an activity can never act
 * on is filtered OUT of that activity's list rather than failing silently at submit
 * time (honest-state, Constitution III; FR-008).
 *
 * Pure, synchronous, framework-free: no React, no chain libs. Fully unit-testable.
 *
 *   pay / request / transfer → all kinds, including non-EVM Bitcoin (btc-native).
 *   wager                    → EVM ERC-20 ONLY. The head-to-head escrow pulls the
 *                              stake via ERC-20 `transferFrom`, so the native coin
 *                              (not a transferable token) and Bitcoin (non-EVM) are
 *                              excluded; the on-chain stake-token allowlist
 *                              (`NotAllowedToken`) is the backstop for a held ERC-20
 *                              the registry doesn't accept.
 */

export const ASSET_ACTIVITIES = Object.freeze({
  PAY: 'pay',
  REQUEST: 'request',
  WAGER: 'wager',
  TRANSFER: 'transfer',
})

// Every asset kind a SelectableAsset can carry.
const ALL_KINDS = ['native', 'erc20', 'btc-native']

// Which kinds each activity may offer. Unknown activities default to "all kinds"
// (a new consumer is never silently emptied) — add an explicit entry to restrict.
const ACTIVITY_ALLOWED_KINDS = {
  [ASSET_ACTIVITIES.PAY]: ALL_KINDS,
  [ASSET_ACTIVITIES.REQUEST]: ALL_KINDS,
  [ASSET_ACTIVITIES.TRANSFER]: ALL_KINDS,
  [ASSET_ACTIVITIES.WAGER]: ['erc20'],
}

/** The asset kinds `activity` may offer (defaults to all kinds for unknown ids). */
export function allowedKindsForActivity(activity) {
  return ACTIVITY_ALLOWED_KINDS[activity] || ALL_KINDS
}

/**
 * Remove options the activity can't act on (e.g. Bitcoin/native out of `wager`).
 * Exclusion is by list construction, never a submit-time error (FR-008).
 */
export function filterAssetsForActivity(activity, options = []) {
  const allowed = new Set(allowedKindsForActivity(activity))
  return (options || []).filter((o) => allowed.has(o?.kind))
}

/**
 * The activity's default selection key, given its (already-filtered) options.
 *
 * Precedence: the connected network's stablecoin → the connected network's native
 * coin → the first available option. `wager` has no native option, so it falls to
 * the connected stablecoin then the first ERC-20 — keeping USDC the unchanged
 * default (FR-011, FR-013).
 */
export function defaultAssetKey(activity, options = [], { connectedChainId = null, stableAddress = null } = {}) {
  const list = options || []
  if (list.length === 0) return null

  const stable =
    stableAddress &&
    list.find(
      (o) =>
        Number(o.chainId) === Number(connectedChainId) &&
        o.address &&
        o.address.toLowerCase() === stableAddress.toLowerCase(),
    )
  if (stable) return stable.key

  const native = list.find((o) => Number(o.chainId) === Number(connectedChainId) && o.kind === 'native')
  if (native) return native.key

  return list[0].key
}
