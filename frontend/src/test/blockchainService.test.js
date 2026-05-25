import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock ethers - must be before imports
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: vi.fn(),
      Contract: vi.fn(),
      keccak256: actual.ethers.keccak256,
      toUtf8Bytes: actual.ethers.toUtf8Bytes,
      isAddress: actual.ethers.isAddress,
      ZeroAddress: actual.ethers.ZeroAddress,
      formatUnits: actual.ethers.formatUnits,
    },
  }
})

vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => null),
  NETWORK_CONFIG: { rpcUrl: 'http://localhost:8545' },
  DEPLOYMENT_BLOCKS: { friendGroupMarketFactory: 0 },
  DEPLOYED_CONTRACTS: { paymentToken: '0xUSDC' },
}))

vi.mock('../abis/ERC20', () => ({ ERC20_ABI: [] }))
vi.mock('../abis/ZKKeyManager', () => ({ ZK_KEY_MANAGER_ABI: [] }))
vi.mock('../abis/FriendGroupMarketFactory', () => ({ FRIEND_GROUP_MARKET_FACTORY_ABI: [] }))
vi.mock('../abis/WagerRegistry', () => ({ WAGER_REGISTRY_ABI: [] }))
vi.mock('../abis/MembershipManager', () => ({ MEMBERSHIP_MANAGER_ABI: [] }))
vi.mock('../abis/KeyRegistry', () => ({ KEY_REGISTRY_ABI: [] }))

