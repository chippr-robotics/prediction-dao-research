/**
 * Multi-asset sweep (spec 062, US2) — quoteAllAssets / sweepAllAssets.
 * A stub registry, provider, signer, and contract drive enumeration, ordering,
 * gas reserve, and per-asset outcome behavior (including partial failure).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  quoteAllAssets,
  sweepAllAssets,
  supportedAssetsForChain,
  describeTransferFailure,
} from '../../lib/recovery/legacyKeys'

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
      // `_failNative` may be a bare flag or the actual error object a node/library would raise,
      // so a test can drive how the failure is REPORTED and not only that it happened.
      if (this.provider?._failNative) {
        throw this.provider._failNative === true ? new Error('native reverted') : this.provider._failNative
      }
      this.provider?._nonces?.push({ asset: 'native', nonce: tx?.nonce })
      this.provider?._sent?.push({
        address: 'native',
        to: tx?.to,
        value: tx?.value,
        gasLimit: tx?.gasLimit,
        // The fee the sweep asked for, or undefined where it left the choice to the library.
        maxFeePerGas: tx?.maxFeePerGas,
        maxPriorityFeePerGas: tx?.maxPriorityFeePerGas,
        gasPrice: tx?.gasPrice,
      })
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
        provider?._sent?.push({
          address: address.toLowerCase(),
          to,
          value,
          // The fee the sweep asked for, or undefined where it left the choice to the library.
          maxFeePerGas: overrides?.maxFeePerGas,
          maxPriorityFeePerGas: overrides?.maxPriorityFeePerGas,
          gasPrice: overrides?.gasPrice,
        })
        provider?._nonces?.push({ asset: address.toLowerCase(), nonce: overrides?.nonce })
        // A real ERC-20 transfer pays for itself out of the sender's coin balance.
        const fee = provider?._gasPerTransfer ?? 0n
        if (fee) provider._balances.native -= fee
        return {
          hash: `0xtx_${address.slice(2, 8)}`,
          // A real receipt states what the transfer actually cost; the sweep reads it to keep its
          // own running figure for the coin, independent of the (cacheable) balance read.
          wait: async () => (fee ? { status: 1, fee } : { status: 1 }),
        }
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
      {
        asset: expect.objectContaining({ symbol: 'ETH' }),
        status: 'skipped',
        error: expect.any(String),
        // Why it could not: the price used, what was reserved, and what was there (issues
        // #1301/#1327). Without these a CI-only failure says an asset did not move, not by how
        // much it missed.
        detail: {
          gasPrice: String(GAS),
          gasLimit: String((21000n * 12n) / 10n),
          reserve: String(((21000n * 12n) / 10n) * GAS),
          balance: '1000',
          coinBalance: '1000',
        },
      },
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

  /*
   * The reserve leaves ZERO margin by construction: `value` is `balance - gasLimit * price`, so
   * the node's funding check (`value + gasLimit * maxFeePerGas <= balance`) is satisfied only
   * while the price on the transaction is no higher than the price the reserve was sized from.
   *
   * Left to the library that price is read a THIRD time, during populate — after the sweep's own
   * re-read, with nothing between them. A fee that ticks up in that window refuses the coin for
   * insufficient funds and reports it as a failure the member could do nothing about: the exact
   * outcome the reserve exists to prevent, reached by a narrower door. Pinning the fee to the
   * reserved price turns the inequality into an identity, so there is no window left to lose.
   */
  it('sends the coin at the price its reserve was sized from, leaving no window to lose', async () => {
    const balance = 10n ** 17n
    const provider = makeProvider({ native: balance, [USDC]: 5_000_000n })

    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const nativeSend = provider._sent.find((s) => s.address === 'native')
    const nativeGasLimit = (21000n * 12n) / 10n
    expect(nativeSend.maxFeePerGas, 'the fee is stated, not left to be read again').toBe(GAS)
    expect(
      nativeSend.value + nativeGasLimit * nativeSend.maxFeePerGas,
      'what is sent plus what the stated fee can cost is exactly the balance',
    ).toBe(balance)
  })

  it('pins the RISEN price when the fee moved between the quote and the send', async () => {
    const LATER = GAS * 3n
    const balance = 10n ** 17n
    const provider = risingFeeProvider({ native: balance, [USDC]: 5_000_000n }, { first: GAS, later: LATER })

    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const nativeSend = provider._sent.find((s) => s.address === 'native')
    expect(nativeSend.maxFeePerGas, 'the transaction carries the fee that was reserved').toBe(LATER)
  })

  it('pins gasPrice on a chain that prices in gasPrice, and no 1559 fields', async () => {
    // A chain with no EIP-1559 fee data must not be handed maxFeePerGas — the node would reject
    // a type-2 transaction it cannot price. The reserve is the same arithmetic either way.
    const balance = 10n ** 17n
    const provider = makeProvider({ native: balance }, {
      getFeeData: async () => ({ maxFeePerGas: null, gasPrice: GAS }),
    })

    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const nativeSend = provider._sent.find((s) => s.address === 'native')
    expect(nativeSend.gasPrice, 'the legacy price is stated').toBe(GAS)
    expect(nativeSend.maxFeePerGas, 'no 1559 fields on a legacy-priced chain').toBeUndefined()
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

/*
 * The marginal draw the full-tier spec kept hitting (issues #1301 / #1327).
 *
 * `28-legacy-recovery-sweep.cy.js::LKR-S2` failed intermittently with the coin reported as
 *   `MATIC failed — could not coalesce error`
 * while the token behind it moved. Two facts produce that exactly:
 *
 *  1. ethers shares an identical `getBalance` for 250ms (`AbstractProvider` `cacheTimeout`), and a
 *     failover RPC pool (spec 069) can answer from a node that has not yet seen the token transfer.
 *     On a fast local chain the ERC-20 leg mines well inside that window, so the coin leg's
 *     "fresh" re-read comes back as the balance BEFORE that leg paid its gas. `value + gas` is then
 *     larger than the account really holds and the node refuses the transaction.
 *  2. Hardhat's refusal reads "Sender doesn't have enough funds to send tx…", which matches none
 *     of the shapes ethers knows, so it is wrapped as `could not coalesce error` — a placeholder
 *     that names no cause. That is what reached the member.
 *
 * The fix has both halves: the coin leg is sized from the SMALLER of the live read and the sweep's
 * own receipt-tracked figure, and no failure is ever reported in the library's placeholder words.
 */
describe('sweepAllAssets — a stale balance read never over-sizes the coin leg', () => {
  const GAS_PER_TRANSFER = 30_000_000_000_000n

  /** A provider whose balance read is frozen at the quote — exactly what the 250ms cache serves. */
  const staleReadProvider = (balances, extra = {}) => {
    const atQuote = balances.native
    return makeProvider(balances, {
      _gasPerTransfer: GAS_PER_TRANSFER,
      getBalance: async () => atQuote,
      ...extra,
    })
  }

  it('sizes the coin from the receipts when the balance read is stale', async () => {
    const start = 10n ** 17n
    const balances = { native: start, [USDC]: 5_000_000n }
    const provider = staleReadProvider(balances)

    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })
    expect(outcomes.map((o) => `${o.asset.symbol}:${o.status}`)).toEqual(['USDC:sent', 'ETH:sent'])

    const nativeLeg = provider._sent.find((t) => t.address === 'native')
    const reserve = ((21000n * 12n) / 10n) * GAS
    // The read still says `start`; the receipt says a transfer's gas has gone. The smaller governs.
    expect(nativeLeg.value, 'sized from the receipt, not from the stale read')
      .toBe(start - GAS_PER_TRANSFER - reserve)
    expect(
      nativeLeg.value + reserve,
      'what is sent plus what its own fee can cost still fits what the account HOLDS',
    ).toBeLessThanOrEqual(balances.native)
  })

  it('stays affordable when the price jumps between the quote and the send', async () => {
    // Both failures at once: the read is stale AND the fee rose after the quote — the draw the
    // reserve was still marginal under.
    const LATER = GAS * 3n
    const start = 10n ** 17n
    const balances = { native: start, [USDC]: 5_000_000n }
    let feeCalls = 0
    const provider = staleReadProvider(balances, {
      getFeeData: async () => {
        feeCalls += 1
        return feeCalls === 1 ? { maxFeePerGas: GAS, gasPrice: GAS } : { maxFeePerGas: LATER, gasPrice: LATER }
      },
    })

    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })
    expect(outcomes.map((o) => o.status)).toEqual(['sent', 'sent'])

    const nativeLeg = provider._sent.find((t) => t.address === 'native')
    const nativeGasLimit = (21000n * 12n) / 10n
    expect(nativeLeg.maxFeePerGas, 'the coin carries the risen price its reserve was sized from').toBe(LATER)
    expect(
      nativeLeg.value + nativeGasLimit * nativeLeg.maxFeePerGas,
      'the node funding check holds against the balance that is really there',
    ).toBeLessThanOrEqual(balances.native)
  })

  it('degrades to a skipped coin with an honest reason when the draw leaves nothing', async () => {
    // A token leg that eats almost the whole coin balance: there is genuinely nothing left to move
    // after the fee, and that must read as "skipped, not enough for the fee" — never as a node
    // refusal the member cannot interpret.
    const reserve = ((21000n * 12n) / 10n) * GAS
    const start = reserve + 10n
    const provider = staleReadProvider({ native: start, [USDC]: 5_000_000n }, { _gasPerTransfer: 100n })

    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })
    const coin = outcomes.find((o) => o.asset.symbol === 'ETH')
    expect(coin.status).toBe('skipped')
    expect(coin.error).toMatch(/network fee/i)
    // Nothing was signed for it — a refusal that never reaches the chain costs nothing.
    expect(provider._sent.some((s) => s.address === 'native')).toBe(false)
    // And it says by how much: price, reserve, and what was actually left.
    expect(coin.detail).toEqual({
      gasPrice: String(GAS),
      gasLimit: String((21000n * 12n) / 10n),
      reserve: String(reserve),
      balance: String(start - 100n),
      coinBalance: String(start - 100n),
    })
  })
})

