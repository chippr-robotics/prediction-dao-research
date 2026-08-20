/**
 * SupplySheet tests (spec 067, US2 — T095/T096/T097/T099/T103/T153).
 *
 * The six things this suite exists to keep true:
 *
 *   1. THE PAIR RULE IS `samePair`, NOT `bridgeDest` (T103, FR-062, SC-021). A Uniswap pair
 *      lives on ONE network. Swapping the predicate — the Bridge surface's rule — has no loud
 *      failure: an impossible cross-network "pair" would assemble and reach the confirm step.
 *      The `pair selector` block below fails outright if that happens.
 *   2. THE DISCLOSURE IS A GATE, NOT A TOOLTIP (T096, FR-018/FR-019). It is rendered INLINE in
 *      the confirm step and the confirm control is unusable until it has been acknowledged.
 *   3. THE FEE IS DISCLOSED AS A RATE, NOT AS A FIGURE OFF THE GROSS (T095, FR-028). The
 *      router charges on what the pool actually consumed and refunds the rest whole, so the
 *      only honest scalar before the mint is a CEILING. A bridge pool shows NO fee line at all
 *      (research R3) and a zero rate shows none either (FR-029).
 *   4. WITHDRAWAL IS NEVER FEE-GATED AND WORKS ON A RETIRED POOL (T099, FR-021/FR-024), and a
 *      short-inventory exit says plainly that the remainder comes later (FR-022).
 *   5. THE SURFACE IS NOT GATED ON THE WALLET'S ACTIVE CHAIN; the switch happens at signing and
 *      is disclosed before the signature (T153, FR-061, SC-020).
 *   6. vitest-axe coverage of every step of both pool kinds.
 *
 * The chain seams (fee quote, submit-time pool re-read, ledger write, send rail) are mocked.
 * The pair predicate, the copy layer, and the call builders are NOT — the rule under test is
 * the rule the app ships.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

// ---- seams ---------------------------------------------------------------------------
const walletState = { address: '0x1111111111111111111111111111111111111111', chainId: 137 }
let portfolioHoldings = []
const sendOnChain = vi.fn()
const canTransactOn = vi.fn(() => true)

vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => walletState }))
vi.mock('../../hooks/usePortfolio', () => ({
  default: () => ({ holdings: portfolioHoldings, status: 'ready' }),
}))
vi.mock('../../hooks/useEarnSend', () => ({
  useEarnSend: () => ({
    sendOnChain,
    canTransactOn,
    cannotTransactReason: (id) => `Passkey accounts can't send transactions on chain ${id} yet.`,
    isPasskey: false,
  }),
  default: () => ({ sendOnChain, canTransactOn, cannotTransactReason: () => '', isPasskey: false }),
}))
vi.mock('../../hooks/useActivity', () => ({ useActivityOptional: () => ({ refresh: vi.fn() }) }))
vi.mock('../../utils/rpcProvider', () => ({ makeReadProvider: () => ({}) }))

const fetchFeeQuote = vi.fn()
vi.mock('../../lib/fees/feeQuote', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchFeeQuote: (...args) => fetchFeeQuote(...args),
}))

// Partial: the pair predicate, `buildSupplyCalls`, and the limit check all stay REAL — only
// the submit-time chain re-read is intercepted.
const readLiquidityPool = vi.fn()
vi.mock('../../lib/liquidity/liquidityRouter', async (importOriginal) => ({
  ...(await importOriginal()),
  readLiquidityPool: (...args) => readLiquidityPool(...args),
}))

const captureLiquidityAction = vi.fn(() => 'entry-1')
vi.mock('../../data/ledger/sources/liquidityLedgerSource', async (importOriginal) => ({
  ...(await importOriginal()),
  captureLiquidityAction: (...args) => captureLiquidityAction(...args),
}))

import SupplySheet from '../../components/earn/SupplySheet'
import { POOL_KIND } from '../../lib/liquidity/liquidityRouter'
import { LIQUIDITY_UNAVAILABLE, RETIRED_POOL_COPY } from '../../lib/liquidity/liquidityCopy'

// ---- fixtures ------------------------------------------------------------------------
const TOKENS = {
  usdc137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  weth137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  dai137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  usdc1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  weth1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
}

const opt = (chainId, address, symbol, name, decimals, networkName, balance = 100) => ({
  key: `${chainId}:${address.toLowerCase()}`,
  chainId,
  kind: 'erc20',
  address,
  symbol,
  name,
  decimals,
  networkName,
  balance,
})

/** WETH comes BEFORE DAI so the first eligible Polygon counterpart is deterministic. */
const ASSET_OPTIONS = [
  opt(137, TOKENS.usdc137, 'USDC', 'USD Coin', 6, 'Polygon'),
  opt(137, TOKENS.weth137, 'WETH', 'Wrapped Ether', 18, 'Polygon'),
  opt(137, TOKENS.dai137, 'DAI', 'Dai', 18, 'Polygon'),
  opt(1, TOKENS.usdc1, 'USDC', 'USD Coin', 6, 'Ethereum'),
  opt(1, TOKENS.weth1, 'WETH', 'Wrapped Ether', 18, 'Ethereum'),
]

