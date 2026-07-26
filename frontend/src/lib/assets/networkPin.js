/**
 * Network pinning for two-asset surfaces (spec 067, research R11b).
 *
 * ONE mechanism — pin the network on the first selection, filter the second list —
 * with TWO predicates that are exact inverses. They live in one module on purpose so
 * the inversion is visible at the point of use:
 *
 *   samePair(o, pin)   → o.chainId === pin.pinnedChainId
 *       PAIR contexts: a Uniswap LP pair, an in-app swap. A pair lives on ONE
 *       network, so the counterpart list is restricted to the pinned chain (FR-062).
 *
 *   bridgeDest(o, pin) → o.symbol === pin.pinnedSymbol && o.chainId !== pin.pinnedChainId
 *       The BRIDGE destination selector. The whole point of a bridge is that the
 *       destination is a DIFFERENT network, holding the SAME asset (FR-063).
 *
 * **Applying `samePair` to the bridge silently reduces it to a same-chain transfer.**
 * There is no loud failure: the destination would be on the source chain, the gateway
 * would still return a quote, and the member would still sign. Nothing throws and
 * nothing looks wrong — which is exactly why the two rules are kept side by side
 * instead of each being re-derived inline at its own call site.
 *
 * Pure, synchronous, framework-free: no React, no chain libs. Fully unit-testable.
 *
 * Option shape is spec 064's `SelectableAsset` (`useSelectableAssets`) unchanged —
 * `{ key, chainId, kind, address, symbol, name, networkName, balance }`. `chainId` is
 * a NUMBER for EVM networks and a STRING for Bitcoin (spec 061), which is already the
 * discriminator needed to keep non-EVM assets out of both contexts (FR-066): they are
 * excluded WITH a stated reason (`ineligibleReason`) so the selector can disable them
 * visibly rather than dropping them without explanation. A caller that hands us a
 * numeric string chain id therefore gets non-EVM treatment — pass chain ids through
 * `Number()` the way `useSelectableAssets` does.
 *
 * Two things the predicates deliberately do NOT do, because they are exactly the
 * one-line rules the spec states:
 *   - `samePair` does not exclude the pinned asset itself (a caller that wants to
 *     forbid a USDC/USDC pair compares `option.key` to `pin.pinnedKey`);
 *   - `bridgeDest` matches the symbol EXACTLY, so a bridged variant (`USDC.e`) is not
 *     a destination for `USDC` — they are different assets and quoting them as one
 *     would be dishonest.
 */

/** Which rule a pin was created for. Carried on the pin so a caller can look it up. */
export const PIN_MODE = Object.freeze({
  /** Pairs — swap, liquidity: the counterpart must be on the pinned network. */
  SAME_NETWORK: 'same-network',
  /** Bridge — the destination must be the same asset on a DIFFERENT network. */
  OTHER_NETWORK_SAME_ASSET: 'other-network-same-asset',
})

/** EVM options carry a numeric chain id; Bitcoin (spec 061) carries a string one. */
export function isEvmOption(option) {
  return typeof option?.chainId === 'number' && Number.isFinite(option.chainId)
}

/** Why a non-EVM option can't take part in a pair or a bridge; null when it can. */
export function nonEvmReason(option) {
  if (isEvmOption(option)) return null
  const where = option?.networkName || 'a non-EVM network'
  return `${option?.symbol || 'This asset'} is on ${where}, which isn't an EVM network — pairs and bridges are EVM-only.`
}

/** A usable pin needs an EVM chain id; `pinnedSymbol` is only read by `bridgeDest`. */
function isUsablePin(pin) {
  return typeof pin?.pinnedChainId === 'number' && Number.isFinite(pin.pinnedChainId)
}

/**
 * PAIR predicate — the counterpart is on the pinned network (FR-062).
 * Never use this for the bridge destination (see the module header).
 */
export function samePair(option, pin) {
  if (!isUsablePin(pin) || !isEvmOption(option)) return false
  return option.chainId === pin.pinnedChainId
}

