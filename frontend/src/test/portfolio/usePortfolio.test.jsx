/**
 * usePortfolio (spec 044 + follow-up) — cross-chain balance hook tests.
 *
 * Wallet + price state are mocked at the context level per repo convention —
 * never raw wagmi hooks. Per-chain read providers (utils/rpcProvider) and
 * ethers' Contract are stubbed with chain-scoped fixture maps.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { WalletContext } from '../../contexts'
import PriceContext from '../../contexts/PriceContext'
import usePortfolio from '../../hooks/usePortfolio'
import { getPortfolioRegistry, getPortfolioChainIds } from '../../config/assetTaxonomy'
import { NETWORKS } from '../../config/networks'

// Chain-scoped fixtures. Values may be bigints or functions (to simulate
// rejections). Unlisted assets read as 0n.
const fixtures = vi.hoisted(() => ({
  nativeBalances: new Map(), // chainId -> bigint | fn
  tokenBalances: new Map(), // `${chainId}:${addressLower}` -> bigint | fn
  prefs: { showTestnetAssets: false },
}))

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

vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: { ...fixtures.prefs },
    setShowTestnetAssets: vi.fn(),
  }),
}))

const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

const addr = (chainId, symbol) =>
  `${chainId}:${getPortfolioRegistry(chainId).find((e) => e.symbol === symbol).address.toLowerCase()}`

function makeWallet(overrides = {}) {
  return { address: ADDRESS, isConnected: true, chainId: 137, ...overrides }
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

async function renderPortfolio(props = {}) {
  let view
  await act(async () => {
    view = render(<Harness wallet={props.wallet || makeWallet()} price={props.price || PRICE_OK} />)
  })
  return view
}

beforeEach(() => {
  fixtures.nativeBalances.clear()
  fixtures.tokenBalances.clear()
  fixtures.prefs.showTestnetAssets = false
  latest = undefined
})

describe('usePortfolio (cross-chain)', () => {
  it('is disconnected without a connected account', async () => {
    await renderPortfolio({ wallet: makeWallet({ address: undefined, isConnected: false }) })
    expect(latest.status).toBe('disconnected')
    expect(latest.holdings).toEqual([])
  })

  it('scans mainnets only by default and never lists testnet assets', async () => {
    fixtures.nativeBalances.set(137, 2n * 10n ** 18n)
    fixtures.tokenBalances.set(addr(137, 'USDC'), 100_000_000n)
    fixtures.tokenBalances.set(addr(63, 'USC'), 40_000_000n) // Mordor — must stay hidden
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    const mainnets = new Set(getPortfolioChainIds())
    expect(mainnets.has(63)).toBe(false)
    for (const h of latest.holdings) {
      expect(mainnets.has(h.asset.chainId)).toBe(true)
    }
    expect(latest.holdings.some((h) => h.asset.symbol === 'USC')).toBe(false)
    expect(latest.totalUsd).toBeCloseTo(101) // 2 MATIC × $0.50 + 100 USDC
  })

  it('lists every digital commodity across scanned chains, zero balances included', async () => {
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    const commodities = latest.categories.find((g) => g.category.id === 'digital-commodities')
    const expected = getPortfolioChainIds()
      .flatMap((id) => getPortfolioRegistry(id))
      .filter((e) => e.categoryId === 'digital-commodities')
    expect(commodities.holdings).toHaveLength(expected.length)
    // Zero of anything is honestly worth $0.00 — no dash, no fabricated price.
    const zeroEth = commodities.holdings.find((h) => h.asset.chainId === 1 && h.asset.kind === 'native')
    expect(zeroEth.balance).toBe(0)
    expect(zeroEth.usd).toBe(0)
    expect(zeroEth.network).toBe('Ethereum')
    // Other categories stay holdings-only: no zero-balance stablecoin rows.
    const stables = latest.categories.find((g) => g.category.id === 'payment-stablecoins')
    expect(stables.holdings).toEqual([])
  })

  it('includes testnet chains when the preference is on', async () => {
    fixtures.prefs.showTestnetAssets = true
    fixtures.nativeBalances.set(63, 10n ** 18n) // 1 ETC on Mordor
    fixtures.tokenBalances.set(addr(63, 'USC'), 40_000_000n)
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    const usc = latest.holdings.find((h) => h.asset.symbol === 'USC')
    expect(usc.usd).toBeCloseTo(40)
    expect(usc.network).toBe('Ethereum Classic Mordor')
    // A nonzero ETC native must NOT be priced with the MATIC feed rate.
    const mordorNative = latest.holdings.find(
      (h) => h.asset.chainId === 63 && h.asset.kind === 'native',
    )
    expect(mordorNative.balance).toBe(1)
    expect(mordorNative.usd).toBeNull()
    // Sepolia joins the scan set alongside Amoy and Mordor.
    expect(getPortfolioChainIds({ includeTestnets: true })).toContain(11155111)
    expect(latest.holdings.some((h) => h.asset.chainId === 11155111)).toBe(true)
  })

  it('treats an errored price feed as no price rather than using the fallback rate', async () => {
    fixtures.nativeBalances.set(137, 10n ** 18n)
    await renderPortfolio({ price: { nativeUsdRate: 0.5, error: 'feed down' } })
    await waitFor(() => expect(latest.status).toBe('ready'))
    const matic = latest.holdings.find((h) => h.asset.chainId === 137 && h.asset.kind === 'native')
    expect(matic.usd).toBeNull()
    expect(latest.totalUsd).toBe(0)
  })

  it('renders NFT holdings as item counts', async () => {
    fixtures.tokenBalances.set(addr(137, 'FWMV'), 2n)
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))
    const voucher = latest.holdings.find((h) => h.asset.symbol === 'FWMV')
    expect(voucher.balance).toBe(2)
    expect(voucher.usd).toBeNull()
  })

  it('skips failed reads (named in failedAssets) instead of rendering zeros', async () => {
    fixtures.tokenBalances.set(addr(137, 'LINK'), () => Promise.reject(new Error('revert')))
    fixtures.tokenBalances.set(addr(137, 'USDC'), 25_000_000n)
    await renderPortfolio()
    await waitFor(() => expect(latest.status).toBe('ready'))

    expect(latest.failedAssets).toContain('LINK')
    expect(latest.holdings.some((h) => h.asset.symbol === 'LINK')).toBe(false)
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
    expect(latest.holdings).toEqual([])

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