const holding = (chainId, address, balanceRaw) => ({
  asset: { chainId, id: address, kind: 'erc20' },
  balanceRaw,
})

const tradingPool = (overrides = {}) => ({
  poolId: `0x${'11'.repeat(32)}`,
  kind: POOL_KIND.TRADING_LP,
  enabled: true,
  feeTier: 3000,
  token0: TOKENS.usdc137,
  token1: TOKENS.weth137,
  poolAddress: '0x00000000000000000000000000000000000000a1',
  maxDeposit0PerTx: 0n,
  maxDeposit1PerTx: 0n,
  chainId: 137,
  networkName: 'Polygon',
  token0Meta: { symbol: 'USDC', decimals: 6 },
  token1Meta: { symbol: 'WETH', decimals: 18 },
  routerAddress: '0x000000000000000000000000000000000000dEaD',
  positionManager: '0x0000000000000000000000000000000000000abc',
  ...overrides,
})

/**
 * The SAME pair, curated at a second fee tier — the ordinary Uniswap case (USDC/WETH exists at
 * 0.05% and 0.30%). Listed BEFORE `tradingPool()` wherever it is used, because "first match wins"
 * is exactly the bug the pool-identity test below exists to catch.
 */
const lowFeePool = () => ({
  ...tradingPool(),
  poolId: `0x${'55'.repeat(32)}`,
  feeTier: 500,
  poolAddress: '0x00000000000000000000000000000000000000a5',
})

const daiPool = () => ({
  ...tradingPool(),
  poolId: `0x${'22'.repeat(32)}`,
  token1: TOKENS.dai137,
  token1Meta: { symbol: 'DAI', decimals: 18 },
  poolAddress: '0x00000000000000000000000000000000000000a2',
})

const ethPool = () => ({
  ...tradingPool(),
  poolId: `0x${'33'.repeat(32)}`,
  chainId: 1,
  networkName: 'Ethereum',
  token0: TOKENS.usdc1,
  token1: TOKENS.weth1,
  poolAddress: '0x00000000000000000000000000000000000000a3',
})

const bridgePool = (overrides = {}) => ({
  poolId: `0x${'44'.repeat(32)}`,
  kind: POOL_KIND.BRIDGE_LP,
  enabled: true,
  feeTier: 0,
  token0: TOKENS.weth1,
  token1: '0x0000000000000000000000000000000000000000',
  poolAddress: '0xc186fA914353c44b2E33eBE05f21846F1048bEda',
  hubPool: '0xc186fA914353c44b2E33eBE05f21846F1048bEda',
  maxDeposit0PerTx: 0n,
  maxDeposit1PerTx: 0n,
  chainId: 1,
  networkName: 'Ethereum',
  token0Meta: { symbol: 'WETH', decimals: 18 },
  token1Meta: null,
  ...overrides,
})

const ONE = 10n ** 18n

/** A bridge position whose exit inventory can be short (FR-022). */
const bridgePosition = ({ isFull = true } = {}) => ({
  poolId: bridgePool().poolId,
  lpBalance: 2n * ONE,
  exchangeRate: ONE,
  currentValue: 2n * ONE,
  liquidReserves: isFull ? 10n * ONE : ONE / 2n,
  withdrawable: isFull
    ? { lpTokens: 2n * ONE, underlying: 2n * ONE, isFull: true }
    : { lpTokens: ONE / 2n, underlying: ONE / 2n, isFull: false },
})

const tradingPosition = () => ({
  poolId: tradingPool().poolId,
  tokenId: 42n,
  liquidity: 1_000_000n,
  amount0: 5_000_000n,
  amount1: ONE / 100n,
})

const openSelect = async (user, label) => {
  await user.click(screen.getByRole('button', { name: label }))
  return screen.findByRole('listbox', { name: label })
}

const optionTexts = (listbox) =>
  within(listbox)
    .getAllByRole('option')
    .map((el) => el.textContent)

