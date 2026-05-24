import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock rsaAccumulator to avoid heavy crypto operations in tests
vi.mock('../utils/rsaAccumulator', () => {
  const mockPrime = BigInt('0x1234567890abcdef')
  const mockHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
  const mockAddressHash = '0x9999888877776666555544443333222211110000aaaa9999888877776666555544'

  return {
    hashToPrime: vi.fn(() => mockPrime),
    computeMarketHash: vi.fn(() => mockHash),
    computeAddressHash: vi.fn(() => mockAddressHash),
    isProbablePrime: vi.fn((n) => n === mockPrime),
    bigintToHex: vi.fn((n) => '0x' + n.toString(16)),
    computeMarketHashSimple: vi.fn(() => mockHash),
  }
})

import {
  getMarketNullificationData,
  batchGetMarketPrimes,
  createMarketData,
  getAddressNullificationData,
  batchGetAddressPrimes,
  verifyMarketPrime,
  verifyAddressPrime,
  createNullificationSet,
  isMarketInNullificationSet,
  isAddressInNullificationSet,
  filterNullifiedMarkets,
  encodePrimeForContract,
  decodePrimeFromContract,
  prepareMarketHashForContract,
  prepareWitnessForContract,
  cacheNullificationData,
  loadCachedNullificationData,
  clearNullificationCache,
  computeMarketHashSimple,
} from '../utils/primeMapping'

import {
  hashToPrime,
  computeMarketHash,
  computeAddressHash,
  isProbablePrime,
} from '../utils/rsaAccumulator'

const VALID_ADDRESS = '0x1234567890123456789012345678901234567890'
const MOCK_PRIME = BigInt('0x1234567890abcdef')
const MOCK_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
const MOCK_ADDRESS_HASH = '0x9999888877776666555544443333222211110000aaaa9999888877776666555544'

