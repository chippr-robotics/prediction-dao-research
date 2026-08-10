import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSelectableAssets } from '../useSelectableAssets'
import { ASSET_ACTIVITIES } from '../../lib/assets/assetActivity'

// --- mocked data sources (mutated per test) ---------------------------------
const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
const WBTC1 = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'

let portfolioHoldings = []
let vaultHoldings = []
let btcState = { status: 'idle', networkId: null, balances: { spendableSats: 0 } }

const balanceOf = (kind) => (kind === 'stable' ? '100' : '5')
const quoteGaslessForAsset = (asset) => Number(asset?.chainId) === 137

vi.mock('../useWalletManagement', () => ({
  useWallet: () => ({ address: '0xAaAa000000000000000000000000000000000001', chainId: 137 }),
}))
vi.mock('../useChainTokens', () => ({
  useChainTokens: () => ({
    chainId: 137, networkName: 'Polygon',
    native: 'MATIC', nativeName: 'Polygon', nativeDecimals: 18,
    stable: 'USDC', stableName: 'USD Coin', stableDecimals: 6, stableAddress: USDC,
  }),
}))
vi.mock('../useBitcoinWallet', () => ({ useBitcoinWallet: () => btcState }))
vi.mock('../usePortfolio', () => ({ default: () => ({ holdings: portfolioHoldings, status: 'ready' }) }))
vi.mock('../useAccountAssets', () => ({ useAccountAssets: () => ({ holdings: vaultHoldings, refresh: vi.fn() }) }))
vi.mock('../useTransfer', () => ({
  TRANSFER_KIND: { NATIVE: 'native', STABLE: 'stable' },
  useTransfer: () => ({ balanceOf, quoteGaslessForAsset }),
}))
vi.mock('../../config/bitcoinNetworks', () => ({
  getBitcoinNetwork: (id) => (id === 'bitcoin' ? { id: 'bitcoin', name: 'Bitcoin', isTestnet: false } : null),
}))

const holding = (over) => ({
  asset: {
    kind: 'erc20', id: over.address, address: over.address, symbol: over.symbol,
    name: over.name || over.symbol, decimals: over.decimals ?? 18, chainId: over.chainId ?? 137,
  },
  balance: over.balance ?? 0,
  network: over.network || 'Polygon',
})

beforeEach(() => {
  portfolioHoldings = []
  vaultHoldings = []
  btcState = { status: 'idle', networkId: null, balances: { spendableSats: 0 } }
})

describe('useSelectableAssets — assembly', () => {
  it('always includes the connected native + stablecoin even before holdings load', () => {
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY }))
    const keys = result.current.options.map((o) => o.key)
    expect(keys).toContain('137:native')
    expect(keys).toContain(`137:${USDC.toLowerCase()}`)
  })

  it('merges held holdings and drops non-stable zero-balance rows', () => {
    portfolioHoldings = [
      holding({ address: WBTC1, symbol: 'WBTC', decimals: 8, chainId: 137, balance: 0.5 }),
      holding({ address: '0xzero', symbol: 'ZERO', chainId: 137, balance: 0 }),
    ]
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY }))
    const syms = result.current.options.map((o) => o.symbol)
    expect(syms).toContain('WBTC')
    expect(syms).not.toContain('ZERO')
  })

  it('sorts connected-chain assets before off-chain ones', () => {
    portfolioHoldings = [holding({ address: WBTC1, symbol: 'WBTC', decimals: 8, chainId: 1, balance: 2, network: 'Ethereum' })]
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY }))
    const chains = result.current.options.map((o) => o.chainId)
    // every 137 option precedes the first 1 option
    const firstOffChain = chains.indexOf(1)
    expect(firstOffChain).toBeGreaterThan(-1)
    expect(chains.slice(0, firstOffChain).every((c) => c === 137)).toBe(true)
  })
})

