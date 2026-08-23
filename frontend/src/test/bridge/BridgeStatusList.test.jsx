/**
 * BridgeStatusList tests (spec 067, US1 — T081/T084, SC-014).
 *
 * The load-bearing assertion in this file is the negative one: a transfer is never
 * rendered as delivered before the DESTINATION network has delivered (FR-009). The
 * rest cover the states a member actually meets — in flight, needs attention,
 * returned — each with both transactions linked (or the honest absence of the second
 * one), the "as of" provenance line (FR-052), the honest empty state, and axe.
 *
 * `reconcileBridges` is stubbed: it is exercised in
 * `lib/bridge/__tests__/bridgeStatus.test.js`, and stubbing it keeps this file about
 * what the member SEES, with no network in the loop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))

const mockReconcile = vi.hoisted(() => ({ current: vi.fn(async () => []) }))
vi.mock('../../lib/bridge/bridgeStatus', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, reconcileBridges: (...args) => mockReconcile.current(...args) }
})

/**
 * The roster this list reads is `bridgeNetworks()`, which since #1265 is bounded by the
 * build's cohort — and Across ships only on mainnets, so it is EMPTY in this (testnet,
 * VITE_NETWORK_ID=63) test build. These tests are about what a member SEES for transfers
 * that exist, so the roster is injected as the mainnet pair the fixtures below use. The
 * empty roster is not swept under that: it has its own test, and it must say the build
 * bridges nowhere rather than report an empty history it never looked for.
 */
const mockRoster = vi.hoisted(() => ({ current: [] }))
vi.mock('../../lib/bridge/bridgeCopy', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, bridgeNetworks: () => mockRoster.current }
})

import BridgeStatusList from '../../components/wallet/BridgeStatusList'
import {
  BRIDGE_STATE,
  captureBridgeState,
  captureBridgeSubmission,
} from '../../data/ledger/sources/bridgeLedgerSource'
import { appendClientRecord } from '../../data/ledger/ledgerClientStore'
import { LEDGER_CLASS, LEDGER_STATUS } from '../../data/ledger/constants'
import { BRIDGE_STATUS_SOURCE } from '../../lib/bridge/bridgeStatus'

const ACCOUNT = '0x4444444444444444444444444444444444444444'
const ORIGIN = 137 // Polygon
const DESTINATION = 8453 // Base
const SRC_TX = '0x' + 'a1'.repeat(32)
const DST_TX = '0x' + 'b2'.repeat(32)
const REFUND_TX = '0x' + 'c3'.repeat(32)

const SUBMISSION = {
  depositId: '4242',
  destinationChainId: DESTINATION,
  srcTxHash: SRC_TX,
  amountRaw: '25000000',
  tokenSymbol: 'USDC',
  tokenDecimals: 6,
  outputAmountRaw: '24960000',
  expectedBy: 1_800_000_060_000,
  at: 1_800_000_000_000,
}

/** A bridge already at `state`, with whatever evidence that state legitimately needs. */
function seedBridge({ state = BRIDGE_STATE.IN_FLIGHT, dstTxHash = null, refundTxHash = null } = {}) {
  captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
  if (state === BRIDGE_STATE.SUBMITTED) return
  if (state !== BRIDGE_STATE.SOURCE_CONFIRMED) {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: SUBMISSION.depositId, state: BRIDGE_STATE.IN_FLIGHT })
  } else {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: SUBMISSION.depositId, state })
    return
  }
  if (state !== BRIDGE_STATE.IN_FLIGHT) {
    captureBridgeState(ACCOUNT, ORIGIN, { depositId: SUBMISSION.depositId, state, dstTxHash, refundTxHash })
  }
}

/**
 * A terminal record with NO evidence behind it, written straight into the store —
 * exactly what a backup from another build, or a hand-edited store, could contain.
 * `captureBridgeState` would refuse to write this; the render-time gate must too.
 */
function seedForgedTerminal({ state, status }) {
  captureBridgeSubmission(ACCOUNT, ORIGIN, SUBMISSION)
  appendClientRecord(ACCOUNT, {
    entryId: `cl:bridge:137:4242:forged-${state}`,
    chainId: ORIGIN,
    account: ACCOUNT,
    class: LEDGER_CLASS.BRIDGE,
    kind: 'bridge_transfer',
    direction: 'none',
    status,
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
    amountRaw: '25000000',
    txHash: SRC_TX,
    timestamp: SUBMISSION.at,
    refs: {
      bridgeId: 'cl:bridge:137:4242',
      supersedes: 'cl:bridge:137:4242',
      depositId: SUBMISSION.depositId,
      originChainId: ORIGIN,
      destinationChainId: DESTINATION,
      srcTxHash: SRC_TX,
      dstTxHash: null,
      refundTxHash: null,
      bridgeState: state,
    },
  })
}