const renderTrading = (props = {}) =>
  render(
    <SupplySheet
      pool={tradingPool()}
      pools={[tradingPool(), daiPool(), ethPool()]}
      assetOptions={ASSET_OPTIONS}
      positions={[]}
      onClose={() => {}}
      {...props}
    />,
  )

const renderBridge = (props = {}) =>
  render(
    <SupplySheet
      pool={bridgePool()}
      pools={[bridgePool()]}
      assetOptions={ASSET_OPTIONS}
      positions={[]}
      onClose={() => {}}
      {...props}
    />,
  )

/** Fill both legs of a trading pool and step to the confirm view. */
const toConfirm = async (user) => {
  await user.type(screen.getByLabelText('Amount (USDC)'), '10')
  await user.type(screen.getByLabelText('Amount (WETH)'), '0.01')
  await user.click(screen.getByRole('button', { name: /Review and confirm/i }))
  return screen.findByRole('button', { name: /Supply to this pool/i })
}

beforeEach(() => {
  walletState.address = '0x1111111111111111111111111111111111111111'
  walletState.chainId = 137
  portfolioHoldings = [
    holding(137, TOKENS.usdc137, 250_000_000n),
    holding(137, TOKENS.weth137, 5n * ONE),
    holding(137, TOKENS.dai137, 100n * ONE),
    holding(1, TOKENS.weth1, 5n * ONE),
  ]
  sendOnChain.mockReset().mockResolvedValue({ txHash: '0xabc' })
  canTransactOn.mockReset().mockReturnValue(true)
  // Default: no fee system on this network — pre-060 behavior, no fee line.
  fetchFeeQuote.mockReset().mockResolvedValue({ available: false, bps: 0, capBps: 0, routerAddress: null })
  readLiquidityPool.mockReset().mockImplementation(async () => tradingPool())
  captureLiquidityAction.mockClear()
})