vi.mock('../constants/dex', () => ({
  DEX_ADDRESSES: {
    STABLECOIN: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
}))

vi.mock('../constants/wagerDefaults', () => ({
  WAGER_DEFAULTS: {
    ACCEPTANCE_DEADLINE_HOURS: 48,
    MIN_ACCEPTANCE_THRESHOLD: 1,
  },
}))

vi.mock('../utils/ipfsService', () => ({
  parseEncryptedIpfsReference: vi.fn((desc) => ({
    isIpfs: false,
    cid: null,
    raw: desc,
  })),
}))

import {
  isMarketPrivateOrFriend,
  getMarketPrivacyReason,
  canUserViewMarket,
  getRoleHash,
  TIER_NAMES,
  fetchFriendMarketsForUser,
  checkRoleSyncNeeded,
  getUserTierOnChain,
  getContract,
  fetchMarketMetadataFromUri,
} from '../utils/blockchainService'

describe('blockchainService: pure logic functions', () => {
  // ===== isMarketPrivateOrFriend =====
  describe('isMarketPrivateOrFriend', () => {
    it('returns true for encrypted metadata (method 1)', () => {
      const market = { metadata: { encrypted: true } }
      expect(isMarketPrivateOrFriend(market)).toBe(true)
    })

    it('returns true when Market Source attribute is "friend" (method 2)', () => {
      const market = {
        metadata: {
          attributes: [
            { trait_type: 'Market Source', value: 'friend' }
          ]
        }
      }
      expect(isMarketPrivateOrFriend(market)).toBe(true)
    })

    it('returns true for proposalId in friend range (method 3)', () => {
      const market = {
        proposalId: 5_000_000,
        metadata: {}
      }
      expect(isMarketPrivateOrFriend(market)).toBe(true)
    })

    it('returns false for proposalId below friend range', () => {
      const market = {
        proposalId: 100,
        metadata: {}
      }
      expect(isMarketPrivateOrFriend(market)).toBe(false)
    })

    it('returns false for proposalId at or above the max', () => {
      const market = {
        proposalId: 10_000_000_000,
        metadata: {}
      }
      expect(isMarketPrivateOrFriend(market)).toBe(false)
    })

    it('returns false for public market with no matching criteria', () => {
      const market = {
        proposalId: 500,
        metadata: {
          attributes: [
            { trait_type: 'Market Source', value: 'public' }
          ]
        }
      }
      expect(isMarketPrivateOrFriend(market)).toBe(false)
    })

    it('returns false when metadata is null', () => {
      const market = { metadata: null, proposalId: 500 }
      expect(isMarketPrivateOrFriend(market)).toBe(false)
    })

    it('returns false when metadata is undefined', () => {
      const market = { proposalId: 500 }
      expect(isMarketPrivateOrFriend(market)).toBe(false)
    })

    it('returns true for proposalId at the minimum of friend range', () => {
      const market = {
        proposalId: 1_000_000,
        metadata: {}
      }
      expect(isMarketPrivateOrFriend(market)).toBe(true)
    })

    it('prioritizes encrypted check over other methods', () => {
      const market = {
        metadata: { encrypted: true },
        proposalId: 500
      }
      expect(isMarketPrivateOrFriend(market)).toBe(true)
    })

    it('handles metadata without attributes array', () => {
      const market = {
        metadata: { name: 'Test' },
        proposalId: 500
      }
      expect(isMarketPrivateOrFriend(market)).toBe(false)
    })
  })

  // ===== getMarketPrivacyReason =====
  describe('getMarketPrivacyReason', () => {
    it('returns "encrypted metadata" for encrypted markets', () => {
      const market = { metadata: { encrypted: true } }
      expect(getMarketPrivacyReason(market)).toBe('encrypted metadata')
    })

    it('returns "Market Source: friend" for friend-source markets', () => {
      const market = {
        metadata: {
          attributes: [
            { trait_type: 'Market Source', value: 'friend' }
          ]
        }
      }
      expect(getMarketPrivacyReason(market)).toBe('Market Source: friend')
    })

    it('returns proposalId range description for legacy markets', () => {
      const market = {
        proposalId: 2_000_000,
        metadata: {}
      }
      const reason = getMarketPrivacyReason(market)
      expect(reason).toContain('proposalId in friend range')
      expect(reason).toContain('2000000')
    })

    it('returns "unknown" for non-private markets', () => {
      const market = {
        proposalId: 100,
        metadata: {}
      }
      expect(getMarketPrivacyReason(market)).toBe('unknown')
    })

    it('returns "unknown" when metadata is null', () => {
      const market = { metadata: null, proposalId: 100 }
      expect(getMarketPrivacyReason(market)).toBe('unknown')
    })
  })

  // ===== canUserViewMarket =====
  describe('canUserViewMarket', () => {
    it('returns true for non-encrypted markets', () => {
      const market = { metadata: { name: 'Public Market' } }
      expect(canUserViewMarket(market, '0xabc')).toBe(true)
    })

    it('returns true for encrypted market when user is a participant', () => {
      const market = {
        metadata: {
          encrypted: true,
          participants: ['0xabc', '0xdef']
        }
      }
      expect(canUserViewMarket(market, '0xABC')).toBe(true)
    })

    it('returns false for encrypted market when user is not a participant', () => {
      const market = {
        metadata: {
          encrypted: true,
          participants: ['0xabc', '0xdef']
        }
      }
      expect(canUserViewMarket(market, '0x999')).toBe(false)
    })

    it('returns false for encrypted market when user address is null', () => {
      const market = {
        metadata: {
          encrypted: true,
          participants: ['0xabc']
        }
      }
      expect(canUserViewMarket(market, null)).toBe(false)
    })

    it('returns true when metadata is null (non-encrypted)', () => {
      const market = { metadata: null }
      expect(canUserViewMarket(market, '0xabc')).toBe(true)
    })

    it('returns false for encrypted market with no participants list', () => {
      const market = {
        metadata: { encrypted: true }
      }
      expect(canUserViewMarket(market, '0xabc')).toBe(false)
    })

    it('normalizes user address to lowercase for comparison', () => {
      const market = {
        metadata: {
          encrypted: true,
          participants: ['0xabcdef0123456789000000000000000000000000']
        }
      }
      // The function lowercases the user address, so uppercase user should match lowercase list
      expect(canUserViewMarket(market, '0xAbCdEf0123456789000000000000000000000000')).toBe(true)
    })
  })

  // ===== getRoleHash =====
  describe('getRoleHash', () => {
    it('returns a valid hash for WAGER_PARTICIPANT', () => {
      const hash = getRoleHash('WAGER_PARTICIPANT')
      expect(hash).toBeTruthy()
      expect(hash.startsWith('0x')).toBe(true)
      expect(hash.length).toBe(66) // 0x + 64 hex chars
    })

    it('returns the same hash for "Wager Participant" alias', () => {
      const hash1 = getRoleHash('WAGER_PARTICIPANT')
      const hash2 = getRoleHash('Wager Participant')
      expect(hash1).toBe(hash2)
    })

    it('returns null for unknown role', () => {
      expect(getRoleHash('NONEXISTENT_ROLE')).toBe(null)
    })

    it('returns the zero hash for ADMIN (DEFAULT_ADMIN_ROLE)', () => {
      const hash = getRoleHash('ADMIN')
      expect(hash).toBe('0x0000000000000000000000000000000000000000000000000000000000000000')
    })

    it('returns valid hashes for GUARDIAN, ACCOUNT_MODERATOR, ROLE_MANAGER', () => {
      expect(getRoleHash('GUARDIAN')).toBeTruthy()
      expect(getRoleHash('ACCOUNT_MODERATOR')).toBeTruthy()
      expect(getRoleHash('ROLE_MANAGER')).toBeTruthy()
    })

    it('GUARDIAN and ACCOUNT_MODERATOR have different hashes', () => {
      expect(getRoleHash('GUARDIAN')).not.toBe(getRoleHash('ACCOUNT_MODERATOR'))
    })
  })

  // ===== TIER_NAMES =====
  describe('TIER_NAMES', () => {
    it('maps 1 to Bronze', () => {
      expect(TIER_NAMES[1]).toBe('Bronze')
    })

    it('maps 2 to Silver', () => {
      expect(TIER_NAMES[2]).toBe('Silver')
    })

    it('maps 3 to Gold', () => {
      expect(TIER_NAMES[3]).toBe('Gold')
    })

    it('maps 4 to Platinum', () => {
      expect(TIER_NAMES[4]).toBe('Platinum')
    })

    it('has no entry for tier 0', () => {
      expect(TIER_NAMES[0]).toBeUndefined()
    })
  })

  // ===== fetchFriendMarketsForUser (test env returns []) =====
  describe('fetchFriendMarketsForUser', () => {
    it('returns empty array in test environment (VITE_SKIP_BLOCKCHAIN_CALLS)', async () => {
      const result = await fetchFriendMarketsForUser('0x1234567890123456789012345678901234567890')
      expect(result).toEqual([])
    })
  })

  // ===== checkRoleSyncNeeded (test env) =====
  describe('checkRoleSyncNeeded', () => {
    it('returns needsSync: false in test environment', async () => {
      const result = await checkRoleSyncNeeded('0x1234567890123456789012345678901234567890', 'WAGER_PARTICIPANT')
      expect(result.needsSync).toBe(false)
      expect(result.tierRegistryTier).toBe(0)
      expect(result.tieredRoleManagerTier).toBe(0)
      expect(result.tierName).toBe('None')
    })
  })

  // ===== getUserTierOnChain (test env) =====
  describe('getUserTierOnChain', () => {
    it('returns tier 0 in test environment', async () => {
      const result = await getUserTierOnChain('0x1234567890123456789012345678901234567890', 'WAGER_PARTICIPANT')
      expect(result.tier).toBe(0)
      expect(result.tierName).toBe('None')
    })
  })

  // ===== fetchMarketMetadataFromUri =====
  describe('fetchMarketMetadataFromUri', () => {
    it('returns null for empty URI', async () => {
      const result = await fetchMarketMetadataFromUri('')
      expect(result).toBeNull()
    })

    it('returns null for null URI', async () => {
      const result = await fetchMarketMetadataFromUri(null)
      expect(result).toBeNull()
    })

    it('returns null for undefined URI', async () => {
      const result = await fetchMarketMetadataFromUri(undefined)
      expect(result).toBeNull()
    })
  })

  // ===== getContract =====
  describe('getContract', () => {
    it('throws for unknown contract name', () => {
      expect(() => getContract('nonExistentContract'))
        .toThrow('Unknown contract: nonExistentContract')
    })
  })
})
