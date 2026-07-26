/**
 * Spec 067 (T111/T112/T118, FR-037/FR-038/FR-039) — the bridge and liquidity notification emitters.
 *
 * Three things are under test, and the third is the one that motivates the file:
 *
 *   1. **T111** — a bridge announces `delivered`, `refunded` and `needs attention`, each saying what
 *      happened and what (if anything) is needed. `delivered` is unreachable without confirmed
 *      DESTINATION-side evidence, at every layer that could produce it.
 *   2. **T112** — a pool closing to new deposits, and a protocol event that moves the ground under a
 *      position, are announced; a partial read of the curated list is never reported as a delisting.
 *   3. **T118** — the two categories are independently controllable, a newly added category defaults
 *      to DELIVERED rather than silently off (FR-038), and no bridge or liquidity notification is
 *      ever attributed to the WAGER-pool category (FR-039). The two features share the word "pool"
 *      and nothing else; a member must always be able to tell which one is talking to them.
 *
 * `src/test/notifications/domainVocabulary.test.js` covers the vocabulary itself (T058/T108-T110);
 * this file covers what the emitters actually produce.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  BRIDGE_NOTIFIED_STATES,
  bridgeNotification,
  reconcileBridge,
} from '../../lib/bridge/bridgeStatus'
import {
  drainBridgeNotifications,
  peekBridgeNotifications,
  queueBridgeNotification,
} from '../../lib/bridge/bridgeActivityBuffer'
import {
  BRIDGE_STATE,
  captureBridgeSubmission,
  listBridgeEntries,
} from '../../data/ledger/sources/bridgeLedgerSource'
import { __clearClientLedger } from '../../data/ledger/ledgerClientStore'
import {
  LIQUIDITY_EVENT,
  LIQUIDITY_EVENT_REASON,
  detectLiquidityProtocolEvents,
  snapshotLiquidityProtocolState,
} from '../../lib/liquidity/liquidityRouter'
import { bridgeSource } from '../../data/notifications/sources/bridgeSource'
import { activitySources } from '../../data/notifications/sources'
import { domainLabel } from '../../data/notifications/domains'
import {
  DEFAULT_MODE,
  NOTIFICATION_CATEGORIES,
  getDeliveryMode,
  getNotificationPrefs,
  resolveDelivery,
  setDeliveryMode,
} from '../../lib/notifications/deliveryPreferences'

const ACCOUNT = '0xAbc0000000000000000000000000000000000067'
const ORIGIN = 137
const DESTINATION = 1
const DEPOSIT_ID = '424242'
const SRC_TX = '0x' + 'a1'.repeat(32)
const DST_TX = '0x' + 'b2'.repeat(32)
const REFUND_TX = '0x' + 'c3'.repeat(32)
const NOW = 1_700_000_000_000

/** A `readBridgeEntry`-shaped view, as the reconciler hands one to the emitter. */
function bridgeEntry(overrides = {}) {
  return {
    entryId: 'cl:bridge-1',
    bridgeId: 'cl:bridge-1',
    depositId: DEPOSIT_ID,
    originChainId: ORIGIN,
    destinationChainId: DESTINATION,
    state: BRIDGE_STATE.IN_FLIGHT,
    srcTxHash: SRC_TX,
    dstTxHash: null,
    refundTxHash: null,
    amountRaw: '250000000',
    outputAmountRaw: '249500000',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
    expectedBy: NOW - 1,
    settlementProtocol: 'Across',
    timestamp: NOW - 60_000,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  __clearClientLedger()
  vi.restoreAllMocks()
})

