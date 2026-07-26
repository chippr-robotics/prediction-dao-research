/**
 * EarnPanel tests (spec 050 US1/US3, spec 067 US2 T086/T087) — hub areas,
 * attribution + risk disclosure + docs link, network-transparent vault list
 * (all earn networks shown with badges, regardless of the active wallet
 * network — no switch banner), and deep-link consumption (?view=, ?token=).
 *
 * Spec 067 adds the **Supply** area (FR-003) and the liquidity copy it renders
 * (FR-018/FR-019/FR-028/FR-029). The copy assertions live here rather than in a
 * file of their own because `lib/liquidity/liquidityCopy.js` and this hub ship
 * as one task pair — the tile's wording and the disclosures it leads to are the
 * same promise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockWallet = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet.current,
}))

const mockVaults = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnVaults', () => ({
  useEarnVaults: () => mockVaults.current,
  default: () => mockVaults.current,
}))

const mockPositions = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnPositions', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    positionKey: actual.positionKey,
    useEarnPositions: () => mockPositions.current,
    default: () => mockPositions.current,
  }
})

const mockRewards = vi.hoisted(() => ({ current: {} }))
vi.mock('../../hooks/useEarnRewards', () => ({
  useEarnRewards: () => mockRewards.current,
  default: () => mockRewards.current,
}))

// SupplyView is exercised by its own tests; here it stands in for "the Supply
// area rendered", so the hub's routing is tested without its data hooks.
vi.mock('../../components/earn/SupplyView', () => ({
  default: () => <div data-testid="supply-view">supply view</div>,
}))

import EarnPanel from '../../components/earn/EarnPanel'
import { NETWORKS } from '../../config/networks'
import { getContractAddressForChain } from '../../config/contracts'
import * as earnCopy from '../../lib/earn/earnCopy'
import {
  BRIDGE_LP_DISCLOSURE,
  BRIDGE_LP_RISK_SUMMARY,
  LIQUIDITY_AREA_DESC,
  LIQUIDITY_POOL_KIND,
  LIQUIDITY_TIPS,
  NO_POOLS_COPY,
  RETIRED_POOL_COPY,
  TRADING_LP_DISCLOSURE,
  TRADING_LP_RISK_SUMMARY,
  bridgeLiquidityNetworks,
  feeCeilingCopy,
  liquidityAvailabilityCopy,
  liquidityFeeCopy,
  liquidityUnavailableCopy,
  noPairCounterpartCopy,
  partialWithdrawalCopy,
  poolDisclosure,
  poolKindOf,
  poolRiskSummary,
  tradingLiquidityNetworks,
} from '../../lib/liquidity/liquidityCopy'

const USDC_VAULT = {
  address: '0x00000000000000000000000000000000000000a1',
  chainId: 137,
  name: 'Prime USDC Vault',
  symbol: 'mUSDC',
  asset: { address: '0xusdc', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  netApy: 0.043,
  apy: 0.031,
  rewards: [],
  totalAssetsUsd: 12_000_000,
  curator: 'Prime Curation',
}
const ETH_VAULT = {
  ...USDC_VAULT,
  address: '0x00000000000000000000000000000000000000a2',
  chainId: 1,
  name: 'Blue ETH Vault',
  asset: { address: '0xweth', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
}

function renderPanel(path = '/wallet?tab=earn') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EarnPanel />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // Active wallet network is MORDOR — earn is network-transparent, so the
  // multi-network list must render regardless.
  mockWallet.current = { chainId: 63, address: '0xac', isConnected: true }
  mockVaults.current = { vaults: [USDC_VAULT, ETH_VAULT], status: 'ready', refresh: vi.fn() }
  mockPositions.current = { positions: [], userStates: new Map(), status: 'ready', refresh: vi.fn() }
  mockRewards.current = {
    rewards: [],
    failedNetworks: [],
    status: 'ready',
    fetchedAt: Date.now(),
    totalClaimable: 0,
    claim: vi.fn(),
    claimState: { status: 'idle', chainId: null, txUrl: null, error: null },
    canTransactOn: () => true,
    cannotTransactReason: () => 'not available',
    legacyRewardsUrl: 'https://rewards-legacy.morpho.org/',
    refresh: vi.fn(),
  }
})

describe('EarnPanel hub (US1)', () => {
  it('shows every earning area live — Lend, Rewards, Stake, and Supply', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: /^Lend/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Rewards/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Stake/ })).toBeEnabled()
    // Spec 067 FR-003: Supply replaced the disabled "Bridges" placeholder.
    expect(screen.getByRole('button', { name: /^Supply/ })).toBeEnabled()
    expect(screen.getByText(LIQUIDITY_AREA_DESC)).toBeInTheDocument()
  })

  it('shows the docs link on the hub, with no Morpho attribution or risk disclosure yet', () => {
    renderPanel()
    expect(screen.queryByRole('link', { name: /powered by morpho/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/not guaranteed/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /earn guide/i })).toHaveAttribute(
      'href',
      expect.stringContaining('docs.FairWins.app'),
    )
  })

  it('displays protocol attribution and risk disclosure on the Lend view (FR-012)', () => {
    renderPanel('/wallet?tab=earn&view=lend')
    const attribution = screen.getByRole('link', { name: /powered by morpho/i })
    expect(attribution).toHaveAttribute('href', 'https://app.morpho.org')
    expect(screen.getByText(/not guaranteed/i)).toBeInTheDocument()
  })

  it('displays protocol attribution and risk disclosure on the Rewards view (FR-012)', () => {
    renderPanel('/wallet?tab=earn&view=rewards')
    const attribution = screen.getByRole('link', { name: /powered by morpho/i })
    expect(attribution).toHaveAttribute('href', 'https://app.morpho.org')
    expect(screen.getByText(/not guaranteed/i)).toBeInTheDocument()
  })

  it('does not brand the Stake or Supply views with Morpho attribution', () => {
    renderPanel('/wallet?tab=earn&view=stake')
    expect(screen.queryByRole('link', { name: /powered by morpho/i })).not.toBeInTheDocument()
    expect(screen.queryByText(earnCopy.EARN_DISCLOSURE.risk)).not.toBeInTheDocument()

    renderPanel('/wallet?tab=earn&view=supply')
    expect(screen.queryByRole('link', { name: /powered by morpho/i })).not.toBeInTheDocument()
    expect(screen.queryByText(earnCopy.EARN_DISCLOSURE.risk)).not.toBeInTheDocument()
  })
})

describe('EarnPanel Supply area (spec 067 FR-003/FR-039)', () => {
  it('no longer labels any Earn area "Bridges" — and never calls it "Pool"', () => {
    renderPanel()
    // No AREA is called "Bridges" any more. (The Supply tile's description
    // does say "trading or bridge pool" — bridge pools are one of the two
    // kinds — so this checks the area's NAME, which is what labels it.)
    expect(screen.queryByText('Bridges')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Bridges/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/bridge earning is not available/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/coming later/i)).not.toBeInTheDocument()
    // "Pool" belongs to Wager Pools (FR-039) and must not name an Earn area.
    expect(screen.queryByText('Pool')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pools?\b/i })).not.toBeInTheDocument()
    // The retired placeholder copy is gone from the module entirely.
    expect(earnCopy.EARN_AREAS_FUTURE).toBeUndefined()
  })

  it('opens the Supply view and records ?view=supply for back/forward', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /^Supply/ }))
    expect(screen.getByTestId('supply-view')).toBeInTheDocument()
    // Leaving the view returns to the hub.
    fireEvent.click(screen.getByRole('button', { name: /all earning options/i }))
    expect(screen.queryByTestId('supply-view')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Supply/ })).toBeEnabled()
  })

  it('lands directly on ?view=supply from a deep link', () => {
    renderPanel('/wallet?tab=earn&view=supply')
    expect(screen.getByTestId('supply-view')).toBeInTheDocument()
  })

  it('is NOT gated on the wallet’s active network (FR-059/FR-061)', () => {
    // Wallet is on Mordor, where no pool exists. Availability is per-pool and
    // the switch happens at signing, so the HUB still opens the area and hands
    // off to the pool list — it never stands in front of it with a "switch
    // networks first" instruction, which is the bug Phase 3 shipped on the
    // Bridge tab. (What the pool list itself says is SupplyView's own test;
    // here it is mocked, so this asserts the hub's half of the contract.)
    mockWallet.current = { chainId: 63, address: '0xac', isConnected: true }
    renderPanel('/wallet?tab=earn&view=supply')
    expect(screen.getByTestId('supply-view')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/your wallet is on/i)).not.toBeInTheDocument()
  })

  it('opens Supply with no wallet connected at all', () => {
    mockWallet.current = { chainId: null, address: null, isConnected: false }
    renderPanel('/wallet?tab=earn&view=supply')
    expect(screen.getByTestId('supply-view')).toBeInTheDocument()
  })
})

describe('EarnPanel network transparency (like the portfolio)', () => {
  it('lists vaults from EVERY earn network with their network names — no switch banner', () => {
    renderPanel('/wallet?tab=earn&view=lend')
    expect(screen.getByText('Prime USDC Vault')).toBeInTheDocument()
    expect(screen.getByText(/on Polygon/i)).toBeInTheDocument()
    expect(screen.getByText('Blue ETH Vault')).toBeInTheDocument()
    expect(screen.getByText(/on Ethereum/i)).toBeInTheDocument()
    // The old "switch network" interstitial is gone for good.
    expect(screen.queryByText(/your wallet is on/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument()
  })
})

describe('EarnPanel deep links (US3)', () => {
  it('lands on the lend view prefiltered by ?token= with a clear affordance', () => {
    renderPanel('/wallet?tab=earn&view=lend&chain=137&token=USDC')
    expect(screen.getByText('Prime USDC Vault')).toBeInTheDocument()
    expect(screen.queryByText('Blue ETH Vault')).not.toBeInTheDocument()
    // Clearing the filter restores the full list.
    fireEvent.click(screen.getByRole('button', { name: /USDC only/i }))
    expect(screen.getByText('Blue ETH Vault')).toBeInTheDocument()
  })

  it('lands on the rewards view via ?view=rewards', () => {
    renderPanel('/wallet?tab=earn&view=rewards')
    expect(screen.getByText(/nothing to claim yet/i)).toBeInTheDocument()
  })
})

// --------------------------------------------------------------------------
// T087 — liquidityCopy.js
// --------------------------------------------------------------------------

describe('liquidityCopy — pool kinds', () => {
  it('normalizes both kinds from labels and the contract enum', () => {
    expect(poolKindOf('TRADING_LP')).toBe(LIQUIDITY_POOL_KIND.TRADING_LP)
    expect(poolKindOf('trading_lp')).toBe(LIQUIDITY_POOL_KIND.TRADING_LP)
    expect(poolKindOf(2)).toBe(LIQUIDITY_POOL_KIND.TRADING_LP)
    expect(poolKindOf('BRIDGE_LP')).toBe(LIQUIDITY_POOL_KIND.BRIDGE_LP)
    expect(poolKindOf(1)).toBe(LIQUIDITY_POOL_KIND.BRIDGE_LP)
  })

  it('never guesses an unknown kind into a kind with a weaker disclosure', () => {
    // Unlisted (0) and anything unrecognized resolve to null, so a caller
    // cannot accidentally show the trading disclosure over a bridge deposit.
    expect(poolKindOf(0)).toBeNull()
    expect(poolKindOf('vault')).toBeNull()
    expect(poolKindOf(undefined)).toBeNull()
    expect(poolDisclosure('vault')).toBeNull()
    expect(poolRiskSummary(undefined)).toBeNull()
  })

  it('maps each kind to its own disclosure and risk summary (FR-017/FR-018/FR-019)', () => {
    expect(poolDisclosure('TRADING_LP')).toBe(TRADING_LP_DISCLOSURE)
    expect(poolDisclosure('BRIDGE_LP')).toBe(BRIDGE_LP_DISCLOSURE)
    expect(poolRiskSummary('TRADING_LP')).toBe(TRADING_LP_RISK_SUMMARY)
    expect(poolRiskSummary('BRIDGE_LP')).toBe(BRIDGE_LP_RISK_SUMMARY)
    expect(TRADING_LP_DISCLOSURE).not.toBe(BRIDGE_LP_DISCLOSURE)
  })
})

describe('liquidityCopy — impermanent loss, in plain words (FR-018)', () => {
  it('says the mix changes with price and can be worth less than holding', () => {
    expect(TRADING_LP_DISCLOSURE).toMatch(/mix of the two assets/i)
    expect(TRADING_LP_DISCLOSURE).toMatch(/changes with their prices/i)
    expect(TRADING_LP_DISCLOSURE).toMatch(/worth less than if you had simply held/i)
    // Both halves of the honest picture: fees MAY offset it, and may not.
    expect(TRADING_LP_DISCLOSURE).toMatch(/may make up that difference, or may not/i)
    expect(TRADING_LP_RISK_SUMMARY).toMatch(/worth less than simply holding/i)
  })

  it('uses no jargon a first-time supplier would have to look up', () => {
    for (const text of [TRADING_LP_DISCLOSURE, TRADING_LP_RISK_SUMMARY, LIQUIDITY_TIPS.impermanentLoss]) {
      expect(text).not.toMatch(/impermanent|divergence|arbitrage|rebalanc\w* your position|\bLP\b|\bIL\b/i)
    }
  })

  it('does not misrepresent the loss as a fee or as something FairWins controls', () => {
    expect(TRADING_LP_DISCLOSURE).toMatch(/it is not a fee/i)
    expect(TRADING_LP_DISCLOSURE).toMatch(/not something FairWins can prevent/i)
  })
})

describe('liquidityCopy — bridge pools (FR-019)', () => {
  it('names the protocol, the cross-chain rebalancing, and inventory-dependent withdrawal', () => {
    expect(BRIDGE_LP_DISCLOSURE).toMatch(/Across/)
    expect(BRIDGE_LP_DISCLOSURE).toMatch(/moves the pool’s funds between networks/i)
    expect(BRIDGE_LP_DISCLOSURE).toMatch(/withdrawal depends on what is available/i)
    expect(BRIDGE_LP_DISCLOSURE).toMatch(/only part of it straight away/i)
    expect(BRIDGE_LP_DISCLOSURE).toMatch(/not guaranteed/i)
  })

  it('offers partial-withdrawal wording that keeps the remainder the member’s (FR-022)', () => {
    const copy = partialWithdrawalCopy('120 USDC')
    expect(copy).toMatch(/120 USDC is available to withdraw right now/i)
    expect(copy).toMatch(/come back for the remainder/i)
    expect(copy).toMatch(/stays yours/i)
    expect(partialWithdrawalCopy()).toMatch(/only part of your share is available/i)
  })
})

describe('liquidityCopy — the platform fee (FR-028/FR-029/FR-030)', () => {
  it('discloses the RATE and what the rate applies to — never a figure off the gross', () => {
    const fee = liquidityFeeCopy({ kind: 'TRADING_LP', bps: 25, available: true })
    expect(fee.rate).toBe('0.25%')
    expect(fee.headline).toMatch(/FairWins platform fee: 0\.25%/)
    // The router quotes the fee AFTER the mint, against what Uniswap consumed.
    expect(fee.basis).toMatch(/charged on what actually goes into the pool/i)
    expect(fee.basis).toMatch(/never on the whole amount you offered/i)
    expect(fee.remainder).toMatch(/returned to your wallet in the same transaction, whole/i)
    expect(fee.remainder).toMatch(/no fee taken from it/i)
    expect(fee.withdrawal).toMatch(/no FairWins fee/i)
  })

  it('shows NO fee line for a bridge pool, even if a rate is configured (research R3)', () => {
    // Not a line reading 0.00% — that would imply a lever that does not exist.
    expect(liquidityFeeCopy({ kind: 'BRIDGE_LP', bps: 25, available: true })).toBeNull()
    expect(liquidityFeeCopy({ kind: 1, bps: 250, available: true })).toBeNull()
  })

  it('shows NO fee line at a zero or unreadable rate (FR-029)', () => {
    expect(liquidityFeeCopy({ kind: 'TRADING_LP', bps: 0, available: true })).toBeNull()
    expect(liquidityFeeCopy({ kind: 'TRADING_LP', bps: 25, available: false })).toBeNull()
    expect(liquidityFeeCopy()).toBeNull()
  })

  it('gives the net amount as a CEILING, since the exact fee is only known after the mint', () => {
    const line = feeCeilingCopy('2.50 USDC', '997.50 USDC')
    expect(line).toMatch(/If the pool takes everything you entered/i)
    expect(line).toMatch(/2\.50 USDC/)
    expect(line).toMatch(/997\.50 USDC goes into the pool/)
    expect(line).toMatch(/That is the most it can be/i)
    expect(line).toMatch(/charged only on what it actually takes/i)
    expect(line).toMatch(/comes back to your wallet whole/i)
    // Nothing to describe ⇒ no line, rather than an empty or invented figure.
    expect(feeCeilingCopy(null)).toBeNull()
  })

  it('never hardcodes a rate — the percentage comes from the caller’s live bps', () => {
    expect(liquidityFeeCopy({ kind: 'TRADING_LP', bps: 100 }).rate).toBe('1.00%')
    expect(liquidityFeeCopy({ kind: 'TRADING_LP', bps: 7 }).rate).toBe('0.07%')
  })
})

describe('liquidityCopy — availability is asymmetric (research R8, FR-025)', () => {
  it('offers bridge pools on Ethereum ONLY — the HubPool is an L1 contract', () => {
    expect(bridgeLiquidityNetworks().map((n) => n.chainId)).toEqual([1])
    // Ethereum is also the only network configured with a HubPool address, so
    // this cannot drift into "bridge pools everywhere" by a config edit
    // elsewhere: it is derived from that address, not asserted.
    expect(NETWORKS[137].bridge?.hubPool ?? null).toBeNull()
  })

  it('names a trading network only where the router is deployed, never on protocol addresses alone', () => {
    // ETC and Mordor carry ETCswap position managers for the swap surface and
    // no liquidity deployment — naming them would promise pools that are not
    // there. Nothing is deployed yet, so the list is empty and says so.
    const trading = tradingLiquidityNetworks().map((n) => n.chainId)
    expect(trading).not.toContain(61)
    expect(trading).not.toContain(63)
    for (const net of tradingLiquidityNetworks()) {
      expect(net.capabilities.liquidity).toBe(true)
      expect(getContractAddressForChain('liquidityRouter', net.chainId)).toBeTruthy()
    }
  })

  it('states the asymmetry in the copy rather than implying both kinds are everywhere', () => {
    const copy = liquidityAvailabilityCopy()
    expect(copy).toMatch(/Bridge pools are available on Ethereum only/i)
    // Trading availability tracks deployment: a roster while routers exist, an
    // honest "not set up yet" while none do — never a network that has none.
    const trading = tradingLiquidityNetworks()
    if (trading.length > 0) {
      expect(copy).toMatch(new RegExp(`Trading pools are available on .*${trading[0].name}`, 'i'))
    } else {
      expect(copy).toMatch(/No network is set up for trading pools in this build yet/i)
    }
    // The empty-list branch is honest too, never a silent blank.
    expect(NO_POOLS_COPY).toMatch(/no pools to supply right now/i)
    expect(NO_POOLS_COPY).toMatch(/Bridge pools are available on Ethereum only/i)
  })

  it('explains a network with no pools without telling the member to switch first', () => {
    const copy = liquidityUnavailableCopy(63) // Ethereum Classic Mordor
    expect(copy).toMatch(/no pools on Ethereum Classic Mordor/i)
    expect(copy).toMatch(/do not have to switch networks/i)
    expect(copy).toMatch(/switches over only when you confirm/i)
    // Ethereum always has pools to offer — its bridge pool needs no FairWins
    // deployment at all, so there is nothing to explain away there.
    expect(liquidityUnavailableCopy(1)).toBeNull()
  })

  it('answers Bitcoin from its string id, without a numeric network lookup (spec 061)', () => {
    const copy = liquidityUnavailableCopy('bitcoin')
    expect(copy).toMatch(/Bitcoin is not part of supplying/i)
    expect(copy).toMatch(/Bridge pools are available on Ethereum only/i)
  })
})

describe('liquidityCopy — pairs live on one network (FR-065)', () => {
  it('explains an empty counterpart list and names what would change it', () => {
    const copy = noPairCounterpartCopy('WETH', 'Base')
    expect(copy).toMatch(/two assets on the same network/i)
    expect(copy).toMatch(/WETH on Base/)
    expect(copy).toMatch(/Pick a different first asset, or fund another asset on Base/i)
  })
})

describe('liquidityCopy — a retired pool stays visible and withdrawable (FR-024)', () => {
  it('says closed to new deposits, never gone', () => {
    expect(RETIRED_POOL_COPY).toMatch(/closed to new deposits/i)
    expect(RETIRED_POOL_COPY).toMatch(/withdrawn at any time/i)
    expect(RETIRED_POOL_COPY).not.toMatch(/removed|no longer available|gone/i)
    expect(LIQUIDITY_TIPS.retiredPool).toMatch(/stays listed here/i)
  })
})
