import { describe, it, expect } from 'vitest'
import {
  PIN_MODE,
  isEvmOption,
  nonEvmReason,
  samePair,
  bridgeDest,
  predicateForMode,
  createPin,
  filterByPin,
  revalidateSelection,
  ineligibleReason,
} from '../networkPin'

const opt = (over = {}) => ({
  key: `${over.chainId ?? 137}:${over.address ? over.address.toLowerCase() : 'native'}`,
  chainId: 137,
  kind: 'erc20',
  address: null,
  symbol: 'USDC',
  name: 'USD Coin',
  networkName: 'Polygon',
  balance: 0,
  ...over,
})

// The same cross-network list both contexts see: USDC + WETH + MATIC on Polygon,
// USDC + WETH on Ethereum, and Bitcoin (non-EVM, string chainId — spec 061).
const POLY_USDC = opt({ chainId: 137, address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', networkName: 'Polygon' })
const POLY_WETH = opt({ chainId: 137, address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', name: 'Wrapped Ether', networkName: 'Polygon' })
const POLY_NATIVE = opt({ chainId: 137, kind: 'native', symbol: 'POL', name: 'Polygon Ecosystem Token', networkName: 'Polygon' })
const ETH_USDC = opt({ chainId: 1, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', networkName: 'Ethereum' })
const ETH_WETH = opt({ chainId: 1, address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', networkName: 'Ethereum' })
const BTC = opt({ chainId: 'bitcoin', kind: 'btc-native', symbol: 'BTC', name: 'Bitcoin', networkName: 'Bitcoin', key: 'bitcoin:native' })

const ALL = [POLY_USDC, POLY_WETH, POLY_NATIVE, ETH_USDC, ETH_WETH, BTC]

describe('isEvmOption / nonEvmReason', () => {
  it('treats a numeric chainId as EVM and a string one (Bitcoin) as non-EVM', () => {
    expect(isEvmOption(POLY_USDC)).toBe(true)
    expect(isEvmOption(BTC)).toBe(false)
    expect(isEvmOption(undefined)).toBe(false)
  })

  it('states the reason a non-EVM asset is excluded rather than dropping it silently', () => {
    expect(nonEvmReason(POLY_USDC)).toBeNull()
    const reason = nonEvmReason(BTC)
    expect(reason).toMatch(/BTC/)
    expect(reason).toMatch(/Bitcoin/)
    expect(reason).toMatch(/EVM/)
  })
})

describe('createPin', () => {
  it('pins the chain, symbol, and mode of the first selected asset', () => {
    expect(createPin(POLY_USDC, PIN_MODE.SAME_NETWORK)).toEqual({
      pinnedChainId: 137,
      pinnedSymbol: 'USDC',
      mode: PIN_MODE.SAME_NETWORK,
      pinnedNetworkName: 'Polygon',
      pinnedKey: POLY_USDC.key,
    })
  })

  it('carries the network name so the pinned network can be shown (FR-062)', () => {
    expect(createPin(ETH_USDC, PIN_MODE.OTHER_NETWORK_SAME_ASSET).pinnedNetworkName).toBe('Ethereum')
  })

  it('refuses to pin a non-EVM asset or an unknown mode', () => {
    expect(createPin(BTC, PIN_MODE.SAME_NETWORK)).toBeNull()
    expect(createPin(BTC, PIN_MODE.OTHER_NETWORK_SAME_ASSET)).toBeNull()
    expect(createPin(POLY_USDC, 'whatever')).toBeNull()
    expect(createPin(null, PIN_MODE.SAME_NETWORK)).toBeNull()
  })
})

describe('samePair (pair contexts: swap, liquidity)', () => {
  const pin = createPin(POLY_USDC, PIN_MODE.SAME_NETWORK)

  it('keeps only assets on the pinned network', () => {
    const kept = filterByPin(ALL, pin, samePair)
    expect(kept.map((o) => o.key)).toEqual([POLY_USDC.key, POLY_WETH.key, POLY_NATIVE.key])
    expect(kept.every((o) => o.chainId === 137)).toBe(true)
  })

  it('rejects the same asset on another network', () => {
    expect(samePair(ETH_USDC, pin)).toBe(false)
  })

  it('rejects a non-EVM asset even though its chainId is not the pinned one', () => {
    expect(samePair(BTC, pin)).toBe(false)
  })

  it('rejects everything when there is no usable pin yet', () => {
    expect(samePair(POLY_USDC, null)).toBe(false)
    expect(samePair(POLY_USDC, { pinnedChainId: '137', mode: PIN_MODE.SAME_NETWORK })).toBe(false)
  })
})

describe('bridgeDest (bridge destination)', () => {
  const pin = createPin(POLY_USDC, PIN_MODE.OTHER_NETWORK_SAME_ASSET)

  it('keeps only the SAME asset on OTHER networks', () => {
    const kept = filterByPin(ALL, pin, bridgeDest)
    expect(kept.map((o) => o.key)).toEqual([ETH_USDC.key])
  })

  it('rejects the source network (a bridge is not a same-chain transfer)', () => {
    expect(bridgeDest(POLY_USDC, pin)).toBe(false)
  })

  it('rejects a different asset on another network', () => {
    expect(bridgeDest(ETH_WETH, pin)).toBe(false)
  })

  it('matches the symbol exactly, so a bridged variant is not a destination', () => {
    const usdce = opt({ chainId: 1, symbol: 'USDC.e', networkName: 'Ethereum', key: '1:usdce' })
    expect(bridgeDest(usdce, pin)).toBe(false)
  })

  it('rejects a non-EVM asset (Bitcoin bridging is not offered)', () => {
    const btcPin = { pinnedChainId: 137, pinnedSymbol: 'BTC', mode: PIN_MODE.OTHER_NETWORK_SAME_ASSET }
    expect(bridgeDest(BTC, btcPin)).toBe(false)
  })

  it('rejects everything when the pin carries no symbol', () => {
    expect(bridgeDest(ETH_USDC, { pinnedChainId: 137, mode: PIN_MODE.OTHER_NETWORK_SAME_ASSET })).toBe(false)
  })
})

// The point of the module: the two predicates are exact inverses, and swapping them
// is a silent failure (a "bridge" that never leaves its source chain still quotes and
// still signs) — research R11b.
describe('the inversion', () => {
  const pairPin = createPin(POLY_USDC, PIN_MODE.SAME_NETWORK)
  const bridgePin = createPin(POLY_USDC, PIN_MODE.OTHER_NETWORK_SAME_ASSET)

  it('the source asset itself passes samePair and fails bridgeDest', () => {
    expect(samePair(POLY_USDC, pairPin)).toBe(true)
    expect(bridgeDest(POLY_USDC, bridgePin)).toBe(false)
  })

  it('the same asset on another network fails samePair and passes bridgeDest', () => {
    expect(samePair(ETH_USDC, pairPin)).toBe(false)
    expect(bridgeDest(ETH_USDC, bridgePin)).toBe(true)
  })

  it('no EVM option satisfies both predicates for one pinned asset', () => {
    for (const o of ALL) {
      expect(samePair(o, pairPin) && bridgeDest(o, bridgePin)).toBe(false)
    }
  })

  it('applying samePair to a bridge would leave ONLY same-chain destinations', () => {
    // The silent bug this module exists to prevent: every "destination" is on the
    // source network, so the bridge is really a same-chain transfer.
    const wrong = filterByPin(ALL, bridgePin, samePair)
    expect(wrong.length).toBeGreaterThan(0)
    expect(wrong.every((o) => o.chainId === bridgePin.pinnedChainId)).toBe(true)
    expect(wrong.some((o) => bridgeDest(o, bridgePin))).toBe(false)
  })
})

describe('predicateForMode', () => {
  it('maps each mode to its own predicate', () => {
    expect(predicateForMode(PIN_MODE.SAME_NETWORK)).toBe(samePair)
    expect(predicateForMode(PIN_MODE.OTHER_NETWORK_SAME_ASSET)).toBe(bridgeDest)
  })

  it('qualifies nothing for an unknown mode (never a wide-open list)', () => {
    const p = predicateForMode(undefined)
    expect(ALL.some((o) => p(o, createPin(POLY_USDC, PIN_MODE.SAME_NETWORK)))).toBe(false)
  })

  it('is the default used by filterByPin and revalidateSelection', () => {
    const bridgePin = createPin(POLY_USDC, PIN_MODE.OTHER_NETWORK_SAME_ASSET)
    expect(filterByPin(ALL, bridgePin).map((o) => o.key)).toEqual([ETH_USDC.key])
    expect(revalidateSelection(POLY_WETH, createPin(POLY_USDC, PIN_MODE.SAME_NETWORK))).toBe(POLY_WETH)
  })
})

describe('revalidateSelection (re-pin)', () => {
  it('keeps a pair counterpart that is still on the newly pinned network', () => {
    const repin = createPin(POLY_NATIVE, PIN_MODE.SAME_NETWORK) // still Polygon
    expect(revalidateSelection(POLY_WETH, repin, samePair)).toBe(POLY_WETH)
  })

  it('clears a pair counterpart stranded on the old network', () => {
    const repin = createPin(ETH_USDC, PIN_MODE.SAME_NETWORK) // moved 137 → 1
    expect(revalidateSelection(POLY_WETH, repin, samePair)).toBeNull()
  })

  it('clears a bridge destination once it becomes the new source network', () => {
    const repin = createPin(ETH_USDC, PIN_MODE.OTHER_NETWORK_SAME_ASSET) // source moved to Ethereum
    expect(revalidateSelection(ETH_USDC, repin, bridgeDest)).toBeNull()
    expect(revalidateSelection(POLY_USDC, repin, bridgeDest)).toBe(POLY_USDC)
  })

  it('clears a bridge destination when the source asset changes symbol', () => {
    const repin = createPin(POLY_WETH, PIN_MODE.OTHER_NETWORK_SAME_ASSET)
    expect(revalidateSelection(ETH_USDC, repin, bridgeDest)).toBeNull()
    expect(revalidateSelection(ETH_WETH, repin, bridgeDest)).toBe(ETH_WETH)
  })

  it('clears the counterpart when the pin goes away, and tolerates no selection', () => {
    expect(revalidateSelection(POLY_WETH, null, samePair)).toBeNull()
    expect(revalidateSelection(null, createPin(POLY_USDC, PIN_MODE.SAME_NETWORK), samePair)).toBeNull()
  })
})

describe('ineligibleReason (FR-065 / FR-066)', () => {
  const pairPin = createPin(POLY_USDC, PIN_MODE.SAME_NETWORK)
  const bridgePin = createPin(POLY_USDC, PIN_MODE.OTHER_NETWORK_SAME_ASSET)

  it('is null for an eligible option in either context', () => {
    expect(ineligibleReason(POLY_WETH, pairPin, samePair)).toBeNull()
    expect(ineligibleReason(ETH_USDC, bridgePin, bridgeDest)).toBeNull()
  })

  it('names the non-EVM network rather than dropping the asset silently', () => {
    for (const [pin, predicate] of [[pairPin, samePair], [bridgePin, bridgeDest]]) {
      expect(ineligibleReason(BTC, pin, predicate)).toMatch(/isn't an EVM network/)
    }
  })

  it('explains a pair mismatch by naming both networks', () => {
    const reason = ineligibleReason(ETH_WETH, pairPin, samePair)
    expect(reason).toMatch(/Ethereum/)
    expect(reason).toMatch(/Polygon is pinned/)
  })

  it('explains a wrong-asset bridge destination', () => {
    expect(ineligibleReason(ETH_WETH, bridgePin, bridgeDest)).toMatch(/must also be USDC/)
  })

  it('explains that a same-chain bridge destination is the source', () => {
    expect(ineligibleReason(POLY_USDC, bridgePin, bridgeDest)).toMatch(/different network/)
  })

  it('asks for the first asset when nothing is pinned yet', () => {
    expect(ineligibleReason(POLY_WETH, null, samePair)).toMatch(/first asset/)
  })
})