/**
 * BRIDGE predicate — the destination is the SAME asset on a DIFFERENT network
 * (FR-063). The exact inverse of `samePair` on the chain-id term.
 */
export function bridgeDest(option, pin) {
  if (!isUsablePin(pin) || !isEvmOption(option)) return false
  if (!pin.pinnedSymbol) return false
  return option.symbol === pin.pinnedSymbol && option.chainId !== pin.pinnedChainId
}

/** The predicate a pin's own mode implies. Unknown/absent mode ⇒ nothing qualifies. */
export function predicateForMode(mode) {
  if (mode === PIN_MODE.SAME_NETWORK) return samePair
  if (mode === PIN_MODE.OTHER_NETWORK_SAME_ASSET) return bridgeDest
  return () => false
}

/**
 * Create a pin from the FIRST selected asset (a pair's first leg, or the bridge
 * source). Returns null when the option can't pin anything — nothing selected, or a
 * non-EVM asset (`nonEvmReason` states why) — so a caller never assembles a pair or a
 * bridge route around an asset that can't be in one.
 *
 * `pinnedNetworkName` and `pinnedKey` are display/identity extras: no predicate reads
 * them. `pinnedNetworkName` exists because FR-062 requires the pinned network to be
 * VISIBLE, not merely enforced.
 */
export function createPin(option, mode) {
  if (!isEvmOption(option)) return null
  if (mode !== PIN_MODE.SAME_NETWORK && mode !== PIN_MODE.OTHER_NETWORK_SAME_ASSET) return null
  return {
    pinnedChainId: option.chainId,
    pinnedSymbol: option.symbol ?? null,
    mode,
    pinnedNetworkName: option.networkName ?? null,
    pinnedKey: option.key ?? null,
  }
}

/** The options eligible as the second selection under `pin` (defaults to its mode). */
export function filterByPin(options = [], pin, predicate = predicateForMode(pin?.mode)) {
  return (options || []).filter((o) => predicate(o, pin))
}

/**
 * Re-check the SECOND selection after the pin moved (the member changed the first
 * asset). Returns the selection when it still satisfies the predicate, otherwise
 * null — the caller clears it (FR-062) rather than leaving an impossible pair or a
 * same-chain "bridge" assembled from a stale choice. A missing pin clears it too:
 * without a first asset there is nothing for a counterpart to be valid against.
 */
export function revalidateSelection(selection, pin, predicate = predicateForMode(pin?.mode)) {
  if (!selection) return null
  return predicate(selection, pin) ? selection : null
}

/**
 * Why `option` is not eligible under `pin`, for the selector's disabled-with-reason
 * treatment (FR-066) and the empty-counterpart message (FR-065). Returns null when
 * the option IS eligible.
 */
export function ineligibleReason(option, pin, predicate = predicateForMode(pin?.mode)) {
  if (!option) return 'No asset selected.'
  if (predicate(option, pin)) return null
  const nonEvm = nonEvmReason(option)
  if (nonEvm) return nonEvm
  if (!isUsablePin(pin)) return 'Choose the first asset to pin a network.'
  const where = option.networkName || `chain ${option.chainId}`
  // Identify the context by the predicate actually in use, falling back to the pin's
  // own mode for a caller-supplied wrapper around one of them.
  const isBridge =
    predicate === bridgeDest ||
    (predicate !== samePair && pin.mode === PIN_MODE.OTHER_NETWORK_SAME_ASSET)
  if (isBridge) {
    if (option.symbol !== pin.pinnedSymbol) {
      return `A bridge moves one asset, not two — the destination must also be ${pin.pinnedSymbol}.`
    }
    return `${pin.pinnedSymbol} on ${where} is the source — a bridge has to end on a different network.`
  }
  const pinnedWhere = pin.pinnedNetworkName || `chain ${pin.pinnedChainId}`
  return `${option.symbol || 'This asset'} is on ${where} — a pair lives on one network, and ${pinnedWhere} is pinned.`
}
