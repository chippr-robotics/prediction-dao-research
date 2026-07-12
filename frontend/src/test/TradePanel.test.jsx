import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// TradePanel is the brokerage-style order ticket for on-chain swaps. It must:
//  - name/link the DEX provider for the active network (ETCswap on the ETC
//    family, Uniswap elsewhere) while subtly attributing the Uniswap V3 protocol
//    that powers routing (Spec 033 provider-awareness, preserved);
//  - present a professional trade read-out (rate, price impact, minimum
//    received, route) fed by getBestQuote();
//  - let the member trade as their personal wallet or as a saved multisig
//    vault (Spec 043), with balances that follow the selected account;
//  - offer the price types Uniswap V3 actually supports (Market, and Limit as
//    immediate-or-cancel via amountOutMinimum) and gate perpetuals order types
//    (Sell Short / Buy to Cover) on a per-network perps venue — hidden where
//    none exists (honest-state).
// We mock the DEX/wallet/token/account hooks so the component is exercised in
// isolation.

const {
  mockUseDex,
  mockUseWallet,
  mockUseChainTokens,
  mockUseActiveAccount,
  mockUseCustodyVaults,
} = vi.hoisted(() => ({
  mockUseDex: vi.fn(),
  mockUseWallet: vi.fn(),
  mockUseChainTokens: vi.fn(),
  mockUseActiveAccount: vi.fn(),
  mockUseCustodyVaults: vi.fn(),
}))

vi.mock('../hooks/useDex', () => ({ useDex: mockUseDex }))
vi.mock('../hooks', () => ({ useWallet: mockUseWallet }))
vi.mock('../hooks/useChainTokens', () => ({ useChainTokens: mockUseChainTokens }))
vi.mock('../hooks/useActiveAccount', () => ({ useActiveAccount: mockUseActiveAccount }))
vi.mock('../hooks/useCustodyVaults', () => ({ useCustodyVaults: mockUseCustodyVaults }))

import TradePanel from '../components/fairwins/TradePanel'

const ETC_ADDRESSES = {
  WNATIVE: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a',
  STABLECOIN: '0xDE093684c796204224BC081f937aa059D903c52a',
  SWAP_ROUTER_02: '0xEd88EDD995b00956097bF90d39C9341BBde324d1',
}
const POLYGON_ADDRESSES = {
  WNATIVE: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  STABLECOIN: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  SWAP_ROUTER_02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
}

const SAMPLE_QUOTE = {
  amountOut: '1.23',
  amountOutWei: 1230000n,
  feeTier: 3000,
  gasEstimate: 0n,
  executionPrice: '1.23',
  executionPriceInverted: '0.813008',
  minimumReceived: '1.22385',
  minimumReceivedWei: 1223850n,
  priceImpactPercent: 0.42,
  tokenInSymbol: 'WPOL',
  tokenOutSymbol: 'USDC',
}

function dexValue(overrides = {}) {
  return {
    balances: { native: '10', wnative: '5', stable: '100' },
    loading: false,
    quotingPrice: false,
    wrapNative: vi.fn(),
    unwrapNative: vi.fn(),
    swap: vi.fn().mockResolvedValue({}),
    getBestQuote: vi.fn().mockResolvedValue(SAMPLE_QUOTE),
    slippage: 50,
    setSlippage: vi.fn(),
    addresses: ETC_ADDRESSES,
    tokens: { STABLE: { decimals: 6, symbol: 'USC' }, WNATIVE: { decimals: 18, symbol: 'WETC' } },
    isDexAvailable: true,
    dexProvider: { name: 'ETCswap', url: 'https://v3.etcswap.org' },
    network: { name: 'Ethereum Classic', chainId: 61 },
    ...overrides,
  }
}

const polygonDex = (overrides = {}) =>
  dexValue({
    addresses: POLYGON_ADDRESSES,
    tokens: { STABLE: { decimals: 6, symbol: 'USDC' }, WNATIVE: { decimals: 18, symbol: 'WPOL' } },
    dexProvider: { name: 'Uniswap', url: 'https://app.uniswap.org/swap?chain=polygon' },
    network: { name: 'Polygon', chainId: 137 },
    ...overrides,
  })