/* ============================================================================================== */
describe('T111 — bridge notifications (FR-037)', () => {
  it('announces only the three outcomes a member is owed, never the progress states', () => {
    expect([...BRIDGE_NOTIFIED_STATES].sort()).toEqual(
      [BRIDGE_STATE.DELIVERED, BRIDGE_STATE.NEEDS_ATTENTION, BRIDGE_STATE.REFUNDED].sort(),
    )
    for (const state of [BRIDGE_STATE.SUBMITTED, BRIDGE_STATE.SOURCE_CONFIRMED, BRIDGE_STATE.IN_FLIGHT]) {
      expect(bridgeNotification(bridgeEntry(), { to: state })).toBeNull()
    }
    // `failed` is observed by the member at signing time; it is not one of FR-037's three.
    expect(bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.FAILED })).toBeNull()
  })

  it('says the transfer arrived, where, and that nothing is needed', () => {
    const note = bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.DELIVERED, dstTxHash: DST_TX })
    expect(note.type).toBe('bridge-delivered')
    expect(note.severity).toBe('success')
    expect(note.actionable).toBe(false)
    expect(note.message).toMatch(/arrived/i)
    expect(note.message).toMatch(/Ethereum/i) // the destination network, named
    expect(note.message).toMatch(/Nothing to do/i)
    // The amount quoted is what ARRIVED (the output), not the larger amount that was sent.
    expect(note.message).toContain('249.5 USDC')
    expect(note.message).not.toContain('250 USDC')
    // Evidence is linked on the destination network, where the fill happened.
    expect(note.txHash).toBe(DST_TX)
    expect(note.txUrl).toContain(DST_TX)
  })

  it('NEVER announces delivery without destination-side evidence (FR-009)', () => {
    expect(bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.DELIVERED })).toBeNull()
    expect(bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.DELIVERED, dstTxHash: null })).toBeNull()
    // …and the same refusal for the other money claim.
    expect(bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.REFUNDED })).toBeNull()
  })

  it('omits the amount rather than quoting the sent amount when the output was never recorded', () => {
    const note = bridgeNotification(bridgeEntry({ outputAmountRaw: null }), {
      to: BRIDGE_STATE.DELIVERED,
      dstTxHash: DST_TX,
    })
    expect(note.message).toMatch(/arrived/i)
    expect(note.message).not.toMatch(/USDC/)
    expect(note.message).not.toMatch(/\d/)
  })

  it('says a refund came back to the wallet it left, on the network it left from', () => {
    const note = bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.REFUNDED, refundTxHash: REFUND_TX })
    expect(note.type).toBe('bridge-refunded')
    expect(note.actionable).toBe(false)
    expect(note.message).toMatch(/could not be delivered/i)
    expect(note.message).toMatch(/returned the asset to your wallet on Polygon/i)
    expect(note.message).toMatch(/Nothing to do/i)
    expect(note.txUrl).toContain(REFUND_TX)
  })

  it('says a late transfer is late, is not lost, and what to check — without claiming an outcome', () => {
    const note = bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.NEEDS_ATTENTION })
    expect(note.type).toBe('bridge-needs-attention')
    expect(note.severity).toBe('warning')
    expect(note.actionable).toBe(true)
    expect(note.message).toMatch(/taking longer/i)
    expect(note.message).toMatch(/not lost/i)
    expect(note.message).toMatch(/open Bridge/i)
    // A timing statement must not read as a settlement. It may explain what happens to transfers
    // that cannot be delivered (recourse), but it may not say this one arrived or came back.
    expect(note.message).not.toMatch(/arrived/i)
    expect(note.message).not.toMatch(/is in your wallet/i)
    expect(note.message).not.toMatch(/(has been|was) returned/i)
    expect(note.txUrl).toContain(SRC_TX) // the sending transaction, the one they can check
  })

  it('emits once per APPLIED transition, and a re-poll of the same state emits nothing', async () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, {
      depositId: DEPOSIT_ID,
      destinationChainId: DESTINATION,
      srcTxHash: SRC_TX,
      amountRaw: '250000000',
      outputAmountRaw: '249500000',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      expectedBy: NOW + 60_000,
    })
    const [entry] = listBridgeEntries(ACCOUNT, ORIGIN)
    const deps = {
      now: NOW,
      // Gateway off; the chain reports a fill.
      fetchStatus: vi.fn(async () => {
        throw new Error('gateway unavailable')
      }),
      readChain: vi.fn(async () => ({ sourceMined: true, depositIndexed: true, dstTxHash: DST_TX })),
    }

    const first = await reconcileBridge(ACCOUNT, entry, deps)
    expect(first.applied).toBe(true)
    expect(first.to).toBe(BRIDGE_STATE.DELIVERED)
    expect(peekBridgeNotifications(ACCOUNT, ORIGIN)).toHaveLength(1)

    // Same observation again: the ledger refuses to re-apply, so nothing is re-announced.
    const [settled] = listBridgeEntries(ACCOUNT, ORIGIN)
    const second = await reconcileBridge(ACCOUNT, settled, deps)
    expect(second.applied).toBe(false)
    expect(peekBridgeNotifications(ACCOUNT, ORIGIN)).toHaveLength(1)
  })

  it('still notifies when the caller supplies its own onTransition hook', async () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, {
      depositId: DEPOSIT_ID,
      destinationChainId: DESTINATION,
      srcTxHash: SRC_TX,
      amountRaw: '250000000',
      expectedBy: NOW + 60_000,
    })
    const [entry] = listBridgeEntries(ACCOUNT, ORIGIN)
    const onTransition = vi.fn()
    await reconcileBridge(ACCOUNT, entry, {
      now: NOW,
      fetchStatus: vi.fn(async () => ({ depositTxHash: SRC_TX, fillTxHash: DST_TX })),
      readChain: vi.fn(async () => ({ sourceMined: true, depositIndexed: true, dstTxHash: DST_TX })),
      onTransition,
    })
    // A UI hook is additive — it can never silence the member-facing notification.
    expect(onTransition).toHaveBeenCalledTimes(1)
    expect(peekBridgeNotifications(ACCOUNT, ORIGIN)).toHaveLength(1)
  })

  it('a notification sink that throws never breaks reconciliation', async () => {
    captureBridgeSubmission(ACCOUNT, ORIGIN, {
      depositId: DEPOSIT_ID,
      destinationChainId: DESTINATION,
      srcTxHash: SRC_TX,
      amountRaw: '250000000',
      expectedBy: NOW + 60_000,
    })
    const [entry] = listBridgeEntries(ACCOUNT, ORIGIN)
    const result = await reconcileBridge(ACCOUNT, entry, {
      now: NOW,
      fetchStatus: vi.fn(async () => ({ depositTxHash: SRC_TX, fillTxHash: DST_TX })),
      readChain: vi.fn(async () => ({ sourceMined: true, depositIndexed: true, dstTxHash: DST_TX })),
      notify: () => {
        throw new Error('storage full')
      },
    })
    expect(result.applied).toBe(true)
    expect(result.to).toBe(BRIDGE_STATE.DELIVERED)
  })

  it('buffers one record per transition and drains it exactly once', () => {
    const note = bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.DELIVERED, dstTxHash: DST_TX })
    queueBridgeNotification(ACCOUNT, ORIGIN, note)
    queueBridgeNotification(ACCOUNT, ORIGIN, note) // a second observer, same transition
    expect(peekBridgeNotifications(ACCOUNT, ORIGIN)).toHaveLength(1)
    expect(drainBridgeNotifications(ACCOUNT, ORIGIN)).toHaveLength(1)
    expect(drainBridgeNotifications(ACCOUNT, ORIGIN)).toHaveLength(0)
  })
})

