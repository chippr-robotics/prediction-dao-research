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
    async sendTransaction(tx) {
      if (this.provider?._failNative) throw new Error('native reverted')
      this.provider?._nonces?.push({ asset: 'native', nonce: tx?.nonce })
      this.provider?._sent?.push({ address: 'native', to: tx?.to, value: tx?.value })
      return { hash: '0xnative', wait: async () => ({ status: 1 }) }
    }
  }
  class StubContract {
    constructor(address, _abi, runner) {
      const provider = runner?.provider ?? runner
      this.address = address
      this.balanceOf = async () => provider?._balances?.[address.toLowerCase()] ?? 0n
      this.transfer = async (to, value, overrides) => {
        if (provider?._failToken === address.toLowerCase()) throw new Error('ERC20 transfer reverted')
        provider?._sent?.push({ address: address.toLowerCase(), to, value })
        provider?._nonces?.push({ asset: address.toLowerCase(), nonce: overrides?.nonce })
        // A real ERC-20 transfer pays for itself out of the sender's coin balance.
        if (provider?._gasPerTransfer) provider._balances.native -= provider._gasPerTransfer
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
    // Reads the LIVE balance, so a test can model the coin being spent on gas mid-sweep.
    getBalance: async () => balances.native ?? 0n,
    getFeeData: async () => ({ maxFeePerGas: GAS, gasPrice: GAS }),
    estimateGas: async () => 21000n, // EOA baseline unless a test overrides
    // The sweep reads the nonce ONCE and advances it itself; a real provider always has this.
    getTransactionCount: async () => 7,
    _balances: balances,
    _sent: [],
    _nonces: [],
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

  it('sizes the native reserve + gas limit from a gas estimate to the destination', async () => {
    // A smart-account recipient needs more than 21k; estimate to `to` and buffer 20%.
    const provider = makeProvider({ native: 10n ** 18n }, { estimateGas: async () => 90_000n })
    const q = await quoteAllAssets({ kind: 'privateKey', secret: PK, chainId: 1, provider, to: TO })
    expect(q.nativeGasLimit).toBe((90_000n * 12n) / 10n) // 108000
    expect(q.nativeGasReserve).toBe(((90_000n * 12n) / 10n) * GAS)
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
    // One ERC-20 transfer plus the native leg — `_sent` records both now.
    const erc20Legs = provider._sent.filter((t) => t.address !== 'native')
    expect(erc20Legs).toHaveLength(1)
    expect(erc20Legs[0].address).toBe(USDC)
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

  it('numbers each transfer itself, and a pre-broadcast failure consumes no nonce', async () => {
    /*
     * Regression (found by the full-tier sweep spec): every leg was left to the provider's own
     * nonce lookup, which is cached and can be stale, so the second transfer went out reusing
     * the first's nonce and was rejected as already used — stranding assets the member had been
     * told would move. The nonce is now read once and advanced per BROADCAST.
     */
    const provider = makeProvider({ native: 10n ** 17n, [USDC]: 5_000_000n, [DAI]: 9n }, { _failToken: USDC })
    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    expect(outcomes.map((o) => o.status)).toEqual(['failed', 'sent', 'sent'])
    // USDC never reached the chain, so it burned no nonce: DAI takes the first one, and the
    // native leg the next — consecutive, with no gap for the node to wait on forever.
    expect(provider._nonces).toEqual([
      { asset: DAI, nonce: 7 },
      { asset: 'native', nonce: 8 },
    ])
  })

  it('sizes the coin transfer from the balance LEFT after the token legs paid their gas', async () => {
    /*
     * Regression (found by the full-tier sweep spec): the native value was computed from the
     * quote's balance, taken before any ERC-20 moved. Each token transfer then spent coin on
     * gas, so the transfer asked for more than the account still held and the node rejected it
     * for insufficient funds — with any token to move first, the coin never left, and the member
     * saw a failure they could do nothing about.
     */
    const GAS_PER_TRANSFER = 30_000_000_000_000n
    const provider = makeProvider(
      { native: 10n ** 18n, [USDC]: 5_000_000n },
      { _gasPerTransfer: GAS_PER_TRANSFER },
    )
    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })
    expect(outcomes.map((o) => o.status)).toEqual(['sent', 'sent'])

    const nativeLeg = provider._sent.find((t) => t.address === 'native')
    const reserve = (21000n * GAS * 12n) / 10n
    // Sized from what is actually there (start − one transfer's gas), not from the quote.
    expect(nativeLeg.value).toBe(10n ** 18n - GAS_PER_TRANSFER - reserve)
    // …and the account can afford it, which is the whole point.
    expect(nativeLeg.value + reserve).toBeLessThanOrEqual(10n ** 18n - GAS_PER_TRANSFER)
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

/*
 * The native leg's reserve has to survive a RISING fee, not just a falling balance.
 *
 * `quoteAllAssets` reads the fee once, before anything has mined. Every ERC-20 leg then mines,
 * and on a chain whose base fee is climbing the native transfer's own max fee ends up larger than
 * the reserve set aside for it — `value + gas > balance`, the node refuses it for insufficient
 * funds, and the member is told their coin "failed" for a reason they could do nothing about.
 *
 * A REVERTING ERC-20 leg is the sharpest case: a reverted transfer consumes its whole gas limit,
 * which is exactly what fills a block and lifts the base fee. That is the shape of the full-tier
 * failure this was found by (`28-legacy-recovery-sweep.cy.js::LKR-S2`, which mines exactly one
 * reverting transfer before the coin moves).
 *
 * The balance re-read alone cannot catch it, which is why this is its own test.
 */
describe('sweepAllAssets — the native reserve tracks a rising fee', () => {
  const risingFeeProvider = (balances, { first, later }) => {
    let calls = 0
    return makeProvider(balances, {
      getFeeData: async () => {
        calls += 1
        return calls === 1 ? { maxFeePerGas: first, gasPrice: first } : { maxFeePerGas: later, gasPrice: later }
      },
    })
  }

  it('leaves enough behind to pay the fee that is current when the coin moves', async () => {
    const LATER = GAS * 3n
    const balance = 10n ** 17n
    const provider = risingFeeProvider({ native: balance, [USDC]: 5_000_000n }, { first: GAS, later: LATER })

    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const nativeSend = provider._sent.find((s) => s.address === 'native')
    expect(nativeSend, 'the coin still moved').toBeTruthy()

    // 21000 baseline * the 20% buffer the quote applies.
    const nativeGasLimit = (21000n * 12n) / 10n
    expect(
      nativeSend.value + nativeGasLimit * LATER,
      'what is sent plus what the CURRENT fee will cost must fit in the balance',
    ).toBeLessThanOrEqual(balance)
  })

  it('never reserves less than the quote did when the fee falls', async () => {
    // A cheaper fee is not a reason to cut the margin the member was quoted. The reserve is a
    // floor, so a falling fee simply leaves a little more behind — never less.
    const balance = 10n ** 17n
    const provider = risingFeeProvider({ native: balance }, { first: GAS, later: GAS / 4n })

    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const nativeSend = provider._sent.find((s) => s.address === 'native')
    const quotedReserve = ((21000n * 12n) / 10n) * GAS
    expect(nativeSend.value, 'the quoted reserve still stands').toBe(balance - quotedReserve)
  })
})