function personalAccount(overrides = {}) {
  return {
    identity: { mode: 'personal' },
    isVault: false,
    canActAsVault: false,
    submit: vi.fn(),
    operateAsPersonal: vi.fn(),
    operateAsVault: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseActiveAccount.mockReturnValue(personalAccount())
  mockUseCustodyVaults.mockReturnValue({ vaults: [], supported: false })
})

describe('TradePanel — provider identity & attribution', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 61 })
    mockUseChainTokens.mockReturnValue({ native: 'ETC', stable: 'USC' })
  })

  it('names ETCswap and links to it on an ETC-family chain', () => {
    mockUseDex.mockReturnValue(dexValue())
    render(<TradePanel />)

    // Venue badge + subtitle name the chain's DEX.
    expect(screen.getAllByText('ETCswap').length).toBeGreaterThan(0)
    expect(screen.getByText('ETCswap Router ↗')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Open ETCswap/ })
    expect(link).toHaveAttribute('href', 'https://v3.etcswap.org')
    // Subtle attribution still credits the underlying Uniswap V3 protocol.
    expect(screen.getByText(/Uniswap v3 protocol/i)).toBeInTheDocument()
  })

  it('names Uniswap and links to it on a non-ETC chain', () => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 137 })
    mockUseChainTokens.mockReturnValue({ native: 'POL', stable: 'USDC' })
    mockUseDex.mockReturnValue(polygonDex())
    render(<TradePanel />)

    expect(screen.getByText('Uniswap Router ↗')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Open Uniswap/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('app.uniswap.org'))
    expect(screen.getByText(/Powered by Uniswap v3/i)).toBeInTheDocument()
    // No ETCswap on a non-ETC chain.
    expect(screen.queryByText(/ETCswap/)).toBeNull()
  })

  it('disabled-state names the chain provider, never the wrong one', () => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 63 })
    mockUseChainTokens.mockReturnValue({ native: 'ETC', stable: 'USC' })
    mockUseDex.mockReturnValue(
      dexValue({
        isDexAvailable: false,
        dexProvider: { name: 'ETCswap', url: 'https://etcswap.org' },
        network: { name: 'Ethereum Classic Mordor', chainId: 63 },
      }),
    )
    render(<TradePanel />)

    expect(
      screen.getByText(/ETCswap is not configured on Ethereum Classic Mordor/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Uniswap/)).toBeNull()
  })

  it('prompts to connect when the wallet is disconnected', () => {
    mockUseWallet.mockReturnValue({ isConnected: false, chainId: 61 })
    mockUseDex.mockReturnValue(dexValue())
    render(<TradePanel />)

    expect(screen.getByText(/Connect your wallet to start trading/)).toBeInTheDocument()
  })
})

