/**
 * SupplyView + LiquidityPoolCard (spec 067, US2 — T102/T103, SC-014/SC-021).
 *
 * What these tests hold in place, in the order the review flagged them:
 *
 *   1. The fee is charged on capital ACTUALLY DEPLOYED. A card discloses a
 *      RATE and says what the rate applies to — it never promises "fee = rate ×
 *      what you entered", because the router quotes the fee after the mint
 *      against what Uniswap actually consumed and refunds the rest whole.
 *   2. A bridge pool shows NO fee line at all — not a line reading 0.00%, which
 *      would imply a lever that does not exist (research R3).
 *   3. The pair selector uses `samePair`, the exact INVERSE of the Bridge
 *      surface's `bridgeDest`. The last block below fails if it is swapped.
 *   4. The Supply area is NOT gated on the wallet's active chain — that was the
 *      Phase 3 Bridge bug. Pools from every network render regardless.
 *   5. Availability is asymmetric: trading liquidity on the Uniswap networks,
 *      bridge liquidity on ETHEREUM ONLY.
 *
 * Plus FR-024 (a retired pool stays visible and withdrawable), FR-020 (every
 * position figure labelled a live estimate), FR-025 (honest empty state naming
 * where pooling IS available), honest degradation on an unreachable protocol,
 * and a WCAG audit with vitest-axe.
 *
 * The `catalog` prop is the injection seam SupplyView exposes for exactly this:
 * no network is touched, so nothing here depends on a deployment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { axe } from 'vitest-axe'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))

// The member's cross-network asset list is handed to the confirm sheet, not used
// by the list itself. Stubbed so these tests exercise the Supply area alone.
const mockAssets = vi.hoisted(() => ({ current: { options: [], defaultKey: null } }))
vi.mock('../../hooks/useSelectableAssets', () => ({
  useSelectableAssets: () => mockAssets.current,
  default: () => mockAssets.current,
}))

// The confirm step is lazily imported and owns its own disclosure gate and fee
// line (tested in SupplySheet.test.jsx). Stubbed here so these tests prove the
// LIST's wiring — that a control opens the sheet for the pool it belongs to —
// without depending on the sheet's internals.
vi.mock('../../components/earn/SupplySheet', () => ({
  default: ({ pool, positions }) => (
    <div data-testid="supply-sheet" data-pool={pool?.poolId} data-positions={positions?.length ?? 0} />
  ),
}))

import SupplyView from '../../components/earn/SupplyView'
import LiquidityPoolCard from '../../components/earn/LiquidityPoolCard'
import {
  POOL_KIND,
  createLiquidityPin,
  filterPairCounterparts,
  revalidatePairCounterpart,
} from '../../lib/liquidity/liquidityRouter'
import { bridgeDest } from '../../lib/assets/networkPin'
import { partialWithdrawalCopy } from '../../lib/liquidity/liquidityCopy'

const USDC = { address: '0x00000000000000000000000000000000000000c1', symbol: 'USDC', decimals: 6 }
const WETH = { address: '0x00000000000000000000000000000000000000e1', symbol: 'WETH', decimals: 18 }

/** A Uniswap pair on Polygon — deliberately NOT the wallet's active network. */
const TRADING_POOL = {
  key: '137:0xtrading',
  poolId: '0xtrading',
  chainId: 137,
  networkName: 'Polygon',
  kind: POOL_KIND.TRADING_LP,
  protocol: 'Uniswap',
  listing: { poolId: '0xtrading', poolAddress: '0xpool', token0: USDC.address, token1: WETH.address },
  assets: [USDC, WETH],
  feeTier: 3000,
  estimatedReturnApr: 0.052,
  totalSuppliedLabel: '1.2M USDC + 340 WETH',
  enabled: true,
  available: true,
  unavailableReason: null,
  feeBps: 25,
  feeAvailable: true,
}