// =========================================================================================
describe('SupplySheet — the pair selector (T097/T103, FR-062: samePair, never bridgeDest)', () => {
  it('restricts the counterpart list to the PINNED network', async () => {
    const user = userEvent.setup()
    renderTrading()

    const listbox = await openSelect(user, 'Paired with')
    const shown = optionTexts(listbox)

    // A pair lives on ONE network. Every counterpart is on Polygon…
    expect(shown.length).toBeGreaterThan(0)
    for (const text of shown) expect(text).toMatch(/Polygon/)
    // …and never on another one. `bridgeDest` here — the Bridge surface's rule — would offer
    // USDC on Ethereum instead, assembling a "pair" that spans two networks.
    expect(shown.some((t) => /Ethereum/.test(t))).toBe(false)
    expect(shown.some((t) => /WETH/.test(t))).toBe(true)
  })

  it('never offers the same asset on another network as a counterpart', async () => {
    const user = userEvent.setup()
    renderTrading()
    const listbox = await openSelect(user, 'Paired with')
    // USDC on Ethereum is exactly what `bridgeDest` would return for a USDC-on-Polygon pin.
    expect(optionTexts(listbox).some((t) => /USDC/.test(t) && /Ethereum/.test(t))).toBe(false)
  })

  it('offers only counterparts a curated pool actually pairs with the first asset', async () => {
    const user = userEvent.setup()
    // Only USDC/WETH is curated on Polygon now, so DAI must not be offered even though the
    // member holds it on the pinned network.
    render(
      <SupplySheet
        pool={tradingPool()}
        pools={[tradingPool(), ethPool()]}
        assetOptions={ASSET_OPTIONS}
        onClose={() => {}}
      />,
    )
    const listbox = await openSelect(user, 'Paired with')
    const shown = optionTexts(listbox)
    expect(shown.some((t) => /WETH/.test(t))).toBe(true)
    expect(shown.some((t) => /DAI/.test(t))).toBe(false)
  })

  it('shows the pinned network rather than only enforcing it (FR-062)', async () => {
    renderTrading()
    expect(await screen.findByTestId('supply-pin-hint')).toHaveTextContent(
      /Polygon is pinned — a trading pool holds both assets on one network/i,
    )
  })

  it('re-pins on a new first asset and CLEARS an invalidated second selection', async () => {
    const user = userEvent.setup()
    renderTrading()

    // Pick DAI (a valid Polygon counterpart) as the second leg.
    const pairList = await openSelect(user, 'Paired with')
    await user.click(within(pairList).getByRole('option', { name: /DAI/ }))
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('USDC / DAI')

    // Move the pin to Ethereum. DAI-on-Polygon can no longer be the counterpart.
    const firstList = await openSelect(user, 'First asset')
    await user.click(within(firstList).getByRole('option', { name: /USDC.*Ethereum/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('USDC / WETH'))
    expect(screen.getByTestId('supply-pin-hint')).toHaveTextContent(/Ethereum is pinned/i)

    // Back to Polygon: the stale DAI choice was CLEARED, not merely hidden, so the pair
    // resolves to the first eligible counterpart instead of springing back.
    const firstList2 = await openSelect(user, 'First asset')
    await user.click(within(firstList2).getByRole('option', { name: /USDC.*Polygon/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('USDC / WETH'))
  })

  it('explains an empty counterpart list instead of rendering a dead control (FR-065)', async () => {
    // The member holds the first leg but nothing it has a curated pool with on that network.
    render(
      <SupplySheet
        pool={ethPool()}
        pools={[ethPool()]}
        assetOptions={[ASSET_OPTIONS[3]]}
        onClose={() => {}}
      />,
    )
    expect(
      await screen.findByText(/you do not hold another one there that USDC has a curated pool with/i),
    ).toBeInTheDocument()
  })
})

// =========================================================================================
describe('SupplySheet — the disclosure GATE (T096, FR-018/FR-019)', () => {
  it('shows the impermanent-loss disclosure INLINE and blocks confirm until acknowledged', async () => {
    const user = userEvent.setup()
    renderTrading()
    const confirm = await toConfirm(user)

    // Visible inline in the confirm step — not behind a tooltip.
    expect(
      screen.getByText(/the pool ends up holding more of whichever asset has fallen/i),
    ).toBeVisible()
    expect(screen.getByText(/can be worth less than if you had simply held/i)).toBeVisible()

    expect(confirm).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    expect(confirm).toBeEnabled()
  })

  it('shows the rebalancing + inventory disclosure for a bridge pool and gates on it', async () => {
    const user = userEvent.setup()
    renderBridge()
    await user.type(screen.getByLabelText('Amount (WETH)'), '1')
    await user.click(screen.getByRole('button', { name: /Review and confirm/i }))

    const confirm = await screen.findByRole('button', { name: /Supply to this pool/i })
    expect(screen.getByText(/moves the pool’s funds between networks as demand shifts/i)).toBeVisible()
    expect(screen.getByText(/withdrawal depends on what is available when you ask/i)).toBeVisible()

    expect(confirm).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    expect(confirm).toBeEnabled()
  })

  it('re-arms the gate when the member goes back to change the amount', async () => {
    const user = userEvent.setup()
    renderTrading()
    await toConfirm(user)
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /^Back$/ }))
    await user.click(screen.getByRole('button', { name: /Review and confirm/i }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Supply to this pool/i })).toBeDisabled()
  })
})

