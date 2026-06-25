import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Spec 033 — SwapPanel must name/link the DEX provider that applies to the
// active network (ETCswap on the ETC family, Uniswap elsewhere) and degrade
// honestly when no DEX is configured. We mock the DEX/wallet/token hooks so the
// component's provider-awareness is exercised in isolation.

const { mockUseDex, mockUseWallet, mockUseChainTokens } = vi.hoisted(() => ({
  mockUseDex: vi.fn(),
  mockUseWallet: vi.fn(),
  mockUseChainTokens: vi.fn(),
}))

vi.mock('../hooks/useDex', () => ({ useDex: mockUseDex }))
vi.mock('../hooks', () => ({ useWallet: mockUseWallet }))
vi.mock('../hooks/useChainTokens', () => ({ useChainTokens: mockUseChainTokens }))

import SwapPanel from '../components/fairwins/SwapPanel'

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

function dexValue(overrides = {}) {
  return {
    balances: { native: '0', wnative: '0', stable: '0' },
    loading: false,
    quotingPrice: false,
    wrapNative: vi.fn(),
    unwrapNative: vi.fn(),
    swap: vi.fn(),
    getQuote: vi.fn(),
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

describe('SwapPanel — network-aware DEX provider identity (Spec 033)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 61 })
    mockUseChainTokens.mockReturnValue({ native: 'ETC', stable: 'USC' })
  })

  it('US1: names ETCswap and links to it on an ETC-family chain', () => {
    mockUseDex.mockReturnValue(dexValue())
    render(<SwapPanel />)

    expect(screen.getByText(/swap via ETCswap/)).toBeInTheDocument()
    expect(screen.getByText('ETCswap Router ↗')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Open ETCswap/ })
    expect(link).toHaveAttribute('href', 'https://v3.etcswap.org')
    // No Uniswap anywhere on an ETC chain (SC-003).
    expect(screen.queryByText(/Uniswap/)).toBeNull()
  })

  it('US2: names Uniswap and links to it on a non-ETC chain', () => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 137 })
    mockUseChainTokens.mockReturnValue({ native: 'POL', stable: 'USDC' })
    mockUseDex.mockReturnValue(polygonDex())
    render(<SwapPanel />)

    expect(screen.getByText(/swap via Uniswap/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Open Uniswap/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('app.uniswap.org'))
    // No ETCswap on a non-ETC chain (SC-003).
    expect(screen.queryByText(/ETCswap/)).toBeNull()
  })

  it('US3: disabled-state names the chain provider, never the wrong one (FR-006)', () => {
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 63 })
    mockUseChainTokens.mockReturnValue({ native: 'ETC', stable: 'USC' })
    mockUseDex.mockReturnValue(
      dexValue({
        isDexAvailable: false,
        dexProvider: { name: 'ETCswap', url: 'https://etcswap.org' },
        network: { name: 'Ethereum Classic Mordor', chainId: 63 },
      })
    )
    render(<SwapPanel />)

    expect(
      screen.getByText(/ETCswap is not configured on Ethereum Classic Mordor/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/Uniswap/)).toBeNull()
    expect(screen.queryByText(/Polygon/)).toBeNull()
  })

  it('US3: re-targets the provider when the chain changes (no stale text, FR-005)', () => {
    mockUseDex.mockReturnValue(dexValue()) // ETC
    const { rerender } = render(<SwapPanel />)
    expect(screen.getByText(/swap via ETCswap/)).toBeInTheDocument()

    // Switch to Polygon.
    mockUseWallet.mockReturnValue({ isConnected: true, chainId: 137 })
    mockUseChainTokens.mockReturnValue({ native: 'POL', stable: 'USDC' })
    mockUseDex.mockReturnValue(polygonDex())
    rerender(<SwapPanel />)

    expect(screen.getByText(/swap via Uniswap/)).toBeInTheDocument()
    expect(screen.queryByText(/ETCswap/)).toBeNull()
  })
})
