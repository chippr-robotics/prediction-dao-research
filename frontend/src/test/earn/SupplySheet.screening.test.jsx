/**
 * SupplySheet — sanctions screening and the restricted-account policy
 * (spec 067, US3 — T116/T120/T154/T155; FR-032/FR-033, SC-013).
 *
 * Four things this suite exists to keep true:
 *
 *   1. A DENY-LISTED WALLET CANNOT SUPPLY. Refused before any signature, on both pool
 *      kinds — and on the BRIDGE-LP path most of all: that deposit is a direct HubPool
 *      call with no FairWins contract in it, so this client-side screen is the ONLY
 *      screen standing there.
 *   2. THE REFUSAL BITES AT SUBMISSION, NOT ONLY AT DISPLAY. The interesting case is the
 *      wallet that screened clear when the sheet opened and was listed while the member
 *      read the disclosure: tapping "Supply" must re-read the verdict past the cache and
 *      stop there. A screen that only ran at render would sign that deposit.
 *   3. AN UNSCREENABLE WALLET IS NOT A FLAGGED ONE. The SanctionsGuard is not deployed on
 *      every pooling network (Ethereum, where every bridge pool lives, has none), so
 *      'uncertain' blocks nothing. Refusing there would refuse everyone on no evidence.
 *      It is also no longer ANNOUNCED: the pools are a curated list of protocol contracts,
 *      not counterparties a member picked, so "we could not screen this network" was a
 *      warning about a risk the deposit in front of them does not carry.
 *   4. A RESTRICTED MEMBER STILL SEES AND STILL EXITS (FR-033). New value in is refused;
 *      the position figures, the Withdraw tab, and the withdrawal itself are untouched.
 *      Refusing new money is correct; trapping money that is already theirs is not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

/**
 * The ONE screening path, mocked at the hook the whole platform screens through.
 * `verdict` is mutable so a test can list the wallet BETWEEN the sheet opening and the
 * tap — which is the timing FR-032 is about.
 */
let verdict = 'clear'
const screenOne = vi.fn(async () => verdict)
vi.mock('../../hooks/useAddressScreening', () => ({
  useAddressScreening: () => ({
    screenOne: (...args) => screenOne(...args),
    getStatus: () => 'clear',
    screen: vi.fn(),
    anyRestricted: () => false,
  }),
}))

const fetchFeeQuote = vi.fn()
vi.mock('../../lib/fees/feeQuote', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchFeeQuote: (...args) => fetchFeeQuote(...args),
}))

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

// ---- fixtures --------------------------------------------------------------------------
const TOKENS = {
  usdc137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  weth137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  weth1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
}
const ONE = 10n ** 18n

const opt = (chainId, address, symbol, decimals, networkName) => ({
  key: `${chainId}:${address.toLowerCase()}`,
  chainId,
  kind: 'erc20',
  address,
  symbol,
  name: symbol,
  decimals,
  networkName,
  balance: 100,
})

const ASSET_OPTIONS = [
  opt(137, TOKENS.usdc137, 'USDC', 6, 'Polygon'),
  opt(137, TOKENS.weth137, 'WETH', 18, 'Polygon'),
  opt(1, TOKENS.weth1, 'WETH', 18, 'Ethereum'),
]

const holding = (chainId, address, balanceRaw) => ({
  asset: { chainId, id: address, kind: 'erc20' },
  balanceRaw,
})

const tradingPool = () => ({
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
})

const bridgePool = () => ({
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
})

/** An open bridge-pool position — the money a restricted member must still be able to exit. */
const bridgePosition = () => ({
  poolId: bridgePool().poolId,
  lpBalance: 2n * ONE,
  exchangeRate: ONE,
  currentValue: 2n * ONE,
  liquidReserves: 10n * ONE,
  withdrawable: { lpTokens: 2n * ONE, underlying: 2n * ONE, isFull: true },
})