describe('primeMapping', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getMarketNullificationData', () => {
    it('should compute hash and prime for a market', () => {
      const market = {
        proposalId: 1,
        collateralToken: VALID_ADDRESS,
        conditionId: '0x' + '0'.repeat(64),
        passPositionId: 1,
        failPositionId: 2,
      }

      const result = getMarketNullificationData(market)

      expect(result.hash).toBe(MOCK_HASH)
      expect(result.prime).toBe(MOCK_PRIME)
      expect(result.marketData).toBeDefined()
      expect(computeMarketHash).toHaveBeenCalled()
      expect(hashToPrime).toHaveBeenCalledWith(MOCK_HASH)
    })

    it('should handle market with alternative field names', () => {
      const market = {
        id: 5,
        collateral: VALID_ADDRESS,
      }

      const result = getMarketNullificationData(market)
      expect(result.hash).toBeDefined()
      expect(result.prime).toBeDefined()
    })

    it('should default missing fields', () => {
      const market = {}
      const result = getMarketNullificationData(market)
      expect(result.marketData.proposalId).toBe(0n)
      expect(result.marketData.passPositionId).toBe(0n)
      expect(result.marketData.failPositionId).toBe(0n)
    })
  })

  describe('batchGetMarketPrimes', () => {
    it('should compute primes for multiple markets', () => {
      const markets = [
        { id: '1', collateralToken: VALID_ADDRESS },
        { id: '2', collateralToken: VALID_ADDRESS },
      ]

      const results = batchGetMarketPrimes(markets)

      expect(results).toHaveLength(2)
      expect(results[0].marketId).toBe('1')
      expect(results[1].marketId).toBe('2')
      expect(results[0].hash).toBeDefined()
      expect(results[0].prime).toBeDefined()
    })

    it('should return empty array for empty input', () => {
      expect(batchGetMarketPrimes([])).toEqual([])
    })
  })

  describe('createMarketData', () => {
    it('should create market data object with BigInt conversions', () => {
      const data = createMarketData({
        proposalId: 42,
        collateralToken: VALID_ADDRESS,
        conditionId: '0x' + '0'.repeat(64),
        passPositionId: 1,
        failPositionId: 2,
      })

      expect(data.proposalId).toBe(42n)
      expect(data.collateralToken).toBe(VALID_ADDRESS)
      expect(data.passPositionId).toBe(1n)
      expect(data.failPositionId).toBe(2n)
    })
  })

  describe('getAddressNullificationData', () => {
    it('should compute hash and prime for an address', () => {
      const result = getAddressNullificationData(VALID_ADDRESS)

      expect(result.hash).toBe(MOCK_ADDRESS_HASH)
      expect(result.prime).toBe(MOCK_PRIME)
      expect(result.address).toBe(VALID_ADDRESS)
      expect(computeAddressHash).toHaveBeenCalledWith(VALID_ADDRESS)
    })

    it('should throw for invalid address', () => {
      expect(() => getAddressNullificationData('not-an-address')).toThrow('Invalid Ethereum address')
    })
  })

  describe('batchGetAddressPrimes', () => {
    it('should compute primes for multiple addresses', () => {
      const addresses = [VALID_ADDRESS, '0x0000000000000000000000000000000000000001']
      const results = batchGetAddressPrimes(addresses)

      expect(results).toHaveLength(2)
      expect(results[0].address).toBe(VALID_ADDRESS)
      expect(results[0].hash).toBeDefined()
      expect(results[0].prime).toBeDefined()
    })

    it('should return empty array for empty input', () => {
      expect(batchGetAddressPrimes([])).toEqual([])
    })
  })

  describe('verifyMarketPrime', () => {
    it('should return true for correct prime', () => {
      vi.mocked(isProbablePrime).mockReturnValue(true)
      vi.mocked(hashToPrime).mockReturnValue(MOCK_PRIME)

      expect(verifyMarketPrime(MOCK_HASH, MOCK_PRIME)).toBe(true)
    })

    it('should return false for non-prime', () => {
      vi.mocked(isProbablePrime).mockReturnValue(false)
      expect(verifyMarketPrime(MOCK_HASH, 4n)).toBe(false)
    })

    it('should return false for wrong prime', () => {
      vi.mocked(isProbablePrime).mockReturnValue(true)
      vi.mocked(hashToPrime).mockReturnValue(MOCK_PRIME)

      expect(verifyMarketPrime(MOCK_HASH, MOCK_PRIME + 2n)).toBe(false)
    })

    it('should handle string input for claimedPrime', () => {
      vi.mocked(isProbablePrime).mockReturnValue(true)
      vi.mocked(hashToPrime).mockReturnValue(MOCK_PRIME)

      expect(verifyMarketPrime(MOCK_HASH, MOCK_PRIME.toString())).toBe(true)
    })
  })

  describe('verifyAddressPrime', () => {
    it('should return true for correct prime', () => {
      vi.mocked(isProbablePrime).mockReturnValue(true)

      expect(verifyAddressPrime(VALID_ADDRESS, MOCK_PRIME)).toBe(true)
    })

    it('should return false for non-prime', () => {
      vi.mocked(isProbablePrime).mockReturnValue(false)
      expect(verifyAddressPrime(VALID_ADDRESS, 4n)).toBe(false)
    })

    it('should handle string input for claimedPrime', () => {
      vi.mocked(isProbablePrime).mockReturnValue(true)

      expect(verifyAddressPrime(VALID_ADDRESS, MOCK_PRIME.toString())).toBe(true)
    })
  })

  describe('createNullificationSet', () => {
    it('should create set from markets and addresses', () => {
      const markets = [{ id: '1', collateralToken: VALID_ADDRESS }]
      const addresses = [VALID_ADDRESS]

      const result = createNullificationSet(markets, addresses)

      expect(result.marketPrimes).toHaveLength(1)
      expect(result.addressPrimes).toHaveLength(1)
      expect(result.allPrimes).toHaveLength(2)
      expect(result.marketHashes).toBeInstanceOf(Set)
      expect(result.addressHashes).toBeInstanceOf(Set)
    })

    it('should handle empty inputs', () => {
      const result = createNullificationSet([], [])

      expect(result.marketPrimes).toHaveLength(0)
      expect(result.addressPrimes).toHaveLength(0)
      expect(result.allPrimes).toHaveLength(0)
    })

    it('should handle default parameters', () => {
      const result = createNullificationSet()

      expect(result.marketPrimes).toHaveLength(0)
      expect(result.addressPrimes).toHaveLength(0)
    })
  })

  describe('isMarketInNullificationSet', () => {
    it('should return true if market is in set', () => {
      const market = { id: '1', collateralToken: VALID_ADDRESS }
      const hashSet = new Set([MOCK_HASH])

      expect(isMarketInNullificationSet(market, hashSet)).toBe(true)
    })

    it('should return false if market is not in set', () => {
      const market = { id: '1', collateralToken: VALID_ADDRESS }
      const hashSet = new Set(['0xother'])

      expect(isMarketInNullificationSet(market, hashSet)).toBe(false)
    })
  })

  describe('isAddressInNullificationSet', () => {
    it('should return true if address is in set', () => {
      const hashSet = new Set([MOCK_ADDRESS_HASH])
      expect(isAddressInNullificationSet(VALID_ADDRESS, hashSet)).toBe(true)
    })

    it('should return false if address is not in set', () => {
      const hashSet = new Set(['0xother'])
      expect(isAddressInNullificationSet(VALID_ADDRESS, hashSet)).toBe(false)
    })
  })

  describe('filterNullifiedMarkets', () => {
    it('should filter out nullified markets', () => {
      const markets = [
        { id: '1', collateralToken: VALID_ADDRESS },
        { id: '2', collateralToken: VALID_ADDRESS },
      ]
      // All markets compute to MOCK_HASH
      const nullified = new Set([MOCK_HASH])

      const filtered = filterNullifiedMarkets(markets, nullified)
      expect(filtered).toHaveLength(0)
    })

    it('should keep non-nullified markets', () => {
      const markets = [
        { id: '1', collateralToken: VALID_ADDRESS },
      ]
      const nullified = new Set(['0xother'])

      const filtered = filterNullifiedMarkets(markets, nullified)
      expect(filtered).toHaveLength(1)
    })

    it('should handle empty markets array', () => {
      expect(filterNullifiedMarkets([], new Set())).toEqual([])
    })
  })

  describe('encodePrimeForContract', () => {
    it('should encode prime as 64-char hex string', () => {
      const encoded = encodePrimeForContract(255n)
      expect(encoded).toBe('0x' + 'ff'.padStart(64, '0'))
    })

    it('should pad to 32 bytes', () => {
      const encoded = encodePrimeForContract(1n)
      expect(encoded.length).toBe(66) // 0x + 64 hex chars
    })
  })

  describe('decodePrimeFromContract', () => {
    it('should decode hex string to bigint', () => {
      const decoded = decodePrimeFromContract('0xff')
      expect(decoded).toBe(255n)
    })

    it('should handle large numbers', () => {
      const large = '0x' + 'f'.repeat(64)
      const decoded = decodePrimeFromContract(large)
      expect(typeof decoded).toBe('bigint')
    })
  })

  describe('prepareMarketHashForContract', () => {
    it('should return hash for a market', () => {
      const market = { id: '1', collateralToken: VALID_ADDRESS }
      const hash = prepareMarketHashForContract(market)
      expect(hash).toBe(MOCK_HASH)
    })
  })

  describe('prepareWitnessForContract', () => {
    it('should encode witness data', () => {
      const witness = { d: 123n, b: 456n, dNegative: false }
      const result = prepareWitnessForContract(witness)

      expect(result.witnessD).toBeDefined()
      expect(result.witnessB).toBeDefined()
      expect(result.dNegative).toBe(false)
    })
  })

  describe('cacheNullificationData', () => {
    it('should cache data in localStorage', () => {
      const data = {
        marketHashes: new Set(['0xhash1', '0xhash2']),
        addressHashes: new Set(['0xaddr1']),
        accumulator: 12345n,
      }

      cacheNullificationData(data)

      const cached = localStorage.getItem('nullification_cache')
      expect(cached).not.toBeNull()
      const parsed = JSON.parse(cached)
      expect(parsed.marketHashes).toEqual(['0xhash1', '0xhash2'])
      expect(parsed.addressHashes).toEqual(['0xaddr1'])
      expect(parsed.timestamp).toBeGreaterThan(0)
    })

    it('should handle null accumulator', () => {
      const data = {
        marketHashes: new Set(),
        addressHashes: new Set(),
        accumulator: null,
      }

      cacheNullificationData(data)

      const cached = JSON.parse(localStorage.getItem('nullification_cache'))
      expect(cached.accumulator).toBeUndefined()
    })

    it('should handle localStorage errors', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full')
      })

      expect(() => cacheNullificationData({
        marketHashes: new Set(),
        addressHashes: new Set(),
      })).not.toThrow()

      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe('loadCachedNullificationData', () => {
    it('should load valid cached data', () => {
      const cacheData = {
        timestamp: Date.now(),
        marketHashes: ['0xhash1'],
        addressHashes: ['0xaddr1'],
        accumulator: 'abc',
      }
      localStorage.setItem('nullification_cache', JSON.stringify(cacheData))

      const result = loadCachedNullificationData()

      expect(result).not.toBeNull()
      expect(result.marketHashes).toBeInstanceOf(Set)
      expect(result.marketHashes.has('0xhash1')).toBe(true)
      expect(result.addressHashes).toBeInstanceOf(Set)
      expect(result.accumulator).toBe(BigInt('0xabc'))
    })

    it('should return null when no cache exists', () => {
      expect(loadCachedNullificationData()).toBeNull()
    })

    it('should return null and clear expired cache', () => {
      const oldCacheData = {
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
        marketHashes: [],
        addressHashes: [],
      }
      localStorage.setItem('nullification_cache', JSON.stringify(oldCacheData))

      const result = loadCachedNullificationData(5 * 60 * 1000) // 5 min max age
      expect(result).toBeNull()
      expect(localStorage.getItem('nullification_cache')).toBeNull()
    })

    it('should respect custom maxAge', () => {
      const recentCache = {
        timestamp: Date.now() - 1000,
        marketHashes: ['0xhash1'],
        addressHashes: [],
      }
      localStorage.setItem('nullification_cache', JSON.stringify(recentCache))

      const result = loadCachedNullificationData(60000) // 60 seconds
      expect(result).not.toBeNull()
    })

    it('should handle null accumulator in cache', () => {
      const cacheData = {
        timestamp: Date.now(),
        marketHashes: [],
        addressHashes: [],
        accumulator: null,
      }
      localStorage.setItem('nullification_cache', JSON.stringify(cacheData))

      const result = loadCachedNullificationData()
      expect(result.accumulator).toBeNull()
    })

    it('should handle parse errors', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      localStorage.setItem('nullification_cache', 'invalid-json')

      expect(loadCachedNullificationData()).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe('clearNullificationCache', () => {
    it('should remove cache from localStorage', () => {
      localStorage.setItem('nullification_cache', 'some-data')
      clearNullificationCache()
      expect(localStorage.getItem('nullification_cache')).toBeNull()
    })

    it('should not throw when no cache exists', () => {
      expect(() => clearNullificationCache()).not.toThrow()
    })
  })

  describe('re-exports', () => {
    it('should re-export computeMarketHashSimple', () => {
      expect(computeMarketHashSimple).toBeDefined()
      expect(typeof computeMarketHashSimple).toBe('function')
    })
  })
})
