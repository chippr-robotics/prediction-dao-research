import { describe, it, expect } from 'vitest'
import {
  BITCOIN_NETWORKS,
  BITCOIN_TESTNET_MAINNET_PAIR,
  isBitcoinNetworkId,
  getBitcoinNetwork,
  getActiveBitcoinNetworkId,
} from '../bitcoinNetworks'
import { NETWORKS } from '../networks'

describe('bitcoinNetworks registry (spec 061, contracts/network-registry.md)', () => {
  it('exposes exactly the two contract networks with string ids', () => {
    expect(Object.keys(BITCOIN_NETWORKS).sort()).toEqual(['bitcoin', 'bitcoin-testnet'])
    for (const net of Object.values(BITCOIN_NETWORKS)) {
      expect(typeof net.id).toBe('string')
      expect(net.kind).toBe('bitcoin')
    }
  })

  it('mainnet/testnet entries carry the contract constants', () => {
    const main = BITCOIN_NETWORKS.bitcoin
    expect(main).toMatchObject({
      isTestnet: false,
      gatewaySegment: 'mainnet',
      addressHrp: 'bc',
      coinType: 0,
    })
    const test = BITCOIN_NETWORKS['bitcoin-testnet']
    expect(test).toMatchObject({
      isTestnet: true,
      gatewaySegment: 'testnet',
      addressHrp: 'tb',
      coinType: 1,
    })
  })

  it('capabilities are honest: only portfolio/send/receive (+ stamps-only collect)', () => {
    for (const net of Object.values(BITCOIN_NETWORKS)) {
      const c = net.capabilities
      expect(c.portfolio).toBe(true)
      expect(c.send).toBe(true)
      expect(c.receive).toBe(true)
      expect(c.collect).toBe('stamps-only')
      for (const key of ['wagers', 'pools', 'membership', 'gasless', 'swap', 'earn', 'predict']) {
        expect(c[key]).toBe(false)
      }
    }
  })

  it('explorer builds tx and address URLs', () => {
    const { explorer } = BITCOIN_NETWORKS.bitcoin
    expect(explorer.tx('abc')).toBe('https://mempool.space/tx/abc')
    expect(explorer.address('bc1qxyz')).toBe('https://mempool.space/address/bc1qxyz')
    expect(BITCOIN_NETWORKS['bitcoin-testnet'].explorer.tx('abc')).toContain('/testnet4/')
  })

  it('isBitcoinNetworkId guards the boundary (no numeric leakage)', () => {
    expect(isBitcoinNetworkId('bitcoin')).toBe(true)
    expect(isBitcoinNetworkId('bitcoin-testnet')).toBe(true)
    expect(isBitcoinNetworkId(137)).toBe(false)
    expect(isBitcoinNetworkId('137')).toBe(false)
    expect(isBitcoinNetworkId(0)).toBe(false)
    expect(isBitcoinNetworkId(null)).toBe(false)
    expect(isBitcoinNetworkId(undefined)).toBe(false)
    expect(isBitcoinNetworkId('ethereum')).toBe(false)
    // prototype pollution safety
    expect(isBitcoinNetworkId('toString')).toBe(false)
  })

  it('getBitcoinNetwork soft-fails to null on unknown ids', () => {
    expect(getBitcoinNetwork('bitcoin')?.name).toBe('Bitcoin')
    expect(getBitcoinNetwork('dogecoin')).toBeNull()
    expect(getBitcoinNetwork(1)).toBeNull()
  })

  it('testnet/mainnet pairing follows the app toggle (FR-021)', () => {
    expect(BITCOIN_TESTNET_MAINNET_PAIR).toEqual(['bitcoin-testnet', 'bitcoin'])
    expect(getActiveBitcoinNetworkId(true)).toBe('bitcoin-testnet')
    expect(getActiveBitcoinNetworkId(false)).toBe('bitcoin')
  })

  it('never collides with the EVM NETWORKS registry', () => {
    // Bitcoin ids are strings and must not shadow numeric chainId keys.
    for (const id of Object.keys(BITCOIN_NETWORKS)) {
      expect(Object.prototype.hasOwnProperty.call(NETWORKS, id)).toBe(false)
    }
  })

  it('registry entries are frozen (config is immutable at runtime)', () => {
    expect(Object.isFrozen(BITCOIN_NETWORKS)).toBe(true)
    expect(Object.isFrozen(BITCOIN_NETWORKS.bitcoin)).toBe(true)
    expect(Object.isFrozen(BITCOIN_NETWORKS.bitcoin.capabilities)).toBe(true)
  })
})
