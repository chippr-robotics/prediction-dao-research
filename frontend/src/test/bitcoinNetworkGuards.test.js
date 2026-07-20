/**
 * Bitcoin network guard rails (spec 061, T034 — network-registry rule 1,
 * FR-020/FR-022).
 *
 * Pins that the non-EVM string ids ('bitcoin', 'bitcoin-testnet') never leak
 * into EVM-typed surfaces: contract resolution, the portfolio scan registry,
 * wallet-switchable network lists, and the configs that drive wager/pool/
 * membership asset pickers. Assertions target cheap, stable CONFIG functions
 * rather than deep component mounts.
 */
import { describe, it, expect } from 'vitest'
import { getContractAddressForChain } from '../config/contracts'
import {
  NETWORKS,
  getNetwork,
  getSelectableNetworks,
  listSupportedChainIds,
  isSupportedChainId,
  getSubgraphUrl,
} from '../config/networks'
import { getNetworkFeatures } from '../config/networkCapabilities'
import {
  getPortfolioRegistry,
  getPortfolioChainIds,
  getBitcoinPortfolioAsset,
} from '../config/assetTaxonomy'
import {
  BITCOIN_NETWORKS,
  BITCOIN_TESTNET_MAINNET_PAIR,
  isBitcoinNetworkId,
} from '../config/bitcoinNetworks'

const BITCOIN_IDS = Object.keys(BITCOIN_NETWORKS) // ['bitcoin', 'bitcoin-testnet']
const CONTRACT_NAMES = [
  'wagerRegistry',
  'membershipManager',
  'wagerPoolFactory',
  'callsignRegistry',
  'feeRouter',
  'sanctionsGuard',
  'membershipVoucher',
]

describe('bitcoin network guard rails (spec 061)', () => {
  it('getContractAddressForChain resolves nothing (safely, no throw) for bitcoin ids', () => {
    for (const id of BITCOIN_IDS) {
      for (const name of CONTRACT_NAMES) {
        expect(() => getContractAddressForChain(name, id)).not.toThrow()
        expect(getContractAddressForChain(name, id)).toBeUndefined()
      }
    }
  })

  it('getPortfolioRegistry returns [] for bitcoin ids — the EVM scan never sees them', () => {
    for (const id of BITCOIN_IDS) {
      expect(getPortfolioRegistry(id)).toEqual([])
    }
  })

  it('bitcoin ids never appear in the wallet-switchable or supported chain lists', () => {
    const selectable = getSelectableNetworks().map((net) => net.chainId)
    const supported = listSupportedChainIds()
    const scanned = getPortfolioChainIds({ includeTestnets: true })
    for (const list of [selectable, supported, scanned]) {
      expect(list.length).toBeGreaterThan(0)
      for (const chainId of list) {
        expect(typeof chainId).toBe('number')
        expect(Number.isFinite(chainId)).toBe(true)
        expect(isBitcoinNetworkId(chainId)).toBe(false)
      }
    }
    for (const id of BITCOIN_IDS) {
      expect(isSupportedChainId(id)).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(NETWORKS, id)).toBe(false)
    }
  })

  it('getNetwork never yields a bitcoin config — the fallback stays an EVM network', () => {
    for (const id of BITCOIN_IDS) {
      const net = getNetwork(id)
      // Existing safe-fallback behavior: an unknown id resolves to the default
      // EVM network (numeric chainId), never a non-EVM entry.
      expect(typeof net.chainId).toBe('number')
      expect(net.kind).not.toBe('bitcoin')
    }
  })

  it('subgraph routing never resolves an endpoint for bitcoin ids', () => {
    for (const id of BITCOIN_IDS) {
      expect(getSubgraphUrl(id)).toBeNull()
    }
  })

  it('the capability-tag resolver reports every contract feature undeployed for bitcoin ids', () => {
    for (const id of BITCOIN_IDS) {
      const features = getNetworkFeatures(id)
      expect(features.length).toBeGreaterThan(0)
      expect(features.every((f) => f.deployed === false)).toBe(true)
    }
  })

  it('wager/pool/membership asset pickers can never offer BTC: no supported chain stakes in BTC', () => {
    // Stakes and membership payments are driven per-chain by nativeCurrency /
    // stablecoin config (useChainTokens); pin that no EVM chain names BTC.
    for (const chainId of listSupportedChainIds()) {
      const net = NETWORKS[chainId]
      expect(net.nativeCurrency?.symbol).not.toBe('BTC')
      expect(net.stablecoin?.symbol).not.toBe('BTC')
      // And the native-bitcoin portfolio asset never materializes for an EVM id.
      expect(getBitcoinPortfolioAsset(chainId)).toBeNull()
    }
  })

  it('isBitcoinNetworkId is a strict boundary guard: string registry ids only', () => {
    expect(isBitcoinNetworkId('bitcoin')).toBe(true)
    expect(isBitcoinNetworkId('bitcoin-testnet')).toBe(true)
    for (const value of [137, 1, 0, '137', 'polygon', '', null, undefined, {}, 'BITCOIN']) {
      expect(isBitcoinNetworkId(value)).toBe(false)
    }
    expect(BITCOIN_TESTNET_MAINNET_PAIR).toEqual(['bitcoin-testnet', 'bitcoin'])
  })

  it('bitcoin capabilities self-disclose honestly: value transfer only (FR-020)', () => {
    for (const id of BITCOIN_IDS) {
      const caps = BITCOIN_NETWORKS[id].capabilities
      expect(caps.portfolio).toBe(true)
      expect(caps.send).toBe(true)
      expect(caps.receive).toBe(true)
      expect(caps.collect).toBe('stamps-only')
      for (const off of ['wagers', 'pools', 'membership', 'gasless', 'swap', 'earn', 'predict']) {
        expect(caps[off]).toBe(false)
      }
    }
  })
})