// =========================================================================================
describe('SupplySheet — the fee disclosure (T095, FR-028/FR-029, research R3)', () => {
  it('discloses the RATE and what it applies to — never a figure taken off the gross', async () => {
    fetchFeeQuote.mockResolvedValue({ available: true, bps: 50, capBps: 250, routerAddress: '0xfee' })
    const user = userEvent.setup()
    renderTrading()
    await toConfirm(user)

    const feeLine = screen.getByTestId('supply-fee-line')
    expect(within(feeLine).getByText('0.50%')).toBeInTheDocument()
    // The basis: charged on what the pool actually took, not on what was offered.
    expect(
      within(feeLine).getByText(/charged on what actually goes into the pool/i),
    ).toBeInTheDocument()
    expect(
      within(feeLine).getByText(/never on the whole amount you offered/i),
    ).toBeInTheDocument()
    // The only honest scalar before the mint is a CEILING, and it says so.
    expect(within(feeLine).getByText(/That is the most it can be/i)).toBeInTheDocument()
    // The remainder comes back whole, with no fee on it.
    expect(within(feeLine).getByText(/returned to your wallet in the same transaction, whole/i)).toBeInTheDocument()
  })

  it('shows NO fee line at all for a bridge pool — not even a zero one (research R3)', async () => {
    // Even if a rate were configured on this chain, the bridge path never routes through the
    // router, so there is nothing to charge and no line to show.
    fetchFeeQuote.mockResolvedValue({ available: true, bps: 50, capBps: 250, routerAddress: '0xfee' })
    const user = userEvent.setup()
    renderBridge()
    await user.type(screen.getByLabelText('Amount (WETH)'), '1')
    await user.click(screen.getByRole('button', { name: /Review and confirm/i }))
    await screen.findByRole('button', { name: /Supply to this pool/i })

    expect(screen.queryByTestId('supply-fee-line')).not.toBeInTheDocument()
    expect(screen.queryByText(/0\.00%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/FairWins platform fee/i)).not.toBeInTheDocument()
    // …and it says WHY it is free, rather than leaving a silent absence.
    expect(screen.getByTestId('supply-fee-free')).toHaveTextContent(/carries no FairWins fee/i)
    // A bridge pool never even asks for a rate.
    expect(fetchFeeQuote).not.toHaveBeenCalled()
  })

  it('shows no fee line at a zero rate (FR-029 — identical to no fee configured)', async () => {
    fetchFeeQuote.mockResolvedValue({ available: true, bps: 0, capBps: 250, routerAddress: '0xfee' })
    const user = userEvent.setup()
    renderTrading()
    await toConfirm(user)
    expect(screen.queryByTestId('supply-fee-line')).not.toBeInTheDocument()
    expect(screen.queryByText(/0\.00%/)).not.toBeInTheDocument()
  })

  it('passes the disclosed rate through as the on-chain ceiling (FR-028)', async () => {
    fetchFeeQuote.mockResolvedValue({ available: true, bps: 50, capBps: 250, routerAddress: '0xfee' })
    const user = userEvent.setup()
    renderTrading()
    const confirm = await toConfirm(user)
    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm)

    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
    expect(captureLiquidityAction).toHaveBeenCalledWith(
      walletState.address,
      137,
      expect.objectContaining({ type: 'supply', feeBps: 50 }),
    )
  })

  it('refuses to supply — but not to withdraw — when the live rate cannot be read', async () => {
    fetchFeeQuote.mockRejectedValue(new Error('rpc down'))
    const user = userEvent.setup()
    renderTrading({ positions: [tradingPosition()] })

    expect(await screen.findByText(LIQUIDITY_UNAVAILABLE.fees)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review and confirm/i })).toBeDisabled()

    // The exit is unaffected: withdrawal carries no platform fee, so an unreadable rate can
    // never stand between a member and their money (FR-021/FR-030).
    const withdrawTab = screen.getByRole('tab', { name: /Withdraw/i })
    expect(withdrawTab).toBeEnabled()
    await user.click(withdrawTab)
    expect(screen.getByRole('button', { name: /Withdraw USDC/i })).toBeEnabled()
    expect(screen.queryByTestId('supply-fee-line')).not.toBeInTheDocument()
  })
})

