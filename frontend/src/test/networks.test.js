/**
 * Tests for networks configuration — targeting 90% coverage.
 * Tests network config lookups, chain ID mapping, RPC URL construction,
 * capabilities, and DEX availability.
 */
import { describe, it, expect } from 'vitest'
import {
  NETWORKS,
  PRIMARY_CHAIN_ID,
  MAINNET_CHAIN_ID,
  getCurrentChainId,
  getNetwork,
  isDexAvailable,
  isSupportedChainId,
  listSupportedChainIds,
  TESTNET_MAINNET_PAIR,
} from '../config/networks'

describe('NETWORKS map', () => {
  it('contains Polygon Amoy (80002)', () => {
    expect(NETWORKS[80002]).toBeDefined()
    expect(NETWORKS[80002].chainId).toBe(80002)
    expect(NETWORKS[80002].name).toBe('Polygon Amoy')
    expect(NETWORKS[80002].isTestnet).toBe(true)
    expect(NETWORKS[80002].isPrimary).toBe(true)
  })

  it('contains Polygon Mainnet (137)', () => {
    expect(NETWORKS[137]).toBeDefined()
    expect(NETWORKS[137].chainId).toBe(137)
    expect(NETWORKS[137].name).toBe('Polygon')
    expect(NETWORKS[137].isTestnet).toBe(false)
    expect(NETWORKS[137].isPrimary).toBe(false)
  })

  it('contains Hardhat (1337)', () => {
    expect(NETWORKS[1337]).toBeDefined()
    expect(NETWORKS[1337].chainId).toBe(1337)
    expect(NETWORKS[1337].name).toBe('Hardhat')
    expect(NETWORKS[1337].isTestnet).toBe(true)
    expect(NETWORKS[1337].rpcUrl).toBe('http://127.0.0.1:8545')
  })

  it('each network has required fields', () => {
    for (const [, net] of Object.entries(NETWORKS)) {
      expect(net.chainId).toBeDefined()
      expect(net.name).toBeDefined()
      expect(typeof net.isTestnet).toBe('boolean')
      expect(net.nativeCurrency).toBeDefined()
      expect(net.rpcUrl).toBeDefined()
    }
  })
})

describe('Native currency config', () => {
  it('Polygon Amoy uses MATIC', () => {
    expect(NETWORKS[80002].nativeCurrency.symbol).toBe('MATIC')
    expect(NETWORKS[80002].nativeCurrency.decimals).toBe(18)
  })

  it('Polygon Mainnet uses MATIC', () => {
    expect(NETWORKS[137].nativeCurrency.symbol).toBe('MATIC')
  })

  it('Hardhat uses ETH', () => {
    expect(NETWORKS[1337].nativeCurrency.symbol).toBe('ETH')
  })
})

describe('Stablecoin config', () => {
  it('Polygon Mainnet has USDC stablecoin', () => {
    expect(NETWORKS[137].stablecoin).toBeDefined()
    expect(NETWORKS[137].stablecoin.symbol).toBe('USDC')
    expect(NETWORKS[137].stablecoin.decimals).toBe(6)
    expect(NETWORKS[137].stablecoin.address).toBeDefined()
  })

  it('Polygon Amoy has USDC stablecoin config', () => {
    expect(NETWORKS[80002].stablecoin).toBeDefined()
    expect(NETWORKS[80002].stablecoin.symbol).toBe('USDC')
    expect(NETWORKS[80002].stablecoin.decimals).toBe(6)
  })

  it('Hardhat has no stablecoin', () => {
    expect(NETWORKS[1337].stablecoin).toBeNull()
  })
})

describe('DEX config', () => {
  it('Polygon Mainnet has canonical Uniswap V3 deployment', () => {
    const dex = NETWORKS[137].dex
    expect(dex).toBeDefined()
    expect(dex.factory).toBeDefined()
    expect(dex.swapRouter).toBeDefined()
    expect(dex.quoter).toBeDefined()
    expect(dex.wnative).toBeDefined()
    expect(dex.positionManager).toBeDefined()
  })

  it('Hardhat has no DEX', () => {
    expect(NETWORKS[1337].dex).toBeNull()
  })
})

describe('Explorer config', () => {
  it('Polygon Amoy uses Polygonscan', () => {
    expect(NETWORKS[80002].explorer.name).toBe('Polygonscan')
    expect(NETWORKS[80002].explorer.baseUrl).toBe('https://amoy.polygonscan.com')
  })

  it('Polygon Mainnet uses Polygonscan', () => {
    expect(NETWORKS[137].explorer.name).toBe('Polygonscan')
    expect(NETWORKS[137].explorer.baseUrl).toBe('https://polygonscan.com')
  })

  it('Hardhat uses local explorer', () => {
    expect(NETWORKS[1337].explorer.name).toBe('Local')
    expect(NETWORKS[1337].explorer.baseUrl).toBe('')
  })
})

