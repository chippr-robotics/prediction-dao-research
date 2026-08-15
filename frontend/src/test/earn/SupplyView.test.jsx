/**
 * SupplyView + LiquidityPoolCard (spec 067, US2 — T102/T103, SC-014/SC-021).
 *
 * What these tests hold in place, in the order the review flagged them:
 *
 *   1. A ROW SUMMARISES AND OPENS; IT NEVER DISCLOSES. Each pool is one dense
 *      row whose whole surface opens `SupplySheet`. The platform fee rate is
 *      NOT on it: the fee is charged on capital the pool actually consumed, so
 *      the only honest disclosure is the sheet's, before the signature. A row
 *      that quoted a rate would be quoting one for an amount nobody has typed.
 *   2. A bridge pool carries no fee figure anywhere — not one reading 0.00%,
 *      which would imply a lever that does not exist (research R3).
 *   3. The pair selector uses `samePair`, the exact INVERSE of the Bridge
 *      surface's `bridgeDest`. The last block below fails if it is swapped.
 *   4. The Supply area is NOT gated on the wallet's active chain — that was the
 *      Phase 3 Bridge bug. Pools from every network render regardless.
 *   5. Availability is asymmetric: trading liquidity on the Uniswap networks,
 *      bridge liquidity on ETHEREUM ONLY.
 *
 * Plus FR-024 (a pool closed to deposits stays visible, stays openable, and
 * opens on the tab the member can actually use), FR-020 (every position figure
 * labelled a live estimate), FR-025 (honest empty state naming where pooling IS
 * available), honest degradation on an unreachable protocol — each closed state
 * naming itself rather than collapsing into one "closed" — and a WCAG audit
 * with vitest-axe.
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
  default: ({ pool, positions, initialMode }) => (
    <div
      data-testid="supply-sheet"
      data-pool={pool?.poolId}
      data-mode={initialMode}
      data-positions={positions?.length ?? 0}
    />
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

/** No return figure to show — the ordinary case, since neither protocol publishes one. */
const NO_RETURN_POOL = {
  ...TRADING_POOL,
  key: '137:0xnoreturn',
  poolId: '0xnoreturn',
  assets: [USDC, { ...WETH, symbol: 'ARB' }],
  estimatedReturnApr: null,
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

/** The row IS the control now, so it is found by the name it announces. */
const poolRow = (name) => screen.getByRole('button', { name })
const tradingRow = () => poolRow(/USDC \/ WETH —/)
const bridgeRow = () => poolRow(/^USDC — Bridge liquidity/)

// ---------------------------------------------------------------------------
// The curated list — both kinds, cross-network (FR-015/T093)
// ---------------------------------------------------------------------------

describe('SupplyView — the curated list (FR-015)', () => {
  it('lists both pool kinds together as rows, each labelled, with protocol and network', () => {
    render(<SupplyView catalog={catalog()} />)

    expect(screen.getByText('USDC / WETH')).toBeInTheDocument()
    expect(screen.getByText('USDC')).toBeInTheDocument()
    expect(screen.getByText('Trading liquidity')).toBeInTheDocument()
    expect(screen.getByText('Bridge liquidity')).toBeInTheDocument()

    // Each row announces itself in one breath: what it is, where it lives, how big.
    expect(
      screen.getByRole('button', { name: /USDC \/ WETH — Trading liquidity on Polygon/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /USDC — Bridge liquidity on Ethereum/ }),
    ).toBeInTheDocument()

    const trading = tradingRow()
    expect(within(trading).getByText('Uniswap')).toBeInTheDocument()
    expect(within(trading).getByText('Polygon')).toBeInTheDocument()
    expect(within(trading).getByText('0.30% fee')).toBeInTheDocument()
    expect(within(bridgeRow()).getByText('Across')).toBeInTheDocument()
    expect(within(bridgeRow()).getByText('Ethereum')).toBeInTheDocument()
  })

  it('carries the pool’s size on the row and states an absent return as one (FR-017/FR-054)', () => {
    render(<SupplyView catalog={catalog({ pools: [TRADING_POOL, NO_RETURN_POOL] })} />)

    expect(within(tradingRow()).getByText('1.2M USDC + 340 WETH')).toBeInTheDocument()
    expect(within(tradingRow()).getByText('Return 5.20%')).toBeInTheDocument()
    // No protocol publishes a realised return we can read, so the usual row says so
    // rather than rendering a 0% that would read as a real figure.
    const noReturn = screen.getByRole('button', { name: /USDC \/ ARB/ })
    expect(within(noReturn).getByText('Return n/a')).toBeInTheDocument()
    expect(within(noReturn).queryByText(/0\.00%/)).not.toBeInTheDocument()
  })

  it('does NOT gate the list on the wallet’s active chain (the Phase 3 Bridge bug)', () => {
    // Wallet on a network with NO pools at all — Ethereum Classic runs neither
    // protocol. Both pools are still listed and both rows still open.
    mockWallet.current = { chainId: 61, address: '0xmember', isConnected: true }
    render(<SupplyView catalog={catalog()} />)

    expect(bridgeRow()).toBeEnabled()
    expect(tradingRow()).toBeEnabled()
    // And the active-network note explicitly says browsing needs no switch. It is a
    // NOTE about where the wallet happens to be, never a wall in front of the list.
    expect(screen.getByText(/You do not have to switch networks to look/i)).toBeInTheDocument()
  })

  it('opens the detail sheet for the pool whose ROW was pressed', async () => {
    render(<SupplyView catalog={catalog()} />)
    fireEvent.click(bridgeRow())
    const sheet = await screen.findByTestId('supply-sheet')
    expect(sheet).toHaveAttribute('data-pool', BRIDGE_POOL.poolId)
    // An open pool lands on Supply, with Withdraw one tap away inside the sheet.
    expect(sheet).toHaveAttribute('data-mode', 'supply')
  })

  it('marks a pool the member is already in, so their exit is findable in the list', () => {
    render(<SupplyView catalog={catalog({ positions: [TRADING_POSITION] })} />)
    expect(within(tradingRow()).getByText('Your position')).toBeInTheDocument()
    expect(within(bridgeRow()).queryByText('Your position')).not.toBeInTheDocument()
  })

  it('states the availability asymmetry — bridge pools are Ethereum only', () => {
    render(<SupplyView catalog={catalog()} />)
    // Once, not twice: the copy states both halves separately and never implies
    // that both kinds of pool exist everywhere.
    const stated = screen.getAllByText(/Bridge pools are available on Ethereum only/i)
    expect(stated).toHaveLength(1)
    expect(stated[0]).toHaveTextContent(/trading pools/i)
  })

  it('folds the availability copy away without dropping it', () => {
    render(<SupplyView catalog={catalog()} />)
    // Reference material a member reads once should not hold the top of the
    // screen — but it must stay reachable, because a member who cannot find out
    // that bridge pools are Ethereum-only hits that fact at the confirm step.
    const summary = screen.getByText('Where pools are available')
    const details = summary.closest('details')
    expect(details).toBeTruthy()
    expect(details.open).toBe(false)
    expect(details).toHaveTextContent(/Bridge pools are available on Ethereum only/i)
  })
})

// ---------------------------------------------------------------------------
// Searching and narrowing the list
// ---------------------------------------------------------------------------

describe('SupplyView — search and filters', () => {
  const search = () => screen.getByRole('searchbox', { name: /search pools/i })

  it('narrows the list as the member types, matching asset, network or protocol', () => {
    render(<SupplyView catalog={catalog()} />)

    fireEvent.change(search(), { target: { value: 'ethereum' } })
    expect(bridgeRow()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /USDC \/ WETH —/ })).not.toBeInTheDocument()
    // A short list must read as a narrowed one, not as the whole estate.
    expect(screen.getByText('Showing 1 of 2 pools.')).toBeInTheDocument()

    fireEvent.change(search(), { target: { value: '' } })
    expect(tradingRow()).toBeInTheDocument()
    expect(screen.queryByText(/Showing 1 of 2 pools/)).not.toBeInTheDocument()
  })

  it('filters by pool kind from the chip row', () => {
    render(<SupplyView catalog={catalog()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Trading' }))
    expect(tradingRow()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^USDC — Bridge liquidity/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trading' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(bridgeRow()).toBeInTheDocument()
  })

  it('offers no kind chips when only one kind is curated', () => {
    render(<SupplyView catalog={catalog({ pools: [TRADING_POOL, NO_RETURN_POOL] })} />)
    // Two controls where one empties the list and the other does nothing.
    expect(screen.queryByRole('group', { name: /filter pools by type/i })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search pools/i })).toBeInTheDocument()
  })

  it('offers no search box for a single pool', () => {
    render(<SupplyView catalog={catalog({ pools: [TRADING_POOL] })} />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('NEVER hides a pool that is closed to new deposits (FR-024)', () => {
    // A member's exit lives inside that row. Narrowing by identity is allowed to
    // move it off screen; narrowing by state is not, and no control here does.
    render(<SupplyView catalog={catalog({ pools: [TRADING_POOL, RETIRED_POOL] })} />)

    fireEvent.change(search(), { target: { value: 'usdc' } })
    const row = screen.getByRole('button', { name: /USDC \/ WPOL/ })
    expect(within(row).getByText('Closed to new deposits')).toBeInTheDocument()
  })

  it('never filters the member’s own positions — only the catalog below them', () => {
    render(
      <SupplyView catalog={catalog({ positions: [TRADING_POSITION, BRIDGE_POSITION] })} />,
    )
    fireEvent.change(search(), { target: { value: 'zzz' } })

    // The catalog is empty and says so; both positions are still on screen.
    expect(screen.getByText(/No pool matches “zzz”/i)).toBeInTheDocument()
    expect(screen.getByText('500 USDC + 0.12 WETH')).toBeInTheDocument()
    expect(screen.getByText('1,000 USDC')).toBeInTheDocument()
  })

  it('keeps the availability disclosure over an empty SEARCH, which says nothing about availability', () => {
    render(<SupplyView catalog={catalog()} />)
    fireEvent.change(search(), { target: { value: 'solana' } })
    expect(screen.getByText('Where pools are available')).toBeInTheDocument()
  })

  it('explains an empty search differently from an empty catalog, and offers a way back', () => {
    render(<SupplyView catalog={catalog()} />)
    fireEvent.change(search(), { target: { value: 'solana' } })

    // A search that found nothing is a fact about the search, not about the catalog.
    expect(screen.getByText(/No pool matches “solana”/i)).toBeInTheDocument()
    expect(screen.queryByText(/There are no pools to supply right now/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Clear search/i }))
    expect(tradingRow()).toBeInTheDocument()
    expect(search()).toHaveValue('')
  })

  it('composes with the ?token= deep link rather than replacing it', () => {
    render(<SupplyView tokenFilter="USDC" catalog={catalog()} />)
    fireEvent.change(search(), { target: { value: 'polygon' } })

    expect(tradingRow()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^USDC — Bridge liquidity/ })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// The fee line — a rate, and only where a rate can be charged
// ---------------------------------------------------------------------------

describe('SupplyView — the platform fee is disclosed in the sheet, never in the row', () => {
  // The rate is live, per-network, and applies to capital the pool ACTUALLY consumes —
  // none of which a one-line row can state honestly, and a bare "0.25%" beside a pool
  // fee tier reads as part of the pool. `SupplySheet` discloses it before the signature
  // and passes the same figure as `maxFeeBps`; those are its own tests (T095/T113).
  it('never puts a fee rate on a row, on either pool kind', () => {
    render(<SupplyView catalog={catalog()} />)
    expect(screen.queryByText(/FairWins platform fee/i)).not.toBeInTheDocument()
    // And nothing that could be mistaken for one: the only percentage a trading row
    // carries is the pool's own fee tier, labelled as such.
    expect(within(tradingRow()).getByText('0.30% fee')).toBeInTheDocument()
    expect(within(tradingRow()).queryByText('0.25%')).not.toBeInTheDocument()
  })

  it('shows no fee figure on a bridge row even if a non-zero rate is somehow passed', () => {
    // Defence in depth: that path cannot be charged at all (research R3), and the row
    // has nowhere for a rate to leak into.
    render(<LiquidityPoolCard pool={{ ...BRIDGE_POOL, feeBps: 250, feeAvailable: true }} />)
    expect(screen.queryByText(/FairWins platform fee/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/2\.50%/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Honest states (FR-024/FR-025, T100/T101)
// ---------------------------------------------------------------------------

describe('SupplyView — retired and unreachable pools (FR-024)', () => {
  it('keeps a retired pool VISIBLE and marks it closed, without hiding or disabling the row', () => {
    render(<SupplyView catalog={catalog({ pools: [RETIRED_POOL] })} />)

    const row = screen.getByRole('button', { name: /USDC \/ WPOL/ })
    expect(within(row).getByText('USDC / WPOL')).toBeInTheDocument()
    expect(within(row).getByText('Closed to new deposits')).toBeInTheDocument()
    // The state travels in the row's announcement too, not only as a visual chip.
    expect(row).toHaveAccessibleName(/Closed to new deposits/)
    // Still openable: the full explanation and the member's exit are inside the sheet.
    expect(row).toBeEnabled()
  })

  it('opens a retired pool the member holds straight onto WITHDRAW — the exit always works', async () => {
    render(
      <SupplyView catalog={catalog({ pools: [RETIRED_POOL], positions: [RETIRED_POSITION] })} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /USDC \/ WPOL/ }))
    const sheet = await screen.findByTestId('supply-sheet')
    expect(sheet).toHaveAttribute('data-pool', RETIRED_POOL.poolId)
    // Supply is a dead end on a closed pool, so the sheet must not land there.
    expect(sheet).toHaveAttribute('data-mode', 'withdraw')
  })

  it('opens a retired pool the member does NOT hold on the supply tab, which states why it is closed', async () => {
    render(<SupplyView catalog={catalog({ pools: [RETIRED_POOL] })} />)
    fireEvent.click(screen.getByRole('button', { name: /USDC \/ WPOL/ }))
    const sheet = await screen.findByTestId('supply-sheet')
    expect(sheet).toHaveAttribute('data-mode', 'supply')
  })

  it('never filters a retired pool out of a token-filtered list', () => {
    render(
      <SupplyView
        tokenFilter="USDC"
        catalog={catalog({ pools: [RETIRED_POOL], positions: [RETIRED_POSITION] })}
      />,
    )
    // The pool ROW itself survives the filter, not merely the position row.
    expect(screen.getByRole('button', { name: /USDC \/ WPOL/ })).toBeInTheDocument()
  })

  it('degrades an unreachable protocol without inventing figures', () => {
    render(<SupplyView catalog={catalog({ pools: [UNREACHABLE_POOL] })} />)

    const row = screen.getByRole('button', { name: /USDC \/ ARB/ })
    // A total we could not read is a dash, never a zero; the sheet says why.
    expect(within(row).getByText('—')).toBeInTheDocument()
    expect(within(row).getByText('Return n/a')).toBeInTheDocument()
    expect(within(row).getByText('Protocol unreachable')).toBeInTheDocument()
  })

  it('blames the right fault when the fee rate — not the protocol — cannot be read', () => {
    render(
      <SupplyView
        catalog={catalog({
          pools: [{ ...TRADING_POOL, available: false, unavailableReason: 'fees', feeAvailable: false, feeBps: 0 }],
        })}
      />,
    )
    // Four closed states, four different remedies: the row never collapses them into
    // one "closed", because a member told the wrong one waits for the wrong thing.
    expect(screen.getByText('Fee rate unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Protocol unreachable')).not.toBeInTheDocument()
    expect(screen.queryByText('Closed to new deposits')).not.toBeInTheDocument()
  })

  it('names a paused router as a pause, not as a retirement', () => {
    render(
      <SupplyView
        catalog={catalog({
          pools: [{ ...TRADING_POOL, available: false, unavailableReason: 'paused' }],
        })}
      />,
    )
    expect(screen.getByText('New deposits paused')).toBeInTheDocument()
    expect(screen.queryByText('Closed to new deposits')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /liquidity on/i })).not.toBeInTheDocument()
    // And the folded disclosure stands down: this copy already ends with the same
    // availability sentence, and saying it twice on one screen reads as a glitch.
    expect(screen.queryByText('Where pools are available')).not.toBeInTheDocument()
  })

  it('explains an empty token filter and names where pooling is available', () => {
    render(<SupplyView tokenFilter="DAI" catalog={catalog()} />)
    expect(screen.getByText(/No pool takes DAI right now/i)).toBeInTheDocument()
    // Same reason: this sentence already carries the availability copy.
    expect(screen.queryByText('Where pools are available')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Bridge pools are available on Ethereum only/i)).toHaveLength(1)
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