/* ============================================================================================== */
describe('T112 — liquidity protocol-event notifications (FR-037)', () => {
  const POOL_A = '0xpool-a'
  const POOL_B = '0xpool-b'

  const snapshot = ({ paused = false, complete = true, pools = {} } = {}) =>
    snapshotLiquidityProtocolState({
      paused,
      poolsComplete: complete,
      pools: Object.entries(pools).map(([poolId, enabled]) => ({ poolId, enabled, kind: 2 })),
    })

  const held = ['0xpool-a']
  const labelFor = (id) => (id === POOL_A ? 'Your USDC/WETH pool' : null)

  it('records an unreadable router as no snapshot at all, never as an empty pool list', () => {
    expect(snapshotLiquidityProtocolState(null)).toBeNull()
  })

  it('announces a pool that closed to new deposits, and says the position is untouched', () => {
    const events = detectLiquidityProtocolEvents({
      prior: snapshot({ pools: { [POOL_A]: true, [POOL_B]: true } }),
      next: snapshot({ pools: { [POOL_A]: false, [POOL_B]: true } }),
      heldPoolIds: held,
      labelFor,
    })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe(LIQUIDITY_EVENT.POOL_CLOSED)
    expect(events[0].poolId).toBe(POOL_A)
    expect(events[0].message).toMatch(/closed to new deposits/i)
    expect(events[0].message).toMatch(/withdrawn at any time/i)
    expect(events[0].actionable).toBe(false)
  })

  it('says nothing about a pool the member has not supplied', () => {
    const events = detectLiquidityProtocolEvents({
      prior: snapshot({ pools: { [POOL_A]: true, [POOL_B]: true } }),
      next: snapshot({ pools: { [POOL_A]: true, [POOL_B]: false } }),
      heldPoolIds: held,
      labelFor,
    })
    expect(events).toEqual([])
  })

  it('treats first sight as a baseline — a member returning after a month is told nothing "just happened"', () => {
    expect(
      detectLiquidityProtocolEvents({
        prior: null,
        next: snapshot({ pools: { [POOL_A]: false } }),
        heldPoolIds: held,
        labelFor,
      }),
    ).toEqual([])
  })

  it('announces a delisted pool as a protocol event against the position', () => {
    const events = detectLiquidityProtocolEvents({
      prior: snapshot({ pools: { [POOL_A]: true } }),
      next: snapshot({ pools: {} }),
      heldPoolIds: held,
      labelFor,
    })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe(LIQUIDITY_EVENT.POSITION_AFFECTED)
    expect(events[0].reason).toBe(LIQUIDITY_EVENT_REASON.DELISTED)
    expect(events[0].message).toMatch(/no longer listed/i)
    expect(events[0].message).toMatch(/still yours/i)
    expect(events[0].actionable).toBe(true)
  })

  it('NEVER reports a delisting from an incomplete read of the curated list', () => {
    // A pool missing because one `getPool` call failed has not been proven gone.
    expect(
      detectLiquidityProtocolEvents({
        prior: snapshot({ pools: { [POOL_A]: true } }),
        next: snapshot({ pools: {}, complete: false }),
        heldPoolIds: held,
        labelFor,
      }),
    ).toEqual([])
  })

  it('announces supplying being paused, once, and only to members with capital in', () => {
    const prior = snapshot({ pools: { [POOL_A]: true } })
    const paused = snapshot({ paused: true, pools: { [POOL_A]: true } })

    const events = detectLiquidityProtocolEvents({
      prior,
      next: paused,
      heldPoolIds: held,
      labelFor,
      networkName: 'Polygon',
    })
    expect(events).toHaveLength(1)
    expect(events[0].reason).toBe(LIQUIDITY_EVENT_REASON.SUPPLY_PAUSED)
    expect(events[0].message).toMatch(/paused on Polygon/i)
    expect(events[0].message).toMatch(/still withdraw/i)

    // Already paused on both sides: nothing changed, so nothing is said again.
    expect(detectLiquidityProtocolEvents({ prior: paused, next: paused, heldPoolIds: held, labelFor })).toEqual([])
    // No position, no interruption.
    expect(detectLiquidityProtocolEvents({ prior, next: paused, heldPoolIds: [], labelFor })).toEqual([])
  })

  it('falls back to a neutral phrase rather than inventing a name for an unlabelled pool', () => {
    const [event] = detectLiquidityProtocolEvents({
      prior: snapshot({ pools: { [POOL_B]: true } }),
      next: snapshot({ pools: { [POOL_B]: false } }),
      heldPoolIds: [POOL_B],
      labelFor,
    })
    expect(event.message).toMatch(/^A pool you supplied/)
  })
})