/** An Across bridge pool — Ethereum only, by Across's design (research R8). */
const BRIDGE_POOL = {
  key: '1:0xbridge',
  poolId: '0xbridge',
  chainId: 1,
  networkName: 'Ethereum',
  kind: POOL_KIND.BRIDGE_LP,
  protocol: 'Across',
  listing: { poolId: '0xbridge', poolAddress: '0xhub', token0: USDC.address, token1: null },
  assets: [USDC],
  feeTier: null,
  estimatedReturnApr: 0.031,
  totalSuppliedLabel: '8.4M USDC',
  enabled: true,
  available: true,
  unavailableReason: null,
  feeBps: 0,
  feeAvailable: false,
}

/** FR-024 — closed to new deposits, still listed and still withdrawable. */
const RETIRED_POOL = {
  ...TRADING_POOL,
  key: '137:0xretired',
  poolId: '0xretired',
  assets: [USDC, { ...WETH, symbol: 'WPOL' }],
  enabled: false,
  available: false,
  unavailableReason: 'retired',
}

/** The protocol could not be reached: figures withheld, never invented. */
const UNREACHABLE_POOL = {
  ...TRADING_POOL,
  key: '42161:0xdown',
  poolId: '0xdown',
  chainId: 42161,
  networkName: 'Arbitrum',
  assets: [USDC, { ...WETH, symbol: 'ARB' }],
  estimatedReturnApr: null,
  totalSuppliedLabel: null,
  enabled: true,
  available: false,
  unavailableReason: 'unreachable',
}

const TRADING_POSITION = {
  key: 'pos-trading',
  pool: TRADING_POOL,
  currentValueLabel: '500 USDC + 0.12 WETH',
  earningsLabel: '3.2 USDC + 0.001 WETH',
  compositionLabel: '62% USDC / 38% WETH',
  partialNote: null,
  isEstimate: true,
}

const BRIDGE_POSITION = {
  key: 'pos-bridge',
  pool: BRIDGE_POOL,
  currentValueLabel: '1,000 USDC',
  earningsLabel: null,
  earningsNote:
    'Bridge-pool earnings build into the value above rather than accruing separately, so there is no separate earned figure to show.',
  compositionLabel: null,
  partialNote: partialWithdrawalCopy('400 USDC'),
  isEstimate: true,
}

const RETIRED_POSITION = {
  key: 'pos-retired',
  pool: RETIRED_POOL,
  currentValueLabel: '250 USDC + 90 WPOL',
  earningsLabel: '1.1 USDC + 0.4 WPOL',
  compositionLabel: '55% USDC / 45% WPOL',
  partialNote: null,
  isEstimate: true,
}

const catalog = (over = {}) => ({
  status: 'ready',
  pools: [TRADING_POOL, BRIDGE_POOL],
  positions: [],
  networks: [
    { chainId: 137, name: 'Polygon', status: 'ready', poolsComplete: true },
    { chainId: 1, name: 'Ethereum', status: 'ready', poolsComplete: true },
  ],
  asOf: Date.UTC(2026, 0, 1, 12, 0, 0),
  refresh: vi.fn(),
  ...over,
})

beforeEach(() => {
  // The wallet sits on a network with NO curated pools on purpose: the list
  // below must still show every pool (point 4).
  mockWallet.current = { chainId: 137, address: '0xmember', isConnected: true }
})

// ---------------------------------------------------------------------------
// The curated list — both kinds, cross-network (FR-015/T093)
// ---------------------------------------------------------------------------