beforeEach(() => {
  localStorage.clear()
  mockWallet.current = { address: ACCOUNT, chainId: ORIGIN, isConnected: true }
  mockReconcile.current = vi.fn(async () => [])
  mockRoster.current = [
    { chainId: ORIGIN, name: 'Polygon' },
    { chainId: DESTINATION, name: 'Base' },
  ]
})

afterEach(() => {
  vi.useRealTimers()
})

describe('BridgeStatusList — in-flight transfers', () => {
  it('shows a live transfer with its sending transaction and no claim of delivery', async () => {
    seedBridge({ state: BRIDGE_STATE.IN_FLIGHT })
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText('On the way')).toBeInTheDocument()
    expect(within(item).getByText('25 USDC')).toBeInTheDocument()
    // Both networks named, in order.
    expect(within(item).getByText('Polygon')).toBeInTheDocument()
    expect(within(item).getByText('Base')).toBeInTheDocument()

    const sourceLink = within(item).getByRole('link', { name: /Sending transaction on Polygon/ })
    expect(sourceLink).toHaveAttribute('href', expect.stringContaining(SRC_TX))
    expect(within(item).queryByRole('link', { name: /Delivery transaction/ })).toBeNull()
    expect(within(item).getByText(/No delivery transaction yet on Base/)).toBeInTheDocument()
    expect(within(item).queryByText('Delivered')).toBeNull()
  })

  it('reconciles every bridge-capable network on mount, not just the active one', async () => {
    seedBridge({ state: BRIDGE_STATE.IN_FLIGHT })
    render(<BridgeStatusList />)
    await screen.findByRole('listitem')

    const chains = mockReconcile.current.mock.calls.map(([, chainId]) => chainId)
    expect(chains).toContain(ORIGIN)
    expect(chains).toContain(DESTINATION)
    expect(chains.every((c) => typeof c === 'number')).toBe(true)
    expect(mockReconcile.current.mock.calls.every(([account]) => account === ACCOUNT)).toBe(true)
  })

  it('says where a live status came from, "as of" that read (FR-052)', async () => {
    seedBridge({ state: BRIDGE_STATE.IN_FLIGHT })
    mockReconcile.current = vi.fn(async (_account, chainId) =>
      chainId === ORIGIN
        ? [{ depositId: SUBMISSION.depositId, source: BRIDGE_STATUS_SOURCE.CHAIN, changed: false }]
        : [],
    )
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText(/Status as of/)).toBeInTheDocument()
    expect(within(item).getByText(/read from the networks/)).toBeInTheDocument()
  })

  it('admits when neither the bridge service nor the networks could be read', async () => {
    seedBridge({ state: BRIDGE_STATE.IN_FLIGHT })
    mockReconcile.current = vi.fn(async (_account, chainId) =>
      chainId === ORIGIN
        ? [{ depositId: SUBMISSION.depositId, source: BRIDGE_STATUS_SOURCE.NONE, changed: false }]
        : [],
    )
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(
      within(item).getByText(/neither the bridge service nor the networks could be read/),
    ).toBeInTheDocument()
  })
})

describe('BridgeStatusList — completion is destination-gated (FR-009)', () => {
  it('renders Delivered with BOTH transactions once the destination has delivered', async () => {
    seedBridge({ state: BRIDGE_STATE.DELIVERED, dstTxHash: DST_TX })
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText('Delivered')).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: /Sending transaction on Polygon/ })).toHaveAttribute(
      'href',
      expect.stringContaining(SRC_TX),
    )
    expect(within(item).getByRole('link', { name: /Delivery transaction on Base/ })).toHaveAttribute(
      'href',
      expect.stringContaining(DST_TX),
    )
    expect(within(item).getByText(/Delivered 24\.96 USDC on Base/)).toBeInTheDocument()
    expect(within(item).queryByText(/No delivery transaction yet/)).toBeNull()
  })

  it('refuses to render a delivered record that has no destination transaction', async () => {
    // A record like this cannot be written by `captureBridgeState` — it is what a
    // restored backup or a hand-edited store could contain. The render-time gate is
    // the third and last one, and it still must not claim delivery.
    seedForgedTerminal({ state: BRIDGE_STATE.DELIVERED, status: LEDGER_STATUS.SETTLED })
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(within(item).queryByText('Delivered')).toBeNull()
    expect(within(item).getByText('On the way')).toBeInTheDocument()
    expect(within(item).getByText(/No delivery transaction yet on Base/)).toBeInTheDocument()
  })

  it('refuses to render a refunded record that has no return transaction', async () => {
    // "Your asset came back" is equally a claim about money, and gets the same
    // evidence rule: without a return transaction it is a late transfer, not a refund.
    seedForgedTerminal({ state: BRIDGE_STATE.REFUNDED, status: LEDGER_STATUS.CANCELLED })
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(within(item).queryByText('Returned to you')).toBeNull()
    expect(within(item).getByText('Taking longer than expected')).toBeInTheDocument()
    expect(within(item).queryByRole('link', { name: /Return transaction/ })).toBeNull()
  })
})

