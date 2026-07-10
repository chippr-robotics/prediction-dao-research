import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// TradePanel is the renamed, SDK-driven successor to SwapPanel. It must:
//  - name/link the DEX provider for the active network (ETCswap on the ETC
//    family, Uniswap elsewhere) while subtly attributing the Uniswap V3 protocol
//    that powers routing (Spec 033 provider-awareness, preserved);
//  - present a professional trade read-out (rate, price impact, minimum
//    received, route) fed by getBestQuote().
// We mock the DEX/wallet/token hooks so the component is exercised in isolation.

const { mockUseDex, mockUseWallet, mockUseChainTokens } = vi.hoisted(() => ({
  mockUseDex: vi.fn(),
  mockUseWallet: vi.fn(),
  mockUseChainTokens: vi.fn(),
}))

vi.mock('../hooks/useDex', () => ({ useDex: mockUseDex }))
vi.mock('../hooks', () => ({ useWallet: mockUseWallet }))
vi.mock('../hooks/useChainTokens', () => ({ useChainTokens: mockUseChainTokens }))

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
    isDexAvailable: true,
    dexProvider: { name: 'ETCswap', url: 'https://v3.etcswap.org' },
    network: { name: 'Ethereum Classic', chainId: 61 },
    ...overrides,
  }
}

const polygonDex = (overrides = {}) =>
  dexValue({
    addresses: POLYGON_ADDRESSES,
    dexProvider: { name: 'Uniswap', url: 'https://app.uniswap.org/swap?chain=polygon' },
    network: { name: 'Polygon', chainId: 137 },
    ...overrides,
  })

describe('TradePanel — provider identity & attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    vi.clearAllMocks()
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
    // (spec 046), so assert against the row that holds both amount and symbol.
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