// =========================================================================================
// =========================================================================================
// The pool facts (FR-017). These moved OFF the list row when it became a dense, scannable
// summary. They did not get dropped on the way — that is the whole point of this block: the
// sheet is where the estimated return, the pool's total, and the kind-specific risk are
// stated, above the tabs, so they are read BEFORE an amount is typed rather than after.
// =========================================================================================
describe('SupplySheet — the pool facts the row is too dense to carry (FR-017)', () => {
  it('states the estimated return, the total supplied, and the trading-pool risk', () => {
    // The pool has to be enriched in `pools` too: the sheet re-resolves the pool from the
    // curated list as the pair selection changes, so a display-only override on `pool`
    // alone would be replaced the moment it did.
    const enriched = tradingPool({
      protocol: 'Uniswap',
      estimatedReturnApr: 0.052,
      totalSuppliedLabel: '1.2M USDC + 340 WETH',
    })
    renderTrading({ pool: enriched, pools: [enriched, daiPool(), ethPool()] })

    expect(screen.getByText('5.20%')).toBeInTheDocument()
    expect(screen.getByText('1.2M USDC + 340 WETH')).toBeInTheDocument()
    expect(
      screen.getByText(/mix of the two assets you get back changes with their prices/i),
    ).toBeInTheDocument()
    // And where the pool lives, which the row states in shorthand.
    expect(screen.getByText(/Uniswap · On Polygon · 0.30% pool fee/)).toBeInTheDocument()
  })

  it('states the bridge-pool risk instead, which is about inventory, not price', () => {
    walletState.chainId = 1
    renderBridge({ pool: bridgePool({ protocol: 'Across', totalSuppliedLabel: '8.4M WETH' }) })

    expect(screen.getByText('8.4M WETH')).toBeInTheDocument()
    expect(screen.getByText(/Across moves this pool’s funds between networks/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/mix of the two assets you get back changes/i),
    ).not.toBeInTheDocument()
  })

  it('says WHY a figure is missing rather than filling it in (FR-054)', () => {
    // The ordinary case: neither protocol publishes a realised return we can read.
    renderTrading()

    expect(
      screen.getByText(/we would rather show nothing than a figure we cannot source/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/could not read this pool’s total just now/i)).toBeInTheDocument()
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument()
  })

  it('closes the amount fields on a PAUSED router and names the pause as one', async () => {
    // The pause is the list's reading, carried on the pool. Without it the sheet would
    // offer a deposit the list already knew would revert.
    const paused = tradingPool({ unavailableReason: 'paused' })
    renderTrading({ pool: paused, pools: [paused, daiPool(), ethPool()] })

    expect(await screen.findByText(LIQUIDITY_UNAVAILABLE.paused)).toBeInTheDocument()
    expect(screen.queryByText(RETIRED_POOL_COPY)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount (USDC)')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Review and confirm/i })).toBeDisabled()
  })
})

describe('SupplySheet — add-to and withdraw (T099, FR-021/FR-022/FR-024/FR-030)', () => {
  it('offers "Add to position" once the member holds one', async () => {
    renderTrading({ positions: [tradingPosition()] })
    expect(await screen.findByRole('tab', { name: /Add to position/i })).toBeInTheDocument()
  })

  it('keeps a RETIRED pool visible and withdrawable while closing new deposits (FR-024)', async () => {
    const user = userEvent.setup()
    render(
      <SupplySheet
        pool={tradingPool({ enabled: false })}
        pools={[tradingPool({ enabled: false })]}
        assetOptions={ASSET_OPTIONS}
        positions={[tradingPosition()]}
        onClose={() => {}}
      />,
    )

    // Still listed, and it says what retirement means for money already inside.
    expect(await screen.findByText(RETIRED_POOL_COPY)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review and confirm/i })).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: /Withdraw/i }))
    const exit = screen.getByRole('button', { name: /Withdraw USDC/i })
    expect(exit).toBeEnabled()
    await user.click(exit)
    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
    // Straight to Uniswap's position manager — never through the FairWins router, so no
    // platform state can gate the exit.
    const [, calls] = sendOnChain.mock.calls[0]
    for (const call of calls) expect(call.target).toBe(tradingPool().positionManager)
    expect(captureLiquidityAction).toHaveBeenCalledWith(
      walletState.address,
      137,
      expect.objectContaining({ type: 'withdraw' }),
    )
  })

  it('states that withdrawing is never fee-charged', async () => {
    const user = userEvent.setup()
    renderTrading({ positions: [tradingPosition()] })
    await user.click(screen.getByRole('tab', { name: /Withdraw/i }))
    expect(screen.getByTestId('supply-withdraw-free')).toHaveTextContent(
      /Withdrawing never carries a FairWins fee/i,
    )
  })

  it('lets a member take what inventory can fill now and says the rest comes later (FR-022)', async () => {
    const user = userEvent.setup()
    walletState.chainId = 1
    render(
      <SupplySheet
        pool={bridgePool()}
        pools={[bridgePool()]}
        assetOptions={ASSET_OPTIONS}
        positions={[bridgePosition({ isFull: false })]}
        onClose={() => {}}
      />,
    )
    await user.click(screen.getByRole('tab', { name: /Withdraw/i }))

    expect(screen.getByTestId('supply-partial-note')).toHaveTextContent(
      /available to withdraw right now, because the rest of this pool is currently lent out/i,
    )
    expect(screen.getByTestId('supply-partial-note')).toHaveTextContent(
      /come back for the remainder shortly/i,
    )

    // Max takes exactly what is available now — never an amount the HubPool would reject.
    await user.click(screen.getByRole('button', { name: 'Max' }))
    expect(screen.getByLabelText('Amount (WETH)')).toHaveValue('0.5')
    await user.click(screen.getByRole('button', { name: /Withdraw WETH/i }))
    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
    const [chainId, calls] = sendOnChain.mock.calls[0]
    expect(chainId).toBe(1)
    // One call, straight to the HubPool: `removeLiquidity` needs no approval and no router.
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe(bridgePool().hubPool)
  })

  it('refuses more than inventory can fill, with the reason rather than a revert', async () => {
    const user = userEvent.setup()
    walletState.chainId = 1
    render(
      <SupplySheet
        pool={bridgePool()}
        pools={[bridgePool()]}
        assetOptions={ASSET_OPTIONS}
        positions={[bridgePosition({ isFull: false })]}
        onClose={() => {}}
      />,
    )
    await user.click(screen.getByRole('tab', { name: /Withdraw/i }))
    await user.type(screen.getByLabelText('Amount (WETH)'), '2')
    await user.click(screen.getByRole('button', { name: /Withdraw WETH/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/available to withdraw right now/i)
    expect(sendOnChain).not.toHaveBeenCalled()
  })

  it('disables the withdraw tab only when there is genuinely nothing to withdraw', () => {
    renderTrading()
    expect(screen.getByRole('tab', { name: /Withdraw/i })).toBeDisabled()
  })
})