describe('SupplyView — the curated list (FR-015)', () => {
  it('lists both pool kinds together, each labelled, with protocol and network', () => {
    render(<SupplyView catalog={catalog()} />)

    expect(screen.getByText('USDC / WETH')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('Trading liquidity')).toBeInTheDocument()
    expect(screen.getByText('Bridge liquidity')).toBeInTheDocument()
    expect(screen.getByText(/Uniswap · on Polygon/)).toBeInTheDocument()
    expect(screen.getByText(/Across · on Ethereum/)).toBeInTheDocument()
  })

  it('shows the estimated return, total supplied, and a kind-specific risk summary (FR-017)', () => {
    render(<SupplyView catalog={catalog()} />)

    expect(screen.getByText('5.20%')).toBeInTheDocument()
    expect(screen.getByText('1.2M USDC + 340 WETH')).toBeInTheDocument()
    expect(screen.getByText('3.10%')).toBeInTheDocument()
    expect(screen.getByText('8.4M USDC')).toBeInTheDocument()

    // Trading pools warn about the changing mix; bridge pools warn about inventory.
    expect(
      screen.getByText(/mix of the two assets you get back changes with their prices/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Across moves this pool’s funds between networks/i),
    ).toBeInTheDocument()
  })

  it('does NOT gate the list on the wallet’s active chain (the Phase 3 Bridge bug)', () => {
    // Wallet on Polygon; the Ethereum bridge pool is still offered and its
    // Supply control is live — no "switch network first" wall.
    mockWallet.current = { chainId: 137, address: '0xmember', isConnected: true }
    render(<SupplyView catalog={catalog()} />)

    expect(screen.getByRole('button', { name: 'Supply USDC' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Supply USDC / WETH' })).toBeEnabled()
    // And the active-network note explicitly says browsing needs no switch.
    expect(screen.getByText(/You do not have to switch networks to look/i)).toBeInTheDocument()
  })

  it('opens the confirm step for the pool whose control was pressed', async () => {
    render(<SupplyView catalog={catalog()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Supply USDC' }))
    const sheet = await screen.findByTestId('supply-sheet')
    expect(sheet).toHaveAttribute('data-pool', BRIDGE_POOL.poolId)
  })

  it('states the availability asymmetry — bridge pools are Ethereum only', () => {
    render(<SupplyView catalog={catalog()} />)
    // Once, not twice: the copy states both halves separately and never implies
    // that both kinds of pool exist everywhere.
    const stated = screen.getAllByText(/Bridge pools are available on Ethereum only/i)
    expect(stated).toHaveLength(1)
    expect(stated[0]).toHaveTextContent(/trading pools/i)
  })
})

// ---------------------------------------------------------------------------
// The fee line — a rate, and only where a rate can be charged
// ---------------------------------------------------------------------------

describe('SupplyView — the platform fee line (FR-028/FR-029, research R3)', () => {
  it('discloses a RATE for a trading pool and never a fee amount off the gross', () => {
    render(<SupplyView catalog={catalog()} />)

    expect(screen.getByText('FairWins platform fee: 0.25%')).toBeInTheDocument()
    // What the rate applies to: capital actually deployed, not what was offered.
    expect(
      screen.getByText(/charged on what actually goes into the pool/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/never on the whole amount you offered/i)).toBeInTheDocument()
  })

  it('shows NO fee line at all on a bridge pool — not even one reading 0.00%', () => {
    render(<LiquidityPoolCard pool={BRIDGE_POOL} />)
    expect(screen.queryByText(/FairWins platform fee/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/0\.00%/)).not.toBeInTheDocument()
  })

  it('shows no fee line for a bridge pool even if a non-zero rate is somehow passed', () => {
    // Defence in depth: the copy layer refuses a bridge fee regardless of bps.
    render(<LiquidityPoolCard pool={{ ...BRIDGE_POOL, feeBps: 250, feeAvailable: true }} />)
    expect(screen.queryByText(/FairWins platform fee/i)).not.toBeInTheDocument()
  })

  it('shows no fee line when the live rate is zero (FR-029)', () => {
    render(<LiquidityPoolCard pool={{ ...TRADING_POOL, feeBps: 0 }} />)
    expect(screen.queryByText(/FairWins platform fee/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Honest states (FR-024/FR-025, T100/T101)
// ---------------------------------------------------------------------------

describe('SupplyView — retired and unreachable pools (FR-024)', () => {
  it('keeps a retired pool VISIBLE, marks it closed, and offers no deposit control', () => {
    render(<SupplyView catalog={catalog({ pools: [RETIRED_POOL] })} />)

    expect(screen.getByText('USDC / WPOL')).toBeInTheDocument()
    expect(screen.getByText('Closed to new deposits')).toBeInTheDocument()
    expect(screen.getByText(/This pool is closed to new deposits/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Supply/ })).not.toBeInTheDocument()
  })

  it('keeps a retired pool WITHDRAWABLE when the member has money in it', () => {
    render(
      <SupplyView catalog={catalog({ pools: [RETIRED_POOL], positions: [RETIRED_POSITION] })} />,
    )
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Supply/ })).not.toBeInTheDocument()
  })

  it('opens the confirm step for a retired pool’s WITHDRAW control — the exit always works', async () => {
    render(
      <SupplyView catalog={catalog({ pools: [RETIRED_POOL], positions: [RETIRED_POSITION] })} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    const sheet = await screen.findByTestId('supply-sheet')
    expect(sheet).toHaveAttribute('data-pool', RETIRED_POOL.poolId)
  })

  it('never filters a retired pool out of a token-filtered list', () => {
    render(
      <SupplyView
        tokenFilter="USDC"
        catalog={catalog({ pools: [RETIRED_POOL], positions: [RETIRED_POSITION] })}
      />,
    )
    // The pool CARD itself survives the filter, not merely the position row.
    expect(screen.getByRole('article', { name: /USDC \/ WPOL/ })).toBeInTheDocument()
  })

  it('degrades an unreachable protocol without inventing figures', () => {
    render(<SupplyView catalog={catalog({ pools: [UNREACHABLE_POOL] })} />)

    const card = screen.getByRole('article', { name: /USDC \/ ARB/ })
    expect(within(card).getAllByText('—').length).toBe(2)
    expect(within(card).getByText(/we would rather show nothing than a figure we cannot source/i))
      .toBeInTheDocument()
    expect(within(card).getByText(/We cannot reach this pool’s protocol right now/i)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /^Supply/ })).not.toBeInTheDocument()
  })

  it('blames the right fault when the fee rate — not the protocol — cannot be read', () => {
    render(
      <SupplyView
        catalog={catalog({
          pools: [{ ...TRADING_POOL, available: false, unavailableReason: 'fees', feeAvailable: false, feeBps: 0 }],
        })}
      />,
    )
    expect(screen.getByText(/We cannot read the current platform fee/i)).toBeInTheDocument()
    expect(screen.queryByText(/We cannot reach this pool’s protocol/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Supply/ })).not.toBeInTheDocument()
  })

  it('names the networks whose pools could not be read rather than implying a whole list', () => {
    render(
      <SupplyView
        catalog={catalog({
          networks: [
            { chainId: 137, name: 'Polygon', status: 'ready', poolsComplete: true },
            { chainId: 1, name: 'Ethereum', status: 'unreachable' },
          ],
        })}
      />,
    )
    expect(screen.getByText(/could not read pools on Ethereum just now/i)).toBeInTheDocument()
  })
})

describe('SupplyView — empty states (FR-025)', () => {
  it('says so honestly and names where pooling IS available, asymmetrically', () => {
    render(<SupplyView catalog={catalog({ pools: [] })} />)

    expect(screen.getByText(/There are no pools to supply right now/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Bridge pools are available on Ethereum only/i).length)
      .toBeGreaterThan(0)
    // No mock rows and no dead controls.
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Supply/ })).not.toBeInTheDocument()
  })

  it('explains an empty token filter and names where pooling is available', () => {
    render(<SupplyView tokenFilter="DAI" catalog={catalog()} />)
    expect(screen.getByText(/No pool takes DAI right now/i)).toBeInTheDocument()
  })

  it('offers a retry, not a blank page, when nothing could be read at all', () => {
    const refresh = vi.fn()
    render(<SupplyView catalog={catalog({ status: 'unavailable', pools: [], refresh })} />)
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }))
    expect(refresh).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Open positions (FR-020, T098)
// ---------------------------------------------------------------------------

describe('SupplyView — open positions (FR-020)', () => {
  it('shows value, earnings, and composition for a trading position, each an estimate', () => {
    render(<SupplyView catalog={catalog({ positions: [TRADING_POSITION] })} />)

    expect(screen.getByText('500 USDC + 0.12 WETH')).toBeInTheDocument()
    expect(screen.getByText('3.2 USDC + 0.001 WETH')).toBeInTheDocument()
    expect(screen.getByText('62% USDC / 38% WETH')).toBeInTheDocument()
    // Each figure is labelled a live estimate — value, earnings, mix.
    expect(screen.getAllByText('Live estimate')).toHaveLength(3)
    expect(screen.getByText(/Nothing on this screen is a guaranteed amount/i)).toBeInTheDocument()
  })

  it('omits composition for a bridge position and says why earnings are not separate', () => {
    render(<SupplyView catalog={catalog({ positions: [BRIDGE_POSITION] })} />)

    expect(screen.getByText('1,000 USDC')).toBeInTheDocument()
    expect(screen.queryByText('Current mix')).not.toBeInTheDocument()
    expect(screen.getByText(/earnings build into the value above/i)).toBeInTheDocument()
  })

  it('states plainly when inventory cannot fill a full withdrawal now (FR-022)', () => {
    render(<SupplyView catalog={catalog({ positions: [BRIDGE_POSITION] })} />)
    expect(screen.getByText(/400 USDC is available to withdraw right now/i)).toBeInTheDocument()
    expect(screen.getByText(/come back for the remainder shortly/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// The pair rule — `samePair`, the exact inverse of the Bridge surface (FR-062)
// ---------------------------------------------------------------------------

describe('liquidity pair selection uses samePair, never bridgeDest (FR-062/T103)', () => {
  const opt = (key, chainId, symbol, networkName) => ({
    key,
    chainId,
    symbol,
    networkName,
    kind: 'erc20',
    address: `0x${key}`,
  })

  const usdcPolygon = opt('a', 137, 'USDC', 'Polygon')
  const wethPolygon = opt('b', 137, 'WETH', 'Polygon')
  const usdcEthereum = opt('c', 1, 'USDC', 'Ethereum')
  const wethEthereum = opt('d', 1, 'WETH', 'Ethereum')
  const options = [usdcPolygon, wethPolygon, usdcEthereum, wethEthereum]

  it('keeps counterparts on the pinned network and drops every other network', () => {
    const pin = createLiquidityPin(usdcPolygon)
    const eligible = filterPairCounterparts(options, pin)

    expect(eligible.map((o) => o.key).sort()).toEqual(['a', 'b'])
    // A pair can never span networks.
    expect(eligible.every((o) => o.chainId === 137)).toBe(true)
  })

  it('is the INVERSE of the bridge rule — swapping the predicate changes the answer', () => {
    const pin = createLiquidityPin(usdcPolygon)
    const pairEligible = filterPairCounterparts(options, pin).map((o) => o.key).sort()
    const bridgeEligible = options.filter((o) => bridgeDest(o, pin)).map((o) => o.key).sort()

    // Same asset on another network: a bridge destination, never a pair leg.
    expect(bridgeEligible).toEqual(['c'])
    expect(pairEligible).not.toEqual(bridgeEligible)
    expect(pairEligible).not.toContain('c')
  })

  it('clears a second selection that the new pin invalidates', () => {
    const polygonPin = createLiquidityPin(usdcPolygon)
    expect(revalidatePairCounterpart(wethPolygon, polygonPin)).toBe(wethPolygon)

    // The member changes the first asset to one on Ethereum: the Polygon
    // counterpart is no longer a valid leg and must be dropped, not carried.
    const ethereumPin = createLiquidityPin(usdcEthereum)
    expect(revalidatePairCounterpart(wethPolygon, ethereumPin)).toBeNull()
    expect(revalidatePairCounterpart(wethEthereum, ethereumPin)).toBe(wethEthereum)
  })
})

// ---------------------------------------------------------------------------
// Accessibility (SC-014)
// ---------------------------------------------------------------------------

describe('SupplyView accessibility', () => {
  it('the full list with positions has no axe violations', async () => {
    const { container } = render(
      <SupplyView
        catalog={catalog({
          pools: [TRADING_POOL, BRIDGE_POOL, RETIRED_POOL, UNREACHABLE_POOL],
          positions: [TRADING_POSITION, BRIDGE_POSITION, RETIRED_POSITION],
        })}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('the empty state has no axe violations', async () => {
    const { container } = render(<SupplyView catalog={catalog({ pools: [] })} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('the unavailable state has no axe violations', async () => {
    const { container } = render(
      <SupplyView catalog={catalog({ status: 'unavailable', pools: [] })} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