describe('BridgeStatusList — needs attention and refunds', () => {
  it('states what is known and what recourse exists, never a silent spinner (FR-011)', async () => {
    seedBridge({ state: BRIDGE_STATE.NEEDS_ATTENTION })
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText('Taking longer than expected')).toBeInTheDocument()
    expect(within(item).getByRole('note')).toHaveTextContent(/past its expected arrival time/i)
    expect(within(item).getByRole('note')).toHaveTextContent(/returned automatically/i)
    expect(within(item).getByRole('link', { name: /Sending transaction on Polygon/ })).toBeInTheDocument()
  })

  it('renders a refund with the return transaction on the origin network', async () => {
    seedBridge({ state: BRIDGE_STATE.REFUNDED, refundTxHash: REFUND_TX })
    render(<BridgeStatusList />)

    const item = await screen.findByRole('listitem')
    expect(within(item).getByText('Returned to you')).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: /Return transaction on Polygon/ })).toHaveAttribute(
      'href',
      expect.stringContaining(REFUND_TX),
    )
    expect(within(item).queryByText('Delivered')).toBeNull()
  })
})

describe('BridgeStatusList — ordering, empty state, polling', () => {
  it('lists live transfers before settled ones', async () => {
    // Settled bridge on Polygon…
    seedBridge({ state: BRIDGE_STATE.DELIVERED, dstTxHash: DST_TX })
    // …and a live one started later on Base.
    captureBridgeSubmission(ACCOUNT, DESTINATION, {
      ...SUBMISSION,
      depositId: '777',
      destinationChainId: ORIGIN,
      at: SUBMISSION.at - 60_000,
    })
    render(<BridgeStatusList />)

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    const [first, second] = screen.getAllByRole('listitem')
    expect(within(first).getByText('Sending')).toBeInTheDocument()
    expect(within(second).getByText('Delivered')).toBeInTheDocument()
  })

  it('shows an honest empty state rather than an invented transfer', async () => {
    render(<BridgeStatusList />)
    expect(await screen.findByText(/No cross-network transfers yet/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('says the build bridges nowhere rather than claiming an empty history (#1265)', async () => {
    // A cohort with no bridge-capable network — what a testnet build actually has.
    // The list looked at no chain, so "no transfers yet" would be a claim about the
    // member's history that nothing here checked.
    seedBridge({ state: BRIDGE_STATE.IN_FLIGHT })
    mockRoster.current = []
    render(<BridgeStatusList />)

    expect(
      await screen.findByText(/No network is set up for bridging in this build/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No cross-network transfers yet/)).toBeNull()
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(mockReconcile.current).not.toHaveBeenCalled()
  })

  it('shows nothing for a disconnected wallet and asks the network for nothing', async () => {
    mockWallet.current = { address: null, isConnected: false }
    render(<BridgeStatusList />)
    expect(await screen.findByText(/No cross-network transfers yet/)).toBeInTheDocument()
    expect(mockReconcile.current).not.toHaveBeenCalled()
  })

  it('does not poll once every transfer has settled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    seedBridge({ state: BRIDGE_STATE.DELIVERED, dstTxHash: DST_TX })
    render(<BridgeStatusList />)
    await screen.findByRole('listitem')

    const callsAfterMount = mockReconcile.current.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(mockReconcile.current.mock.calls.length).toBe(callsAfterMount)
  })
})

describe('BridgeStatusList — accessibility (SC-014)', () => {
  it('has no axe violations with live and settled transfers on screen', async () => {
    seedBridge({ state: BRIDGE_STATE.NEEDS_ATTENTION })
    captureBridgeSubmission(ACCOUNT, DESTINATION, {
      ...SUBMISSION,
      depositId: '999',
      destinationChainId: ORIGIN,
    })
    const { container } = render(<BridgeStatusList />)
    await screen.findAllByRole('listitem')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in the empty state', async () => {
    const { container } = render(<BridgeStatusList />)
    await screen.findByText(/No cross-network transfers yet/)
    expect(await axe(container)).toHaveNoViolations()
  })
})