// =========================================================================================
describe('SupplySheet — the signing-time network switch (T153, FR-061)', () => {
  it('never gates the surface on the wallet’s active chain', async () => {
    walletState.chainId = 1 // wallet on Ethereum, pool on Polygon
    const user = userEvent.setup()
    renderTrading()

    // Fully usable: no "switch networks first" prerequisite anywhere.
    expect(screen.getByLabelText('Amount (USDC)')).toBeEnabled()
    await toConfirm(user)
    expect(screen.getByRole('button', { name: /Supply to this pool/i })).toBeInTheDocument()
  })

  it('discloses the switch BEFORE the signature and performs it at submit', async () => {
    walletState.chainId = 1
    const user = userEvent.setup()
    renderTrading()
    const confirm = await toConfirm(user)

    expect(
      screen.getByText(/It will switch to Polygon when you confirm/i),
    ).toBeVisible()

    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm)
    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
    // The send targets the POOL's chain; `useEarnSend` owns the switch itself.
    expect(sendOnChain.mock.calls[0][0]).toBe(137)
  })

  it('says nothing about a switch when the wallet chain is not yet known', async () => {
    walletState.chainId = undefined
    const user = userEvent.setup()
    renderTrading()
    await toConfirm(user)
    expect(screen.queryByText(/It will switch to/i)).not.toBeInTheDocument()
  })
})