/*
 * The ERC-20 legs get the same treatment as the coin leg (issue #1301).
 *
 * Left to the library, every token transfer reads the fee again at populate time — so the coin
 * those legs burn is decided by a price the sweep never saw, taken out of the very balance the
 * coin leg's reserve is computed from. Pinning makes what a leg can cost knowable BEFORE it is
 * sent, which is what lets the reserve behind it be sized from a schedule nothing has invalidated.
 */
describe('sweepAllAssets — the ERC-20 legs are pinned to the same fee schedule', () => {
  it('states the fee on a token transfer instead of leaving it to be read again', async () => {
    const provider = makeProvider({ native: 10n ** 17n, [USDC]: 5_000_000n })
    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const tokenLeg = provider._sent.find((t) => t.address === USDC)
    expect(tokenLeg.maxFeePerGas, 'the token leg carries the fee, not a promise to look it up').toBe(GAS)
    expect(tokenLeg.maxPriorityFeePerGas).toBe(0n)
    expect(tokenLeg.gasPrice, 'no legacy field on a 1559-priced chain').toBeUndefined()
  })

  it('pins gasPrice on a chain that prices in gasPrice, and no 1559 fields', async () => {
    const provider = makeProvider({ native: 10n ** 17n, [USDC]: 5_000_000n }, {
      getFeeData: async () => ({ maxFeePerGas: null, gasPrice: GAS }),
    })
    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const tokenLeg = provider._sent.find((t) => t.address === USDC)
    expect(tokenLeg.gasPrice).toBe(GAS)
    expect(tokenLeg.maxFeePerGas).toBeUndefined()
  })

  it('never pins a token leg BELOW a risen base fee — the schedule only goes up', async () => {
    // A pinned price that the chain has already outgrown is its own stranding: the transfer sits
    // unmineable and `wait()` never returns. The schedule is monotone for exactly that reason.
    const LATER = GAS * 4n
    let feeCalls = 0
    const provider = makeProvider({ native: 10n ** 18n, [USDC]: 5_000_000n }, {
      getFeeData: async () => {
        feeCalls += 1
        return feeCalls === 1 ? { maxFeePerGas: GAS, gasPrice: GAS } : { maxFeePerGas: LATER, gasPrice: LATER }
      },
    })
    await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const tokenLeg = provider._sent.find((t) => t.address === USDC)
    expect(tokenLeg.maxFeePerGas, 'the token leg pays the fee that is current when it goes out').toBe(LATER)
  })

  it('reports a token failure with the price, the reserve and the balances it saw', async () => {
    const provider = makeProvider({ native: 10n ** 17n, [USDC]: 5_000_000n }, { _failToken: USDC })
    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })

    const token = outcomes.find((o) => o.asset.symbol === 'USDC')
    expect(token.status).toBe('failed')
    expect(token.detail).toEqual({
      gasPrice: String(GAS),
      reserve: String(((21000n * 12n) / 10n) * GAS),
      balance: '5000000',
      coinBalance: String(10n ** 17n),
    })
    // `toEqual` above is the guard that a diagnostic carries fees and balances and NOTHING else:
    // a key, an address or a mnemonic appearing here would fail it outright.
  })
})

