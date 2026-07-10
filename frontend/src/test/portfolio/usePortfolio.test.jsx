/**
 * usePortfolio (spec 044 v1.2) — cross-chain aggregated portfolio tests.
 *
 * Wallet state is mocked at the context level per repo convention — never
 * raw wagmi hooks. Per-chain read providers (utils/rpcProvider), ethers'
 * Contract, and the on-chain price ladder (lib/portfolio/prices) are stubbed
 * with fixture maps.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { WalletContext } from '../../contexts'
import usePortfolio from '../../hooks/usePortfolio'
import { getPortfolioRegistry, getPortfolioChainIds } from '../../config/assetTaxonomy'

// Chain-scoped fixtures. Balance values may be bigints or functions (to
// simulate rejections); unlisted assets read as 0n. Semicolon required:
// vitest's hoisting transform concatenates this with the vi.mock calls.
const fixtures = vi.hoisted(() => ({
  nativeBalances: new Map(), // chainId -> bigint | fn
  tokenBalances: new Map(), // `${chainId}:${addressLower}` -> bigint | fn
  prefs: { showTestnetAssets: false, showZeroBalances: false },
  prices: new Map(), // underlying -> {usd, source, chainId}
  pricesFail: false,
}));

function resolveFixture(value) {
  if (typeof value === 'function') return value()
  return Promise.resolve(value ?? 0n)
}

vi.mock('../../utils/rpcProvider', () => ({
  makeReadProvider: (url, chainId) => ({
    chainId,
    getBalance: () => resolveFixture(fixtures.nativeBalances.get(chainId)),
  }),
}))

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    Contract: class {
      constructor(address, abi, provider) {
        this.key = `${provider.chainId}:${String(address).toLowerCase()}`
      }

      balanceOf() {
        return resolveFixture(fixtures.tokenBalances.get(this.key))
      }
    },
  }
})

vi.mock('../../lib/portfolio/prices', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPortfolioPrices: () =>
      fixtures.pricesFail
        ? Promise.reject(new Error('pricing down'))
        : Promise.resolve(new Map(fixtures.prices)),
  }
})

vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: { ...fixtures.prefs },
    setShowTestnetAssets: vi.fn(),
    setShowZeroBalances: vi.fn(),
  }),
}))

const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

const addr = (chainId, symbol) =>
  `${chainId}:${getPortfolioRegistry(chainId).find((e) => e.symbol === symbol).address.toLowerCase()}`

function makeWallet(overrides = {}) {
  return { address: ADDRESS, isConnected: true, chainId: 137, ...overrides }
}

let latest
function Probe() {
  latest = usePortfolio()
  return null
}

function Harness({ wallet }) {
  return (
    <WalletContext.Provider value={wallet}>
      <Probe />
    </WalletContext.Provider>
  )
}

async function renderPortfolio(props = {}) {
  let view
  await act(async () => {
    view = render(<Harness wallet={props.wallet || makeWallet()} />)
  })
  return view
}

const aggFor = (underlying, categoryId = null) =>
  latest.aggregates.find(
    (a) => a.underlying === underlying && (categoryId == null || a.categoryId === categoryId),
  )

beforeEach(() => {
  fixtures.nativeBalances.clear()
  fixtures.tokenBalances.clear()
  fixtures.prices.clear()
  fixtures.pricesFail = false
  fixtures.prefs.showTestnetAssets = false
  fixtures.prefs.showZeroBalances = false
  latest = undefined
})

describe('usePortfolio (aggregated, on-chain priced)', () => {
  it('is disconnected without a connected account', async () => {
    await renderPortfolio({ wallet: makeWallet({ address: undefined, isConnected: false }) })
    expect(latest.status).toBe('disconnected')
    expect(latest.aggregates).toEqual([])
  })

  it('values holdings from the on-chain price map and hides zero aggregates by default (FR-022/023)', async () => {
    fixtures.nativeBalances.set(137, 2n * 10n ** 18n)
    fixtures.tokenBalances.set(addr(137, 'USDC'), 100_000_000n)
    fixtures.prices.set('MATIC', { usd: 0.5, source: 'chainlink', chainId: 137 })
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    const matic = aggFor('MATIC')
    expect(matic.usd).toBeCloseTo(1)
    expect(matic.unitPriceUsd).toBe(0.5)
    expect(matic.priceEntry.source).toBe('chainlink')
    expect(aggFor('USDC').usd).toBeCloseTo(100)
    expect(latest.totalUsd).toBeCloseTo(101)
    // Zero-balance aggregates (ETH, BTC, LINK, …) are hidden by default.
    expect(aggFor('ETH')).toBeUndefined()
    expect(latest.aggregates.every((a) => a.balance > 0)).toBe(true)
  })

  it('lists zero-balance aggregates when the preference is on, worth an honest $0.00', async () => {
    fixtures.prefs.showZeroBalances = true
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    const eth = aggFor('ETH', 'digital-commodities')
    expect(eth.balance).toBe(0)
    expect(eth.usd).toBe(0)
    expect(latest.totalUsd).toBe(0)
  })

  it('combines native and wrapped forms into one underlying aggregate (FR-025)', async () => {
    fixtures.nativeBalances.set(1, 10n ** 18n) // 1 ETH on Ethereum
    fixtures.tokenBalances.set(addr(1, 'WETH'), 5n * 10n ** 17n) // 0.5 WETH on Ethereum
    fixtures.tokenBalances.set(addr(137, 'WETH'), 25n * 10n ** 16n) // 0.25 WETH on Polygon
    fixtures.prices.set('ETH', { usd: 2000, source: 'chainlink', chainId: 137 })
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    const eth = aggFor('ETH')
    expect(eth.instances).toHaveLength(3)
    expect(eth.balance).toBeCloseTo(1.75)
    expect(eth.usd).toBeCloseTo(3500)
    // Home native first, wrapped and cross-chain instances after.
    expect(eth.instances[0].asset.kind).toBe('native')
    expect(eth.instances.map((h) => h.asset.chainId)).toEqual([1, 1, 137])
    // The main list shows ONE ETH row — instances live in the sheet.
    expect(latest.aggregates.filter((a) => a.underlying === 'ETH')).toHaveLength(1)
  })

  it('scans testnets only when enabled and never prices them with foreign rates', async () => {
    fixtures.tokenBalances.set(addr(63, 'USC'), 40_000_000n)
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))
    expect(aggFor('USC')).toBeUndefined()

    fixtures.prefs.showTestnetAssets = true
    fixtures.nativeBalances.set(63, 10n ** 18n) // 1 ETC on Mordor — no price entry
    await renderPortfolio()
    await waitFor(() => expect(aggFor('USC')).toBeTruthy())

    expect(aggFor('USC').usd).toBeCloseTo(40)
    expect(getPortfolioChainIds({ includeTestnets: true })).toContain(11155111)
    const etc = aggFor('ETC')
    expect(etc.balance).toBe(1)
    expect(etc.usd).toBeNull() // unpriced, never borrowed from another asset
  })

  it('keeps the portfolio ready when pricing fails entirely — assets just go unpriced', async () => {
    fixtures.pricesFail = true
    fixtures.nativeBalances.set(137, 10n ** 18n)
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))
    const matic = aggFor('MATIC')
    expect(matic.usd).toBeNull()
    expect(latest.totalUsd).toBe(0)
  })

  it('renders NFT holdings as item-count aggregates', async () => {
    fixtures.tokenBalances.set(addr(137, 'FWMV'), 2n)
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))
    const voucher = aggFor('FWMV')
    expect(voucher.kind).toBe('nft')
    expect(voucher.balance).toBe(2)
    expect(voucher.usd).toBeNull()
  })

  it('skips failed reads (named in failedAssets) instead of rendering zeros', async () => {
    fixtures.tokenBalances.set(addr(137, 'LINK'), () => Promise.reject(new Error('revert')))
    fixtures.tokenBalances.set(addr(137, 'USDC'), 25_000_000n)
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    expect(latest.failedAssets).toContain('LINK')
    expect(aggFor('LINK')).toBeUndefined()
    expect(latest.totalUsd).toBeCloseTo(25)
  })

  it('enters the error state when every read fails, and retry recovers via loading', async () => {
    const reject = () => Promise.reject(new Error('rpc down'))
    for (const id of getPortfolioChainIds()) {
      fixtures.nativeBalances.set(id, reject)
      for (const entry of getPortfolioRegistry(id)) {
        if (entry.address) fixtures.tokenBalances.set(`${id}:${entry.address.toLowerCase()}`, reject)
      }
    }
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('error'))
    expect(latest.aggregates).toEqual([])

    // Retry leaves the error state immediately (loading, not retry spam)...
    let resolveNative
    fixtures.nativeBalances.set(137, () => new Promise((res) => { resolveNative = res }))
    act(() => {
      latest.refresh()
    })
    await waitFor(() => expect(latest.status).toBe('loading'))
    expect(latest.error).toBeNull()

    // ...and lands on ready once the network answers.
    await act(async () => {
      resolveNative(10n ** 18n)
    })
    await waitFor(() => expect(latest.status).toBe('ready'))
  })

  it('refresh() reloads balances on demand', async () => {
    let calls = 0
    fixtures.nativeBalances.set(137, () => {
      calls++
      return Promise.resolve(10n ** 18n)
    })
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))
    const callsAfterLoad = calls
    await act(async () => {
      await latest.refresh()
    })
    expect(calls).toBeGreaterThan(callsAfterLoad)
  })
})
