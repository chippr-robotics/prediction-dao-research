/**
 * Liquidity activity source (spec 067 T112 / spec 031, FR-037). Snapshot-diffs the LiquidityRouter's
 * control surface each cycle and announces the protocol events that touch money the member has
 * already supplied: a pool closed to new deposits, a pool delisted, supplying paused.
 *
 * This is the Supply half of spec 067's notifications, and it is deliberately NOT the wager-pool
 * source (`poolsSource`, domain `pools`). Every entry here carries `domain: 'liquidity'` — the two
 * features share the word "pool" and nothing else, and a member must always be able to tell which
 * of the two a notification is about (FR-039/FR-039a).
 *
 * What it reads, and what it refuses to read:
 *
 *   - **Only for members who have supplied.** With no liquidity entries in the client ledger there
 *     is nothing to be affected, so the cycle costs zero RPC. The first cycle after a member's
 *     first supply establishes the baseline and emits nothing (first sight = baseline).
 *   - **An unreadable router is a failure, not an empty list.** `readLiquidityRouterConfig` returns
 *     null when the router is present but unreadable; this returns `ok: false` so the engine keeps
 *     the prior slice — the baseline survives, and the next successful read diffs against the truth
 *     rather than against "nothing was listed" (FR-051/FR-054).
 *   - **An undeployed router is not a failure.** A network with no liquidity router simply has no
 *     events, which is honest and silent.
 *
 * All event derivation lives in `lib/liquidity/liquidityRouter.js` — this file only supplies the
 * member's context (which pools they hold, what to call them) and publishes the result.
 */
import { NETWORKS } from '../../../config/networks'
import { makeReadProvider } from '../../../utils/rpcProvider'
import { isEvmChainId } from '../../../lib/bridge/bridgeRouter'
import {
  detectLiquidityProtocolEvents,
  getLiquidityRouterAddress,
  readLiquidityRouterConfig,
  snapshotLiquidityProtocolState,
} from '../../../lib/liquidity/liquidityRouter'
import { listLiquidityEntries } from '../../ledger/sources/liquidityLedgerSource'

const EMPTY = { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }

/** The single snapshot key: this source tracks one control surface per network, not one per pool. */
const SNAPSHOT_KEY = 'protocol'

/** Deep link to the Supply area (`/wallet?tab=earn&view=supply`). */
const SUPPLY_LINK = Object.freeze({ to: '/wallet?tab=earn&view=supply' })

/**
 * What the member's own history calls each pool they have supplied: `USDC/WETH` for a pair,
 * `USDC` for a single-asset bridge pool. Built from the ledger rather than from token metadata so
 * it always matches the wording on their own entries — and falls back to a neutral phrase rather
 * than inventing a name.
 */
function poolLabelsFrom(entries) {
  const labels = {}
  for (const e of entries) {
    if (!e?.poolId || labels[e.poolId]) continue
    const a = e.tokenSymbol
    const b = e.token1Symbol
    if (a && b) labels[e.poolId] = `Your ${a}/${b} pool`
    else if (a) labels[e.poolId] = `Your ${a} pool`
  }
  return labels
}

export const liquiditySource = {
  key: 'liquidity',
  label: 'Liquidity',
  async detect({ account, chainId, nowMs, prior }) {
    if (!account || !isEvmChainId(chainId)) return EMPTY

    // Only members with supplied capital have anything that can be affected.
    const ledgerEntries = listLiquidityEntries(account, chainId)
    const heldPoolIds = [...new Set(ledgerEntries.map((e) => e?.poolId).filter(Boolean))]
    if (heldPoolIds.length === 0) return EMPTY

    // No router on this network → no curated pools, no events. Not a failure.
    if (!getLiquidityRouterAddress(chainId)) return EMPTY

    let provider
    try {
      provider = makeReadProvider(NETWORKS[chainId].rpcUrl, chainId)
    } catch {
      return { ok: false }
    }

    let config
    try {
      config = await readLiquidityRouterConfig({ chainId, provider })
    } catch {
      return { ok: false }
    }
    const next = snapshotLiquidityProtocolState(config)
    // Present but unreadable: retain the prior slice rather than recording "nothing is listed".
    if (!next) return { ok: false }

    const priorSnapshot = prior?.snapshots?.[SNAPSHOT_KEY] || null
    const labels = poolLabelsFrom(ledgerEntries)
    const events = detectLiquidityProtocolEvents({
      prior: priorSnapshot,
      next,
      heldPoolIds,
      labelFor: (poolId) => labels[poolId],
      networkName: NETWORKS[chainId]?.name,
    })

    const entries = events.map((event) => ({
      // Keyed by what happened, not by when it was noticed, so a duplicate observation dedups.
      id: `liquidity:${chainId}:${event.reason}:${event.poolId || 'network'}`,
      domain: 'liquidity',
      refId: event.poolId || `liquidity:${chainId}`,
      type: event.type,
      message: event.message,
      severity: event.severity,
      actionable: event.actionable === true,
      link: SUPPLY_LINK,
      createdAt: nowMs,
      read: false,
    }))

    return {
      ok: true,
      entries,
      nextSnapshots: { [SNAPSHOT_KEY]: { ...next, snappedAt: nowMs } },
      currentIds: [SNAPSHOT_KEY],
      // Deliberately empty. The action-needed badge is recomputed live every cycle, so it may only
      // carry conditions that CLEAR — and "your pool was delisted" never clears. The delisting
      // entry is marked actionable in the feed, where it can be read once and dismissed, instead of
      // pinning a badge the member can never put out.
      actionNeededById: {},
    }
  },
}

export default liquiditySource