/* ============================================================================================== */
describe('T118 — the two categories are independently controllable (FR-038)', () => {
  it('registers both as their own category, distinct from the wager-pool category', () => {
    const domains = NOTIFICATION_CATEGORIES.map((c) => c.domain)
    expect(domains).toContain('bridge')
    expect(domains).toContain('liquidity')
    expect(domains).toContain('pools')
    expect(new Set(domains).size).toBe(domains.length)
    // Three pool-adjacent categories, three different labels a member can tell apart.
    const labels = ['pools', 'liquidity', 'bridge'].map(
      (d) => NOTIFICATION_CATEGORIES.find((c) => c.domain === d).label,
    )
    expect(new Set(labels).size).toBe(3)
    expect(labels).toContain('Wager Pools')
  })

  it('defaults a newly added category to DELIVERED rather than silently off', () => {
    // Nothing saved for either domain — the resolved mode must still deliver.
    expect(getNotificationPrefs().modes.bridge).toBe(DEFAULT_MODE)
    expect(getNotificationPrefs().modes.liquidity).toBe(DEFAULT_MODE)
    expect(resolveDelivery('bridge')).not.toBe('silent')
    expect(resolveDelivery('liquidity')).not.toBe('silent')
  })

  it('silences each one on its own, leaving the other and wager pools untouched', () => {
    setDeliveryMode('bridge', 'silent')
    expect(resolveDelivery('bridge')).toBe('silent')
    expect(resolveDelivery('liquidity')).toBe(DEFAULT_MODE)
    expect(resolveDelivery('pools')).toBe(DEFAULT_MODE)

    setDeliveryMode('liquidity', 'push')
    expect(getDeliveryMode('liquidity')).toBe('push')
    expect(getDeliveryMode('bridge')).toBe('silent')

    // Silencing WAGER pools must not silence liquidity — the mistake FR-039 exists to prevent.
    setDeliveryMode('pools', 'silent')
    expect(resolveDelivery('pools')).toBe('silent')
    expect(getDeliveryMode('liquidity')).toBe('push')
  })
})

