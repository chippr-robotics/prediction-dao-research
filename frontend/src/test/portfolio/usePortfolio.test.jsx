/**
 * usePortfolio (spec 044) — live-balance hook tests.
 *
 * Wallet + price state are mocked at the context level per repo convention —
 * never raw wagmi hooks. Chain reads are stubbed by replacing ethers'
 * Contract with an address-keyed fixture map.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { WalletContext } from '../../contexts'
import PriceContext from '../../contexts/PriceContext'
import usePortfolio from '../../hooks/usePortfolio'
import { getPortfolioRegistry } from '../../config/assetTaxonomy'
import { NETWORKS } from '../../config/networks'

// Address-keyed ERC-20/721 balance fixtures. A value may be a bigint or a
// function (to simulate rejections). Unlisted addresses read as 0n.
const tokenBalances = new Map()

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    Contract: class {
      constructor(address) {
        this.address = String(address).toLowerCase()
      }

      balanceOf() {
        const fixture = tokenBalances.get(this.address)
        if (typeof fixture === 'function') return fixture()
        return Promise.resolve(fixture ?? 0n)
      }
    },
  }
})

const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

const registry137 = getPortfolioRegistry(137)
const addr = (symbol) => registry137.find((e) => e.symbol === symbol).address.toLowerCase()

function makeProvider(nativeBalance = 0n) {
  return { getBalance: vi.fn().mockResolvedValue(nativeBalance) }
}

function makeWallet(overrides = {}) {
  return {
    address: ADDRESS,
    isConnected: true,
    chainId: 137,
    provider: makeProvider(),
    ...overrides,
  }
}

const PRICE_OK = { nativeUsdRate: 0.5, error: null }

let latest
function Probe() {
  latest = usePortfolio()
  return null
}

function Harness({ wallet, price = PRICE_OK }) {
  return (
    <WalletContext.Provider value={wallet}>
      <PriceContext.Provider value={price}>
        <Probe />
      </PriceContext.Provider>
    </WalletContext.Provider>
  )
}

async function renderPortfolio(props) {
  let view
  await act(async () => {
    view = render(<Harness {...props} />)
  })
  return view
}

beforeEach(() => {
  tokenBalances.clear()
  latest = undefined
})

describe('usePortfolio', () => {
  it('is disconnected without a connected account and issues no reads', async () => {
    const provider = makeProvider()
    await renderPortfolio({ wallet: makeWallet({ address: undefined, isConnected: false, provider }) })
    expect(latest.status).toBe('disconnected')
    expect(latest.holdings).toEqual([])
    expect(provider.getBalance).not.toHaveBeenCalled()
  })

  it('maps nonzero balances to categorized holdings and drops zero balances', async () => {
    tokenBalances.set(addr('USDC'), 100_000_000n) // 100 USDC (6 decimals)
    await renderPortfolio({ wallet: makeWallet({ provider: makeProvider(2n * 10n ** 18n) }) })
    await waitFor(() => expect(latest.status).toBe('ready'))

    expect(latest.holdings).toHaveLength(2)
    const bySymbol = Object.fromEntries(latest.holdings.map((h) => [h.asset.symbol, h]))
    // Native MATIC priced by the feed (2 × $0.50), stablecoin at par $1.
    expect(bySymbol.MATIC.balance).toBe(2)
    expect(bySymbol.MATIC.usd).toBeCloseTo(1)
    expect(bySymbol.USDC.usd).toBeCloseTo(100)
    expect(latest.totalUsd).toBeCloseTo(101)
    expect(latest.isPartial).toBe(false)

    // Zero-balance registry assets are not holdings; regulatory categories
    // still all render (with empty groups), unclassified stays hidden.
    expect(latest.categories.map((g) => g.category.id)).toEqual([
      'digital-commodities',
      'digital-securities',
      'payment-stablecoins',
      'digital-tools',
      'digital-collectibles',
    ])
    const commodities = latest.categories.find((g) => g.category.id === 'digital-commodities')
    expect(commodities.subtotalUsd).toBeCloseTo(1)
    expect(latest.categories.find((g) => g.category.id === 'digital-securities').holdings).toEqual([])
  })

  it('renders NFT holdings as item counts with no price', async () => {
    tokenBalances.set(addr('FWMV'), 2n)
    await renderPortfolio({ wallet: makeWallet() })
    await waitFor(() => expect(latest.status).toBe('ready'))
    const voucher = latest.holdings.find((h) => h.asset.symbol === 'FWMV')
    expect(voucher.balance).toBe(2)
    expect(voucher.usd).toBeNull()
  })

  it('marks unpriced assets usd:null, excludes them from totals, and flags partial (FR-010)', async () => {
    tokenBalances.set(addr('WETH'), 10n ** 18n) // 1 WETH — no price feed
    tokenBalances.set(addr('USDC'), 50_000_000n)
    await renderPortfolio({ wallet: makeWallet() })
    await waitFor(() => expect(latest.status).toBe('ready'))

    const weth = latest.holdings.find((h) => h.asset.symbol === 'WETH')
    expect(weth.usd).toBeNull()
    expect(latest.totalUsd).toBeCloseTo(50)
    expect(latest.isPartial).toBe(true)
    const commodities = latest.categories.find((g) => g.category.id === 'digital-commodities')
    expect(commodities.isPartial).toBe(true)
  })

  it('treats an errored price feed as no price rather than using the fallback rate', async () => {
    await renderPortfolio({
      wallet: makeWallet({ provider: makeProvider(10n ** 18n) }),
      price: { nativeUsdRate: 0.5, error: 'feed down' },
    })
    await waitFor(() => expect(latest.status).toBe('ready'))
    const native = latest.holdings.find((h) => h.asset.kind === 'native')
    expect(native.usd).toBeNull()
    expect(latest.isPartial).toBe(true)
  })

  it('surfaces single failed reads as partial with the asset named, never as zero', async () => {
    tokenBalances.set(addr('LINK'), () => Promise.reject(new Error('revert')))
    tokenBalances.set(addr('USDC'), 25_000_000n)
    await renderPortfolio({ wallet: makeWallet() })
    await waitFor(() => expect(latest.status).toBe('ready'))

    expect(latest.failedAssets).toEqual(['LINK'])
    expect(latest.isPartial).toBe(true)
    expect(latest.holdings.some((h) => h.asset.symbol === 'LINK')).toBe(false)
    expect(latest.totalUsd).toBeCloseTo(25)
  })

  it('enters the error state with retry when every read fails', async () => {
    const provider = { getBalance: vi.fn().mockRejectedValue(new Error('rpc down')) }
    for (const entry of registry137) {
      if (entry.address) tokenBalances.set(entry.address.toLowerCase(), () => Promise.reject(new Error('rpc down')))
    }
    await renderPortfolio({ wallet: makeWallet({ provider }) })
    await waitFor(() => expect(latest.status).toBe('error'))
    expect(latest.error).toBeTruthy()
    expect(latest.holdings).toEqual([])

    // Retry must leave the error state immediately (loading, not a stale
    // error inviting retry spam) while the new request is in flight.
    let resolveNative
    provider.getBalance.mockImplementation(() => new Promise((res) => { resolveNative = res }))
    tokenBalances.clear()
    act(() => {
      latest.refresh()
    })
    await waitFor(() => expect(latest.status).toBe('loading'))
    expect(latest.error).toBeNull()

    // Recovery: the network comes back and the reload lands on ready.
    await act(async () => {
      resolveNative(10n ** 18n)
    })
    await waitFor(() => expect(latest.status).toBe('ready'))
    expect(latest.holdings.some((h) => h.asset.kind === 'native')).toBe(true)
  })

  it('reports unsupported networks explicitly instead of loading forever', async () => {
    await renderPortfolio({ wallet: makeWallet({ chainId: 999999 }) })
    expect(latest.isSupportedNetwork).toBe(false)
    expect(latest.status).not.toBe('loading')
    expect(latest.holdings).toEqual([])
  })

  it('clears the snapshot on chain switch and never leaks assets across networks (SC-004)', async () => {
    tokenBalances.set(addr('USDC'), 100_000_000n)
    const view = await renderPortfolio({ wallet: makeWallet({ provider: makeProvider(10n ** 18n) }) })
    await waitFor(() => expect(latest.status).toBe('ready'))
    expect(latest.holdings.length).toBeGreaterThan(0)

    // Switch to Mordor (63): the old snapshot must clear synchronously.
    const uscAddress = NETWORKS[63].stablecoin.address.toLowerCase()
    tokenBalances.set(uscAddress, 40_000_000n) // 40 USC
    await act(async () => {
      view.rerender(<Harness wallet={makeWallet({ chainId: 63, provider: makeProvider(10n ** 18n) })} price={PRICE_OK} />)
    })
    await waitFor(() => expect(latest.status).toBe('ready'))

    for (const holding of latest.holdings) {
      expect(holding.asset.chainId).toBe(63)
    }
    // ETC native must NOT be priced with the MATIC feed rate.
    const native = latest.holdings.find((h) => h.asset.kind === 'native')
    expect(native.asset.symbol).toBe('ETC')
    expect(native.usd).toBeNull()
    const usc = latest.holdings.find((h) => h.asset.symbol === 'USC')
    expect(usc.usd).toBeCloseTo(40)
  })

  it('refresh() reloads balances on demand (FR-015)', async () => {
    const provider = makeProvider(10n ** 18n)
    await renderPortfolio({ wallet: makeWallet({ provider }) })
    await waitFor(() => expect(latest.status).toBe('ready'))
    const callsAfterLoad = provider.getBalance.mock.calls.length

    await act(async () => {
      await latest.refresh()
    })
    expect(provider.getBalance.mock.calls.length).toBeGreaterThan(callsAfterLoad)
  })
})