const renderTrading = (props = {}) =>
  render(
    <SupplySheet
      pool={tradingPool()}
      pools={[tradingPool()]}
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

const reviewButton = () => screen.getByRole('button', { name: /Review and confirm/i })

/** Fill both legs of a trading pool and step to the confirm view. */
const tradingToConfirm = async (user) => {
  await user.type(screen.getByLabelText('Amount (USDC)'), '10')
  await user.type(screen.getByLabelText('Amount (WETH)'), '0.01')
  await user.click(reviewButton())
  return screen.findByRole('button', { name: /Supply to this pool/i })
}

/** Fill the single leg of a bridge pool and step to the confirm view. */
const bridgeToConfirm = async (user) => {
  await user.type(screen.getByLabelText('Amount (WETH)'), '1')
  await user.click(reviewButton())
  return screen.findByRole('button', { name: /Supply to this pool/i })
}

/** Tick the disclosure gate, which is a prerequisite of every supply. */
const acknowledge = async (user) => {
  await user.click(screen.getByRole('checkbox'))
}

beforeEach(() => {
  verdict = 'clear'
  screenOne.mockClear()
  walletState.address = '0x1111111111111111111111111111111111111111'
  walletState.chainId = 137
  portfolioHoldings = [
    holding(137, TOKENS.usdc137, 250_000_000n),
    holding(137, TOKENS.weth137, 5n * ONE),
    holding(1, TOKENS.weth1, 5n * ONE),
  ]
  sendOnChain.mockReset().mockResolvedValue({ txHash: '0xabc' })
  canTransactOn.mockReset().mockReturnValue(true)
  fetchFeeQuote.mockReset().mockResolvedValue({ available: false, bps: 0, capBps: 0, routerAddress: null })
  readLiquidityPool.mockReset().mockImplementation(async () => tradingPool())
  captureLiquidityAction.mockClear()
})

// =========================================================================================
describe('SupplySheet — screening the acting wallet (T116/T120, FR-032)', () => {
  it('screens the ACTING wallet against the POOL’s network, not the wallet’s current one', async () => {
    renderBridge()
    await waitFor(() => expect(screenOne).toHaveBeenCalled())
    const [address, chainId] = screenOne.mock.calls[0]
    expect(address).toBe(walletState.address)
    // The pool is on Ethereum; the wallet is on Polygon until the signing-time switch.
    expect(chainId).toBe(1)
  })

  it('refuses a deny-listed wallet before any signature is possible (trading pool)', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    renderTrading()

    expect(await screen.findByTestId('supply-screening-refusal')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Amount (USDC)'), '10')
    await user.type(screen.getByLabelText('Amount (WETH)'), '0.01')
    expect(reviewButton()).toBeDisabled()
    expect(sendOnChain).not.toHaveBeenCalled()
  })

  it('refuses a deny-listed wallet on the bridge-LP path, where no on-chain guard follows', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    renderBridge()

    expect(await screen.findByTestId('supply-screening-refusal')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Amount (WETH)'), '1')
    expect(reviewButton()).toBeDisabled()
    expect(sendOnChain).not.toHaveBeenCalled()
  })

  it('refuses a wallet listed BETWEEN the confirm step and the tap (SC-013 — bridge-LP)', async () => {
    const user = userEvent.setup()
    renderBridge()
    const supply = await bridgeToConfirm(user) // reached while clear…
    await acknowledge(user)
    expect(supply).toBeEnabled()

    verdict = 'restricted' // …and listed while the disclosure was being read
    await user.click(supply)

    // The refusal only exists because the SUBMIT path re-screened: the verdict was
    // 'clear' at every render up to this tap.
    await waitFor(() => expect(screen.getByTestId('supply-screening-refusal')).toBeInTheDocument())
    expect(sendOnChain).not.toHaveBeenCalled()
    expect(captureLiquidityAction).not.toHaveBeenCalled()
  })

  it('refuses a wallet listed BETWEEN the confirm step and the tap (SC-013 — trading pool)', async () => {
    const user = userEvent.setup()
    renderTrading()
    const supply = await tradingToConfirm(user)
    await acknowledge(user)
    expect(supply).toBeEnabled()

    verdict = 'restricted'
    await user.click(supply)

    await waitFor(() => expect(screen.getByTestId('supply-screening-refusal')).toBeInTheDocument())
    // The submit-time pool re-read never even happened: the refusal comes first.
    expect(readLiquidityPool).not.toHaveBeenCalled()
    expect(sendOnChain).not.toHaveBeenCalled()
  })

  it('re-reads the verdict live at submission rather than trusting the cached one', async () => {
    const user = userEvent.setup()
    renderBridge()
    const supply = await bridgeToConfirm(user)
    await acknowledge(user)
    screenOne.mockClear()

    await user.click(supply)

    await waitFor(() => expect(screenOne).toHaveBeenCalled())
    const [, chainId, options] = screenOne.mock.calls[0]
    expect(chainId).toBe(1)
    expect(options).toMatchObject({ force: true })
  })

  it('treats an unscreenable wallet as an unknown, never as a flagged one', async () => {
    verdict = 'uncertain'
    const user = userEvent.setup()
    renderBridge()

    await waitFor(() => expect(screenOne).toHaveBeenCalled())
    expect(screen.queryByTestId('supply-screening-refusal')).not.toBeInTheDocument()

    const supply = await bridgeToConfirm(user)
    await acknowledge(user)
    await user.click(supply)
    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
  })

  it('says NOTHING about an unscreenable network — a curated pool has no counterparty to warn about', async () => {
    verdict = 'uncertain'
    renderBridge()

    await waitFor(() => expect(screenOne).toHaveBeenCalled())
    // The old notice ("screening could not be run on this network…") read as a warning
    // about a deposit into a curated protocol contract, which is not a counterparty a
    // member chose. Point 3 above is unchanged — an unknown is still never a refusal —
    // but an unknown that changes nothing is not disclosed as though it did.
    expect(screen.queryByTestId('supply-screening-unavailable')).not.toBeInTheDocument()
    expect(screen.queryByText(/sanctions screening/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pre-checked/i)).not.toBeInTheDocument()
  })
})

// =========================================================================================
describe('SupplySheet — the restricted-account policy (T154/T155, FR-033)', () => {
  it('lets a restricted member SEE the position they already hold', async () => {
    verdict = 'restricted'
    renderBridge({ positions: [bridgePosition()] })

    await screen.findByTestId('supply-screening-refusal')
    // The exit is offered, not hidden behind the refusal.
    expect(screen.getByRole('tab', { name: /Withdraw/i })).toBeEnabled()
  })

  it('lets a restricted member EXIT: the withdrawal still signs and sends', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    renderBridge({ positions: [bridgePosition()] })

    await screen.findByTestId('supply-screening-refusal')
    await user.click(screen.getByRole('tab', { name: /Withdraw/i }))

    // The figures a member needs in order to decide are all readable.
    expect(screen.getByText(/Available to withdraw now/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Amount (WETH)'), '1')
    await user.click(screen.getByRole('button', { name: /Withdraw WETH/i }))

    await waitFor(() => expect(sendOnChain).toHaveBeenCalled())
    expect(captureLiquidityAction).toHaveBeenCalled()
  })

  it('refuses only the value-in half: supply is barred while the exit is not', async () => {
    verdict = 'restricted'
    const user = userEvent.setup()
    renderBridge({ positions: [bridgePosition()] })

    await screen.findByTestId('supply-screening-refusal')
    await user.type(screen.getByLabelText('Amount (WETH)'), '1')
    expect(reviewButton()).toBeDisabled()
    expect(screen.getByRole('tab', { name: /Withdraw/i })).toBeEnabled()
  })

  it('says plainly that withdrawing is unaffected, so nobody assumes their money is stuck', async () => {
    verdict = 'restricted'
    renderBridge({ positions: [bridgePosition()] })

    const refusal = await screen.findByTestId('supply-screening-refusal')
    expect(refusal).toHaveTextContent(/nothing has been moved/i)
    expect(refusal).toHaveTextContent(/withdrawing what you already have in a pool is unaffected/i)
  })
})

// =========================================================================================
// Accessibility of the screening states (SC-014).
//
// The refusal and the unavailable notice are UI that only a screened-out member ever sees,
// so the surface's existing axe pass — which renders the ordinary, clear-verdict state —
// never reaches them. They are also the states where getting it wrong matters most: a
// member who cannot supply is being told why, and the explanation is useless if a screen
// reader skips it. `role="alert"` and `role="note"` are asserted as rendered, not merely
// as present in the source.
// =========================================================================================
describe('SupplySheet — screening states are accessible', () => {
  it('has no axe violations while refusing a restricted wallet (trading pool)', async () => {
    verdict = 'restricted'
    const { container } = renderTrading()
    await screen.findByTestId('supply-screening-refusal')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations while refusing a restricted wallet (bridge pool)', async () => {
    verdict = 'restricted'
    const { container } = renderBridge({ positions: [bridgePosition()] })
    await screen.findByTestId('supply-screening-refusal')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations on an unscreenable network, where the sheet says nothing', async () => {
    verdict = 'uncertain'
    const { container } = renderTrading()
    await waitFor(() => expect(screenOne).toHaveBeenCalled())
    expect(await axe(container)).toHaveNoViolations()
  })

  it('announces the refusal assertively', async () => {
    verdict = 'restricted'
    renderTrading()
    expect(await screen.findByTestId('supply-screening-refusal')).toHaveAttribute('role', 'alert')
  })
})