describe('TradePanel — SDK-driven trade read-out', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 137 })
    mockUseChainTokens.mockReturnValue({ native: 'POL', stable: 'USDC' })
  })

  it('quotes via getBestQuote and surfaces rate, impact, minimum received and route', async () => {
    const getBestQuote = vi.fn().mockResolvedValue(SAMPLE_QUOTE)
    mockUseDex.mockReturnValue(polygonDex({ getBestQuote }))
    render(<TradePanel />)

    fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '1' } })

    await waitFor(() => expect(getBestQuote).toHaveBeenCalled())

    // Best-execution output is shown on the receive leg.
    expect(await screen.findByText('1.23')).toBeInTheDocument()
    // Rate, price impact, minimum received, and the routed fee-tier pool.
    expect(screen.getByText(/1 WPOL = 1.23 USDC/)).toBeInTheDocument()
    expect(screen.getByText('0.42%')).toBeInTheDocument()
    // The minimum-received amount is wrapped in <SensitiveValue> for tilt-to-hide
    // (spec 047), so assert against the row that holds both amount and symbol.
    expect(screen.getByText('1.22385').closest('.trade-summary-val')).toHaveTextContent(/1.22385\s*USDC/)
    expect(screen.getByText('0.3% pool')).toBeInTheDocument()
  })

  it('inverts the rate line when tapped', async () => {
    mockUseDex.mockReturnValue(polygonDex())
    render(<TradePanel />)

    fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '1' } })
    const rate = await screen.findByText(/1 WPOL = 1.23 USDC/)
    fireEvent.click(rate)
    expect(screen.getByText(/1 USDC = 0.813008 WPOL/)).toBeInTheDocument()
  })

  it('executes the swap through the DEX swap()', async () => {
    const swap = vi.fn().mockResolvedValue({})
    mockUseDex.mockReturnValue(polygonDex({ swap }))
    render(<TradePanel />)

    fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '1' } })
    const execBtn = await screen.findByRole('button', { name: /Swap WPOL for USDC/ })
    fireEvent.click(execBtn)

    await waitFor(() =>
      expect(swap).toHaveBeenCalledWith(
        POLYGON_ADDRESSES.WNATIVE,
        POLYGON_ADDRESSES.STABLECOIN,
        '1',
      ),
    )
  })

  it('offers Swap, Wrap and Unwrap modes', () => {
    mockUseDex.mockReturnValue(polygonDex())
    render(<TradePanel />)

    expect(screen.getByRole('tab', { name: 'Swap' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Wrap' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Unwrap' })).toBeInTheDocument()
  })
})

describe('TradePanel — account selection (spec 043)', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({
      isConnected: true,
      chainId: 137,
      address: '0x1111222233334444555566667777888899990000',
    })
    mockUseChainTokens.mockReturnValue({ native: 'POL', stable: 'USDC' })
    mockUseDex.mockReturnValue(polygonDex())
  })

  it('lists the personal wallet and every saved multisig, and shows account balances', () => {
    mockUseCustodyVaults.mockReturnValue({
      supported: true,
      vaults: [
        { address: '0xVaultAAA', chainId: 137, label: 'Ops Treasury' },
        { address: '0xVaultBBB', chainId: 137, label: '' },
      ],
    })
    render(<TradePanel />)

    const picker = screen.getByLabelText('Account')
    expect(picker).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Personal wallet · 0x1111…0000/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Ops Treasury · Multisig/ })).toBeInTheDocument()

    // Available-to-trade figures for the selected account (pay leg = WPOL).
    expect(screen.getByText(/Available to trade \(WPOL\)/)).toBeInTheDocument()
    expect(screen.getByText(/Cash available \(USDC\)/)).toBeInTheDocument()
  })

  it('switches the active identity when a multisig is selected', () => {
    const operateAsVault = vi.fn()
    const vault = { address: '0xVaultAAA', chainId: 137, label: 'Ops Treasury' }
    mockUseActiveAccount.mockReturnValue(personalAccount({ operateAsVault }))
    mockUseCustodyVaults.mockReturnValue({ supported: true, vaults: [vault] })
    render(<TradePanel />)

    fireEvent.change(screen.getByLabelText('Account'), { target: { value: '0xVaultAAA' } })
    expect(operateAsVault).toHaveBeenCalledWith(vault)
  })

  it('discloses the proposal flow while operating as a multisig', () => {
    mockUseActiveAccount.mockReturnValue(
      personalAccount({
        identity: { mode: 'vault', vaultAddress: '0xVaultAAA', chainId: 137, label: 'Ops Treasury' },
        isVault: true,
        canActAsVault: true,
      }),
    )
    mockUseCustodyVaults.mockReturnValue({
      supported: true,
      vaults: [{ address: '0xVaultAAA', chainId: 137, label: 'Ops Treasury' }],
    })
    render(<TradePanel />)

    expect(screen.getByText('Multisig proposal')).toBeInTheDocument()
    expect(screen.getByText(/proposed to the multisig/)).toBeInTheDocument()
  })
})