describe('useSelectableAssets — Bitcoin scoping', () => {
  it('includes native Bitcoin for pay when the BTC wallet is ready + personal', () => {
    btcState = { status: 'ready', networkId: 'bitcoin', balances: { spendableSats: 150000000 } }
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY }))
    const btc = result.current.options.find((o) => o.kind === 'btc-native')
    expect(btc).toBeTruthy()
    expect(btc.balance).toBeCloseTo(1.5)
    expect(result.current.isGasless(btc)).toBe(false) // BTC never gasless
  })

  it('excludes Bitcoin from the wager activity (EVM ERC-20 escrow only)', () => {
    btcState = { status: 'ready', networkId: 'bitcoin', balances: { spendableSats: 150000000 } }
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.WAGER }))
    expect(result.current.options.some((o) => o.kind === 'btc-native')).toBe(false)
    expect(result.current.options.some((o) => o.kind === 'native')).toBe(false)
    expect(result.current.options.every((o) => o.kind === 'erc20')).toBe(true)
  })

  it('does not include Bitcoin when acting as a vault/legacy account', () => {
    btcState = { status: 'ready', networkId: 'bitcoin', balances: { spendableSats: 150000000 } }
    const { result } = renderHook(() =>
      useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY, actingAddress: '0xVault' }),
    )
    expect(result.current.options.some((o) => o.kind === 'btc-native')).toBe(false)
  })
})

describe('useSelectableAssets — acting account + gasless + default', () => {
  it('lists the acting account holdings when actingAddress is set', () => {
    vaultHoldings = [holding({ address: WBTC1, symbol: 'WBTC', decimals: 8, chainId: 137, balance: 3 })]
    const { result } = renderHook(() =>
      useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY, actingAddress: '0xVault' }),
    )
    expect(result.current.options.some((o) => o.symbol === 'WBTC')).toBe(true)
  })

  it('gasless quote is delegated per-asset (Polygon gasless, Ethereum not)', () => {
    portfolioHoldings = [holding({ address: WBTC1, symbol: 'WBTC', decimals: 8, chainId: 1, balance: 1, network: 'Ethereum' })]
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY }))
    const poly = result.current.options.find((o) => o.chainId === 137 && o.kind === 'native')
    const eth = result.current.options.find((o) => o.chainId === 1)
    expect(result.current.isGasless(poly)).toBe(true)
    expect(result.current.isGasless(eth)).toBe(false)
  })

  it('defaults to the connected stablecoin', () => {
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.PAY }))
    expect(result.current.defaultKey).toBe(`137:${USDC.toLowerCase()}`)
  })
})

describe('useSelectableAssets — catalog mode (receive-any)', () => {
  it('held-only (no catalog) lists just the connected defaults when nothing is held', () => {
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.REQUEST }))
    // Only the connected chain's native + stablecoin defaults.
    expect(result.current.options.every((o) => o.chainId === 137)).toBe(true)
    expect(result.current.options.some((o) => o.symbol === 'WBTC')).toBe(false)
  })

  it('catalog mode unions the full bundled registry so unheld supported assets appear', () => {
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.REQUEST, catalog: true }))
    const syms = result.current.options.map((o) => o.symbol)
    // Polygon (connected) curated registry includes WBTC/WETH even with zero holdings.
    expect(syms).toContain('WBTC')
    expect(syms).toContain('WETH')
    // Cross-network assets are present too (mainnets are in the catalog).
    expect(result.current.options.some((o) => o.chainId !== 137)).toBe(true)
    // Default is still the connected stablecoin (USDC), unchanged by catalog mode.
    expect(result.current.defaultKey).toBe(`137:${USDC.toLowerCase()}`)
  })

  it('catalog mode preserves a held asset’s real balance (held row wins over the 0 catalog row)', () => {
    // Canonical Polygon WBTC — same address the bundled registry uses, so the held
    // row and the catalog row share a key and merge into one.
    const POLY_WBTC = '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6'
    portfolioHoldings = [holding({ address: POLY_WBTC, symbol: 'WBTC', decimals: 8, chainId: 137, balance: 0.5 })]
    const { result } = renderHook(() => useSelectableAssets({ activity: ASSET_ACTIVITIES.REQUEST, catalog: true }))
    const wbtc = result.current.options.filter((o) => o.symbol === 'WBTC' && o.chainId === 137)
    expect(wbtc).toHaveLength(1)
    expect(wbtc[0].balance).toBe(0.5)
  })
})