// =========================================================================================
describe('SupplySheet — submit-time honesty', () => {
  it('refuses a pool retired between opening the sheet and signing', async () => {
    readLiquidityPool.mockResolvedValue(tradingPool({ enabled: false }))
    const user = userEvent.setup()
    renderTrading()
    const confirm = await toConfirm(user)
    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(RETIRED_POOL_COPY))
    expect(sendOnChain).not.toHaveBeenCalled()
  })

  it('refuses rather than guessing when the listing cannot be re-read', async () => {
    readLiquidityPool.mockResolvedValue(null)
    const user = userEvent.setup()
    renderTrading()
    const confirm = await toConfirm(user)
    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(LIQUIDITY_UNAVAILABLE.router))
    expect(sendOnChain).not.toHaveBeenCalled()
  })

  it('requires both legs of a trading pool and says why', async () => {
    const user = userEvent.setup()
    renderTrading()
    await user.type(screen.getByLabelText('Amount (USDC)'), '10')
    await user.click(screen.getByRole('button', { name: /Review and confirm/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /A trading pool takes both assets together/i,
    )
  })

  it('refuses an amount above the pool’s per-transaction ceiling (FR-045)', async () => {
    const user = userEvent.setup()
    render(
      <SupplySheet
        pool={tradingPool({ maxDeposit0PerTx: 1_000_000n })}
        pools={[tradingPool({ maxDeposit0PerTx: 1_000_000n })]}
        assetOptions={ASSET_OPTIONS}
        onClose={() => {}}
      />,
    )
    await user.type(screen.getByLabelText('Amount (USDC)'), '10')
    await user.type(screen.getByLabelText('Amount (WETH)'), '0.01')
    await user.click(screen.getByRole('button', { name: /Review and confirm/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /more than the pool accepts in a single deposit/i,
    )
  })

  it('never sends a bridge deposit through the FairWins router (research R3)', async () => {
    const user = userEvent.setup()
    walletState.chainId = 1
    renderBridge()
    await user.type(screen.getByLabelText('Amount (WETH)'), '1')
    await user.click(screen.getByRole('button', { name: /Review and confirm/i }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Supply to this pool/i }))

    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
    const [, calls] = sendOnChain.mock.calls[0]
    const targets = calls.map((c) => String(c.target).toLowerCase())
    expect(targets).toContain(bridgePool().hubPool.toLowerCase())
    expect(targets).not.toContain(tradingPool().routerAddress.toLowerCase())
    // The listing is never re-read through the router on this path — it is not in it.
    expect(readLiquidityPool).not.toHaveBeenCalled()
  })
})

// =========================================================================================
describe('SupplySheet — accessibility', () => {
  it('has no axe violations on the trading amount step', async () => {
    const { container } = renderTrading()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations on the trading confirm step (the disclosure gate)', async () => {
    const user = userEvent.setup()
    const { container } = renderTrading()
    await toConfirm(user)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations on the bridge confirm step', async () => {
    const user = userEvent.setup()
    const { container } = renderBridge()
    await user.type(screen.getByLabelText('Amount (WETH)'), '1')
    await user.click(screen.getByRole('button', { name: /Review and confirm/i }))
    await screen.findByRole('button', { name: /Supply to this pool/i })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations on the withdraw step', async () => {
    const user = userEvent.setup()
    const { container } = renderTrading({ positions: [tradingPosition()] })
    await user.click(screen.getByRole('tab', { name: /Withdraw/i }))
    expect(await axe(container)).toHaveNoViolations()
  })
})

// =========================================================================================
describe('SupplySheet — the pool a member opened is the pool they supply', () => {
  /*
   * Found by the spec-067 e2e flow (issue #1236): with two curated pools for one pair, the
   * sheet re-resolved the pool from the selected PAIR and took the first match — so opening the
   * 0.30% row and pressing Supply deposited into the 0.05% pool. Every figure on the confirm
   * step described one pool and the signature went to another, silently, on a money path.
   */
  it('supplies the OPENED pool when the pair is curated at more than one fee tier', async () => {
    const user = userEvent.setup()
    const opened = tradingPool() // 0.30%
    render(
      <SupplySheet
        pool={opened}
        pools={[lowFeePool(), opened, daiPool(), ethPool()]}
        assetOptions={ASSET_OPTIONS}
        positions={[]}
        onClose={() => {}}
      />,
    )

    // What the member is being told about, before they type anything.
    expect(await screen.findByText(/0\.30% pool fee/)).toBeInTheDocument()

    const confirm = await toConfirm(user)
    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm)

    // The signing-time re-read names the pool the signature will go to. It must be the one
    // whose facts were on screen — not `lowFeePool`, which pairs the same two assets.
    await waitFor(() => expect(readLiquidityPool).toHaveBeenCalled())
    expect(readLiquidityPool.mock.calls[0][0]).toEqual(
      expect.objectContaining({ poolAddress: opened.poolAddress }),
    )
    expect(readLiquidityPool.mock.calls[0][0].poolAddress).not.toBe(lowFeePool().poolAddress)
  })

  it('still follows the member to another pool when they CHANGE the pair', async () => {
    // The resolution this replaces exists for a real case, and it keeps working: pick a
    // different counterpart and the sheet moves to the pool that actually holds that pair.
    const user = userEvent.setup()
    render(
      <SupplySheet
        pool={tradingPool()}
        pools={[tradingPool(), daiPool(), ethPool()]}
        assetOptions={ASSET_OPTIONS}
        positions={[]}
        onClose={() => {}}
      />,
    )
    const listbox = await openSelect(user, 'Paired with')
    await user.click(within(listbox).getByRole('option', { name: /DAI/ }))
    expect(await screen.findByLabelText('Amount (DAI)')).toBeInTheDocument()
  })
})

// =========================================================================================
describe('SupplySheet — a spent position never hides a live one (FR-021/FR-024)', () => {
  /*
   * Also found by the spec-067 e2e flow: supplying twice mints a SECOND position NFT, and a
   * position withdrawn to zero is kept rather than deleted. Matching the pool's position by
   * first-match meant the emptied one shadowed the live one, and the sheet told a member with
   * money in the pool that they had nothing to withdraw — on the one path the spec says is
   * always open.
   */
  const spentPosition = () => ({ ...tradingPosition(), tokenId: 41n, liquidity: 0n })

  it('offers the exit when an emptied position is listed BEFORE a live one', async () => {
    const user = userEvent.setup()
    renderTrading({ positions: [spentPosition(), tradingPosition()] })

    const withdrawTab = screen.getByRole('tab', { name: /Withdraw/i })
    expect(withdrawTab).toBeEnabled()
    await user.click(withdrawTab)

    await user.click(screen.getByRole('button', { name: /Withdraw USDC/i }))
    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
    // And it exits the LIVE position — token 42 — not the empty one it was shadowed by.
    const [, calls] = sendOnChain.mock.calls[0]
    expect(calls.length).toBeGreaterThan(1) // decreaseLiquidity + collect: there IS liquidity
  })

  it('still shows a fully-withdrawn position as nothing to withdraw', async () => {
    // The change is about ORDERING, not about pretending an empty position is not empty.
    renderTrading({ positions: [spentPosition()] })
    expect(screen.getByRole('tab', { name: /Withdraw/i })).toBeDisabled()
  })
})
