/**
 * Multi-asset sweep (spec 062, US2) — quoteAllAssets / sweepAllAssets.
 * A stub registry, provider, signer, and contract drive enumeration, ordering,
 * gas reserve, and per-asset outcome behavior (including partial failure).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { quoteAllAssets, sweepAllAssets, supportedAssetsForChain } from '../../lib/recovery/legacyKeys'

const USDC = ('0x' + 'a'.repeat(40)).toLowerCase()
const DAI = ('0x' + 'b'.repeat(40)).toLowerCase()
const LEGACY_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const TO = '0x' + 'd'.repeat(40)
const GAS = 2_000_000_000n

// Stub the portfolio registry so tests don't depend on live chain config.
vi.mock('../../config/assetTaxonomy', () => ({
  getPortfolioRegistry: () => [
    { id: 'native', kind: 'native', address: null, symbol: 'ETH', decimals: 18 },
    { id: 'usdc', kind: 'erc20', address: '0x' + 'a'.repeat(40), symbol: 'USDC', decimals: 6 },
    { id: 'dai', kind: 'erc20', address: '0x' + 'b'.repeat(40), symbol: 'DAI', decimals: 18 },
    { id: 'nft', kind: 'nft', address: '0x' + 'c'.repeat(40), symbol: 'NFT', decimals: 0 },
  ],
}))

// Stub ethers so the sweep signs/reads through in-memory bookkeeping instead of a chain.
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers')
  const ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
  class StubWallet {
    constructor() { this.address = ADDR }
    connect(provider) { this.provider = provider; return this }
    async sendTransaction() {
      if (this.provider?._failNative) throw new Error('native reverted')
      return { hash: '0xnative', wait: async () => ({ status: 1 }) }
    }
  }
  class StubContract {
    constructor(address, _abi, runner) {
      const provider = runner?.provider ?? runner
      this.address = address
      this.balanceOf = async () => provider?._balances?.[address.toLowerCase()] ?? 0n
      this.transfer = async (to, value) => {
        if (provider?._failToken === address.toLowerCase()) throw new Error('ERC20 transfer reverted')
        provider?._sent?.push({ address: address.toLowerCase(), to, value })
        return { hash: `0xtx_${address.slice(2, 8)}`, wait: async () => ({ status: 1 }) }
      }
    }
  }
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Wallet: StubWallet,
      HDNodeWallet: { ...actual.ethers.HDNodeWallet, fromPhrase: () => new StubWallet() },
      Contract: StubContract,
    },
  }
})

const PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

function makeProvider(balances, extra = {}) {
  return {
    getBalance: async () => balances.native ?? 0n,
    getFeeData: async () => ({ maxFeePerGas: GAS, gasPrice: GAS }),
    _balances: balances,
    _sent: [],
    ...extra,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('supportedAssetsForChain', () => {
  it('keeps native + erc20 and drops NFTs', () => {
    expect(supportedAssetsForChain(1).map((a) => a.symbol)).toEqual(['ETH', 'USDC', 'DAI'])
  })
})

describe('quoteAllAssets', () => {
  it('lists non-zero balances, ERC-20s first then native, and reserves gas', async () => {
    const provider = makeProvider({ native: 10n ** 17n, [USDC]: 5_000_000n })
    const q = await quoteAllAssets({ kind: 'privateKey', secret: PK, chainId: 1, provider })
    expect(q.from).toBe(LEGACY_ADDR)
    expect(q.holdings.map((h) => h.asset.symbol)).toEqual(['USDC', 'ETH']) // DAI zero → excluded
    expect(q.hasNative).toBe(true)
    expect(q.nativeGasReserve).toBe((21000n * GAS * 12n) / 10n)
  })

  it('omits native when the coin balance is zero', async () => {
    const provider = makeProvider({ native: 0n, [DAI]: 9n })
    const q = await quoteAllAssets({ kind: 'privateKey', secret: PK, chainId: 1, provider })
    expect(q.holdings.map((h) => h.asset.symbol)).toEqual(['DAI'])
    expect(q.hasNative).toBe(false)
  })
})

describe('sweepAllAssets', () => {
  it('transfers every non-zero asset (ERC-20s then native) with per-asset outcomes', async () => {
    const provider = makeProvider({ native: 10n ** 17n, [USDC]: 5_000_000n })
    const progress = []
    const outcomes = await sweepAllAssets({
      kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider,
      onProgress: (o) => progress.push(o.asset.symbol),
    })
    expect(outcomes.map((o) => `${o.asset.symbol}:${o.status}`)).toEqual(['USDC:sent', 'ETH:sent'])
    expect(progress).toEqual(['USDC', 'ETH'])
    expect(provider._sent).toHaveLength(1) // one ERC-20 transfer recorded
    expect(provider._sent[0].address).toBe(USDC)
  })

  it('continues past a single token failure and reports it honestly', async () => {
    const provider = makeProvider({ native: 10n ** 17n, [USDC]: 5_000_000n, [DAI]: 9n }, { _failToken: USDC })
    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })
    const bySym = Object.fromEntries(outcomes.map((o) => [o.asset.symbol, o.status]))
    expect(bySym).toEqual({ USDC: 'failed', DAI: 'sent', ETH: 'sent' })
  })

  it('skips native when it cannot cover the gas reserve', async () => {
    const provider = makeProvider({ native: 1000n })
    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })
    expect(outcomes).toEqual([
      { asset: expect.objectContaining({ symbol: 'ETH' }), status: 'skipped', error: expect.any(String) },
    ])
  })

  it('refuses an invalid destination', async () => {
    await expect(
      sweepAllAssets({ kind: 'privateKey', secret: PK, to: 'nope', chainId: 1, provider: makeProvider({ native: 10n ** 18n }) })
    ).rejects.toThrow(/valid destination/i)
  })

  it('refuses sweeping to the legacy account itself', async () => {
    await expect(
      sweepAllAssets({ kind: 'privateKey', secret: PK, to: LEGACY_ADDR, chainId: 1, provider: makeProvider({ native: 10n ** 18n }) })
    ).rejects.toThrow(/destination other than/i)
  })
})