/*
 * `could not coalesce error` must never be what a member (or a CI log) is left with.
 *
 * ethers raises it whenever a JSON-RPC failure matches none of the shapes it knows — which
 * includes Hardhat's insufficient-funds wording, because that wording does not contain the string
 * "insufficient funds". The underlying error is still attached, and reaching for it is the
 * difference between naming the cause and naming nothing.
 */
describe('describeTransferFailure', () => {
  const coalesced = (nodeMessage) => {
    const e = new Error('could not coalesce error')
    e.shortMessage = 'could not coalesce error'
    e.code = 'UNKNOWN_ERROR'
    if (nodeMessage) e.error = { code: -32000, message: nodeMessage }
    return e
  }

  it('names the fee when the node refused for want of funds, in words ethers does not know', () => {
    expect(
      describeTransferFailure(coalesced(
        "Sender doesn't have enough funds to send tx. The max upfront cost is: 1000 and the sender's account only has: 999",
      )),
    ).toMatch(/network fee/i)
  })

  it('falls back to the node’s own words rather than the placeholder', () => {
    expect(describeTransferFailure(coalesced('replacement transaction rejected by the pool')))
      .toBe('replacement transaction rejected by the pool')
  })

  it('never returns the placeholder, even with nothing underneath it', () => {
    const text = describeTransferFailure(coalesced(null))
    expect(text).not.toMatch(/coalesce/i)
    expect(text).toMatch(/refused/i)
  })

  it('passes a contract revert reason through unchanged', () => {
    const e = new Error('execution reverted')
    e.reason = 'ERC20: transfer amount exceeds balance'
    expect(describeTransferFailure(e)).toBe('ERC20: transfer amount exceeds balance')
  })

  it('is what the coin leg reports when the node refuses it', async () => {
    const provider = makeProvider({ native: 10n ** 17n }, {
      _failNative: (() => {
        const e = new Error('could not coalesce error')
        e.shortMessage = 'could not coalesce error'
        e.error = { message: "Sender doesn't have enough funds to send tx." }
        return e
      })(),
    })
    const outcomes = await sweepAllAssets({ kind: 'privateKey', secret: PK, to: TO, chainId: 1, provider })
    expect(outcomes[0].status).toBe('failed')
    expect(outcomes[0].error).not.toMatch(/coalesce/i)
    expect(outcomes[0].error).toMatch(/network fee/i)
    expect(outcomes[0].detail.gasPrice).toBe(String(GAS))
  })
})
