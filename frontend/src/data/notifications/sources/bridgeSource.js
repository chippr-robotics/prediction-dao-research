/**
 * Bridge activity source (spec 067 T111 / spec 031, FR-037). Two jobs, in this order:
 *
 * 1. **Reconcile.** A bridge finishes on somebody else's schedule, usually while the member is
 *    somewhere else in the app — or not in it at all. So this source runs the same
 *    `reconcileBridges` the Bridge surface runs, which is what makes a transfer resolve (and be
 *    announced) without the Bridge tab being open. Only non-terminal transfers are touched, so a
 *    member with nothing in flight costs nothing.
 * 2. **Drain.** Every APPLIED transition — whichever poller observed it — leaves one record in
 *    `lib/bridge/bridgeActivityBuffer`. This turns those records into feed entries.
 *
 * Doing both in that order is what keeps the count honest: `reconcileBridge` emits exactly once
 * per applied transition (the ledger refuses to re-apply a state it already holds), so an outcome
 * observed by the Bridge surface and an outcome observed here produce one notification, not two.
 *
 * Nothing is derived here. The reconciler owns the state machine and the message; this source only
 * moves finished records into the store — so there is no second place where a bridge could be
 * declared delivered.
 *
 * Snapshot-diff is deliberately NOT used: bridge truth is evidence-gated (a destination fill hash),
 * not a balance comparison, and a balance that moved for some other reason must never be read as a
 * delivery. `nextSnapshots` is therefore always empty and there is no baseline to establish.
 */
import { drainBridgeNotifications } from '../../../lib/bridge/bridgeActivityBuffer'
import { listLiveBridges, reconcileBridges } from '../../../lib/bridge/bridgeStatus'
import { isEvmChainId } from '../../../lib/bridge/bridgeRouter'
import { BRIDGE_STATE } from '../../ledger/sources/bridgeLedgerSource'

const EMPTY = { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }

/** Deep link to the Bridge surface (`/wallet?tab=paytransfer&view=bridge`). */
const BRIDGE_LINK = Object.freeze({ to: '/wallet?tab=paytransfer&view=bridge' })

export const bridgeSource = {
  key: 'bridge',
  label: 'Bridge',
  async detect({ account, chainId, nowMs }) {
    if (!account || !isEvmChainId(chainId)) return EMPTY

    // 1) Move any live transfer forward. Never throws (reconcileBridges swallows per-transfer
    //    failures), and an unreadable gateway/chain simply leaves the transfer where it was — the
    //    engine keeps polling, so nothing is stranded and nothing is invented.
    if (listLiveBridges(account, chainId).length > 0) {
      await reconcileBridges(account, chainId, { now: nowMs })
    }

    // 2) Action-needed, recomputed from the ledger every cycle (never persisted): a transfer past
    //    its expected arrival is the one bridge situation that asks the member to look. It clears
    //    itself the moment the transfer delivers or is returned.
    const actionNeededById = {}
    const live = listLiveBridges(account, chainId)
    for (const b of live) {
      if (b.state === BRIDGE_STATE.NEEDS_ATTENTION) actionNeededById[String(b.bridgeId || b.entryId)] = 'checkBridge'
    }

    // 3) Publish what actually happened.
    const entries = []
    for (const record of drainBridgeNotifications(account, chainId)) {
      const refId = String(record.refId)
      entries.push({
        // Keyed by the transition, not by the poll: the same outcome always has the same id, so
        // the engine's append-dedup is exact even if a record is somehow queued twice.
        id: `bridge:${chainId}:${record.state}:${refId}`,
        domain: 'bridge',
        refId,
        type: record.type,
        message: record.message,
        severity: record.severity || 'info',
        actionable: record.actionable === true,
        link: BRIDGE_LINK,
        txUrl: record.txUrl || null,
        createdAt: record.at || nowMs,
        read: false,
      })
    }

    const currentIds = [...new Set([...live.map((b) => String(b.bridgeId || b.entryId)), ...entries.map((e) => e.refId)])]
    return { ...EMPTY, entries, currentIds, actionNeededById }
  },
}

export default bridgeSource