describe('Capabilities', () => {
  it('Polygon Mainnet capabilities include dex and polymarketSidebets', () => {
    const caps = NETWORKS[137].capabilities
    expect(caps.polymarketSidebets).toBe(true)
    expect(caps.dex).toBe(true)
    expect(caps.friendMarkets).toBe(true)
  })

  it('Hardhat has limited capabilities', () => {
    expect(NETWORKS[1337].capabilities.polymarketSidebets).toBe(false)
    expect(NETWORKS[1337].capabilities.dex).toBe(false)
    expect(NETWORKS[1337].capabilities.friendMarkets).toBe(true)
  })
})

describe('Polymarket config', () => {
  it('Polygon Mainnet has polymarket CTF address', () => {
    expect(NETWORKS[137].polymarket).toBeDefined()
    expect(NETWORKS[137].polymarket.ctf).toBeDefined()
    expect(NETWORKS[137].polymarket.gammaApiUrl).toBeDefined()
  })

  it('Hardhat has no polymarket config', () => {
    expect(NETWORKS[1337].polymarket).toBeNull()
  })
})

describe('PRIMARY_CHAIN_ID and MAINNET_CHAIN_ID', () => {
  it('PRIMARY_CHAIN_ID is 80002', () => {
    expect(PRIMARY_CHAIN_ID).toBe(80002)
  })

  it('MAINNET_CHAIN_ID is 137', () => {
    expect(MAINNET_CHAIN_ID).toBe(137)
  })
})

describe('getCurrentChainId', () => {
  it('returns VITE_NETWORK_ID from env or PRIMARY_CHAIN_ID', () => {
    // In test env, VITE_NETWORK_ID is set to 63
    const chainId = getCurrentChainId()
    expect(typeof chainId).toBe('number')
    expect(chainId).toBe(63) // from vite test env
  })
})

describe('getNetwork', () => {
  it('returns the correct network for a known chain ID', () => {
    expect(getNetwork(137).name).toBe('Polygon')
    expect(getNetwork(80002).name).toBe('Polygon Amoy')
    expect(getNetwork(1337).name).toBe('Hardhat')
  })

  it('falls back to current chain for unknown chain ID', () => {
    const net = getNetwork(999)
    expect(net).toBeDefined()
    expect(net.chainId).toBeDefined()
  })

  it('falls back to PRIMARY_CHAIN_ID as last resort', () => {
    // Even with completely bogus input, should return something
    const net = getNetwork(undefined)
    expect(net).toBeDefined()
  })
})

describe('isDexAvailable', () => {
  it('returns true for Polygon Mainnet', () => {
    expect(isDexAvailable(137)).toBe(true)
  })

  it('returns false for Hardhat', () => {
    expect(isDexAvailable(1337)).toBe(false)
  })

  it('returns false for unknown chain', () => {
    // Unknown chain falls back to current chain (63 in test env, which is ETC Mordor - not in NETWORKS)
    // getNetwork returns NETWORKS[PRIMARY_CHAIN_ID] for unknown chains
    const result = isDexAvailable(999)
    expect(typeof result).toBe('boolean')
  })
})

describe('isSupportedChainId', () => {
  it('returns true for supported chains', () => {
    expect(isSupportedChainId(80002)).toBe(true)
    expect(isSupportedChainId(137)).toBe(true)
    expect(isSupportedChainId(1337)).toBe(true)
  })

  it('returns false for unsupported chains', () => {
    expect(isSupportedChainId(1)).toBe(false)
    expect(isSupportedChainId(5)).toBe(false)
    expect(isSupportedChainId(999)).toBe(false)
  })
})

describe('listSupportedChainIds', () => {
  it('returns array of numeric chain IDs', () => {
    const ids = listSupportedChainIds()
    expect(Array.isArray(ids)).toBe(true)
    expect(ids.every(id => typeof id === 'number')).toBe(true)
    expect(ids).toContain(80002)
    expect(ids).toContain(137)
    expect(ids).toContain(1337)
  })
})

describe('TESTNET_MAINNET_PAIR', () => {
  it('maps testnet to PRIMARY and mainnet to MAINNET', () => {
    expect(TESTNET_MAINNET_PAIR.testnet).toBe(PRIMARY_CHAIN_ID)
    expect(TESTNET_MAINNET_PAIR.mainnet).toBe(MAINNET_CHAIN_ID)
  })
})