/* ============================================================================================== */
describe('T118 — no bridge or liquidity notification is attributed to wager pools (FR-039)', () => {
  it('registers each feature as its own activity source, and neither under the wager-pool key', () => {
    const keys = activitySources.map((s) => s.key)
    expect(keys).toContain('bridge')
    expect(keys).toContain('liquidity')
    expect(keys).toContain('pools')
    expect(new Set(keys).size).toBe(keys.length)
    // The three read differently in the feed, so one word can never cover two features.
    expect(domainLabel('pools')).toBe('Wager Pool')
    expect(domainLabel('liquidity')).toBe('Liquidity')
    expect(domainLabel('bridge')).toBe('Bridge')
  })

  it('stamps every emitted bridge entry with the bridge domain and a Bridge link', async () => {
    queueBridgeNotification(
      ACCOUNT,
      ORIGIN,
      bridgeNotification(bridgeEntry(), { to: BRIDGE_STATE.DELIVERED, dstTxHash: DST_TX }),
    )
    queueBridgeNotification(
      ACCOUNT,
      ORIGIN,
      bridgeNotification(bridgeEntry({ bridgeId: 'cl:bridge-2' }), { to: BRIDGE_STATE.NEEDS_ATTENTION }),
    )

    const res = await bridgeSource.detect({ account: ACCOUNT, chainId: ORIGIN, nowMs: NOW, prior: {} })
    expect(res.ok).toBe(true)
    expect(res.entries).toHaveLength(2)
    for (const entry of res.entries) {
      expect(entry.domain).toBe('bridge')
      expect(entry.domain).not.toBe('pools')
      expect(entry.type.startsWith('bridge-')).toBe(true)
      expect(entry.link.to).toMatch(/view=bridge/)
      // Delivery is resolved from the entry's own domain — an entry filed under `pools` would be
      // silenced by a wager-pool preference, which is exactly the collision FR-039 forbids.
      expect(resolveDelivery(entry.domain)).toBe(DEFAULT_MODE)
    }
    // Drained: the same outcome is never announced twice.
    expect(peekBridgeNotifications(ACCOUNT, ORIGIN)).toHaveLength(0)
  })

  it('stamps every emitted liquidity entry with the liquidity domain and a Supply link', async () => {
    // Drive the source through mocked reads so this is about attribution, not about the network.
    vi.resetModules()
    vi.doMock('../../data/ledger/sources/liquidityLedgerSource', () => ({
      listLiquidityEntries: () => [{ poolId: '0xpool-a', tokenSymbol: 'USDC', token1Symbol: 'WETH' }],
    }))
    vi.doMock('../../utils/rpcProvider', () => ({ makeReadProvider: () => ({}) }))
    vi.doMock('../../lib/liquidity/liquidityRouter', async () => {
      const actual = await vi.importActual('../../lib/liquidity/liquidityRouter')
      return {
        ...actual,
        getLiquidityRouterAddress: () => '0x' + '11'.repeat(20),
        readLiquidityRouterConfig: async () => ({
          paused: false,
          poolsComplete: true,
          pools: [{ poolId: '0xpool-a', enabled: false, kind: 2 }],
        }),
      }
    })

    const { liquiditySource } = await import('../../data/notifications/sources/liquiditySource')
    const prior = {
      snapshots: { protocol: { paused: false, poolsComplete: true, pools: { '0xpool-a': { enabled: true, kind: 2 } } } },
    }
    const res = await liquiditySource.detect({ account: ACCOUNT, chainId: ORIGIN, nowMs: NOW, prior })

    expect(res.ok).toBe(true)
    expect(res.entries).toHaveLength(1)
    const [entry] = res.entries
    expect(entry.domain).toBe('liquidity')
    expect(entry.domain).not.toBe('pools')
    expect(entry.type).toBe(LIQUIDITY_EVENT.POOL_CLOSED)
    expect(entry.message).toMatch(/Your USDC\/WETH pool/)
    expect(entry.link.to).toMatch(/view=supply/)
    expect(resolveDelivery(entry.domain)).toBe(DEFAULT_MODE)
    // The snapshot advances so the same closure is not re-announced next cycle.
    expect(res.nextSnapshots.protocol.pools['0xpool-a'].enabled).toBe(false)

    vi.doUnmock('../../data/ledger/sources/liquidityLedgerSource')
    vi.doUnmock('../../utils/rpcProvider')
    vi.doUnmock('../../lib/liquidity/liquidityRouter')
    vi.resetModules()
  })
})