describe('TradePanel — order & price types', () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 137 })
    mockUseChainTokens.mockReturnValue({ native: 'POL', stable: 'USDC' })
  })

  it('keeps order type and pair direction in sync (Buy receives the network asset)', () => {
    mockUseDex.mockReturnValue(polygonDex())
    render(<TradePanel />)

    // Default direction WPOL → USDC reads as Sell.
    expect(screen.getByLabelText(/Order Type/).value).toBe('sell')

    fireEvent.change(screen.getByLabelText(/Order Type/), { target: { value: 'buy' } })
    expect(screen.getByLabelText('Token to sell').value).toBe('STABLE')
    expect(screen.getByLabelText('Token to buy').value).toBe('WNATIVE')

    // Flipping the pair back flips the order type too.
    fireEvent.change(screen.getByLabelText('Token to sell'), { target: { value: 'WNATIVE' } })
    fireEvent.change(screen.getByLabelText('Token to buy'), { target: { value: 'STABLE' } })
    expect(screen.getByLabelText(/Order Type/).value).toBe('sell')
  })

  it('offers Market and Limit price types and passes the limit floor to swap()', async () => {
    const swap = vi.fn().mockResolvedValue({})
    mockUseDex.mockReturnValue(polygonDex({ swap }))
    render(<TradePanel />)

    fireEvent.change(screen.getByLabelText(/Price Type/), { target: { value: 'limit' } })
    fireEvent.change(screen.getByLabelText(/Limit Price/), { target: { value: '1.3' } })
    fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '1' } })

    // Limit orders are immediate-or-cancel — the term row says so honestly.
    expect(screen.getByText('Fill at limit or cancel')).toBeInTheDocument()

    const execBtn = await screen.findByRole('button', { name: /Place limit order/ })
    fireEvent.click(execBtn)

    // 1 × 1.3 at 6 stable decimals → 1300000n enforced as amountOutMinimum.
    await waitFor(() =>
      expect(swap).toHaveBeenCalledWith(
        POLYGON_ADDRESSES.WNATIVE,
        POLYGON_ADDRESSES.STABLECOIN,
        '1',
        { limitMinOutWei: 1300000n },
      ),
    )
  })

  it('hides perpetuals order types on networks without a perps venue', () => {
    mockUseDex.mockReturnValue(polygonDex())
    render(<TradePanel />)

    expect(screen.queryByRole('option', { name: 'Sell Short' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Buy to Cover' })).toBeNull()
  })

  it('offers Sell Short / Buy to Cover only where the network has a perps venue', () => {
    mockUseDex.mockReturnValue(
      polygonDex({ network: { name: 'Polygon', chainId: 137, perps: { name: 'TestPerps' } } }),
    )
    render(<TradePanel />)

    expect(screen.getByRole('option', { name: 'Sell Short' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Buy to Cover' })).toBeInTheDocument()
  })
})

describe('TradePanel — session rails (passkey & gasless)', () => {
  beforeEach(() => {
    mockUseChainTokens.mockReturnValue({ native: 'POL', stable: 'USDC' })
  })

  it('shows the sponsored-gasless badge for passkey sessions on sponsored networks', () => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 137, loginMethod: 'passkey' })
    mockUseDex.mockReturnValue(
      polygonDex({
        network: {
          name: 'Polygon',
          chainId: 137,
          passkey: { sponsorPaymasterUrl: 'https://relay.example/v1/paymaster' },
        },
      }),
    )
    render(<TradePanel />)

    expect(screen.getByText(/Gasless · sponsored/)).toBeInTheDocument()
    expect(screen.getByText(/One passkey confirmation covers the whole order/)).toBeInTheDocument()
  })

  it('is honest when a passkey session cannot transact on this network', () => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 61, loginMethod: 'passkey' })
    mockUseDex.mockReturnValue(dexValue()) // network has no passkey rail
    render(<TradePanel />)

    expect(screen.getByText(/Passkey accounts can’t send transactions on Ethereum Classic yet/)).toBeInTheDocument()
    expect(screen.getByText('Network fee applies')).toBeInTheDocument()
  })

  it('shows the fee badge for classic wallet sessions', () => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 137 })
    mockUseDex.mockReturnValue(polygonDex())
    render(<TradePanel />)

    expect(screen.getByText('Network fee applies')).toBeInTheDocument()
  })
})
