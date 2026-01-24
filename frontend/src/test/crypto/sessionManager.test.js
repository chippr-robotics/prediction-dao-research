import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the crypto dependencies before importing SessionManager
vi.mock('../../utils/crypto/primitives.js', () => ({
  generateKeyPair: vi.fn(() => ({
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(32).fill(2)
  })),
  bytesToHex: vi.fn((bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')),
  hexToBytes: vi.fn((hex) => new Uint8Array(hex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) || []))
}))

vi.mock('../../utils/crypto/x3dh.js', () => ({
  generateKeyBundle: vi.fn((_identityPrivate) => ({
    publicBundle: {
      identityKey: 'mock-identity-key',
      signedPreKey: { publicKey: 'mock-signed-prekey' },
      oneTimeKeys: []
    },
    privateKeys: {
      signedPreKey: { privateKey: 'mock-private' }
    }
  })),
  initiateX3DH: vi.fn(() => ({
    sharedSecret: new Uint8Array(32).fill(3),
    recipientRatchetKey: new Uint8Array(32).fill(4),
    associatedData: new Uint8Array(32).fill(5),
    initialMessage: { type: 'x3dh-init' }
  })),
  completeX3DH: vi.fn(() => ({
    sharedSecret: new Uint8Array(32).fill(3),
    associatedData: new Uint8Array(32).fill(5)
  }))
}))

vi.mock('../../utils/crypto/doubleRatchet.js', () => ({
  initializeSessionAsInitiator: vi.fn(() => ({ state: 'initiator' })),
  initializeSessionAsRecipient: vi.fn(() => ({ state: 'recipient' })),
  ratchetEncrypt: vi.fn(() => ({ ciphertext: 'encrypted' })),
  ratchetDecrypt: vi.fn(() => new TextEncoder().encode('decrypted')),
  serializeSession: vi.fn((session) => JSON.stringify(session)),
  deserializeSession: vi.fn((data) => JSON.parse(data))
}))

vi.mock('../../utils/crypto/senderKeys.js', () => ({
  GroupSession: vi.fn().mockImplementation((groupId, address) => ({
    groupId,
    address,
    initialize: vi.fn(() => ({ distribution: 'mock' })),
    processMemberKey: vi.fn(),
    encrypt: vi.fn(() => ({ ciphertext: 'group-encrypted' })),
    decrypt: vi.fn(() => new TextEncoder().encode('group-decrypted')),
    getKnownMembers: vi.fn(() => []),
    rotateKey: vi.fn(() => ({ distribution: 'new' })),
    serialize: vi.fn(() => JSON.stringify({ mock: true }))
  }))
}))

// Now import the module under test
import {
  SessionManager,
  getSessionManager,
  clearSessionManager
} from '../../utils/crypto/sessionManager'
import { CURRENT_ENCRYPTION_VERSION, getSigningMessage } from '../../utils/crypto/constants'

// Test addresses
const ALICE_ADDRESS = '0x1111111111111111111111111111111111111111'
const BOB_ADDRESS = '0x2222222222222222222222222222222222222222'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: () => { store = {} }
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('crypto/sessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    // Clear the singleton managers between tests
    clearSessionManager(ALICE_ADDRESS)
    clearSessionManager(BOB_ADDRESS)
  })

  describe('SessionManager Construction', () => {
    it('should normalize address to lowercase', () => {
      const mixedCase = '0xABCDef1234567890123456789012345678901234'
      const manager = new SessionManager(mixedCase)

      expect(manager.myAddress).toBe(mixedCase.toLowerCase())
    })

    it('should start uninitialized', () => {
      const manager = new SessionManager(ALICE_ADDRESS)

      expect(manager.initialized).toBe(false)
      expect(manager.identityKeyPair).toBeNull()
      expect(manager.keyBundle).toBeNull()
    })

    it('should initialize empty session maps', () => {
      const manager = new SessionManager(ALICE_ADDRESS)

      expect(manager.pairwiseSessions).toBeInstanceOf(Map)
      expect(manager.pairwiseSessions.size).toBe(0)
      expect(manager.groupSessions).toBeInstanceOf(Map)
      expect(manager.groupSessions.size).toBe(0)
    })
  })

  describe('initialize', () => {
    it('should use correct signing message version', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)

      await manager.initialize(mockSigner, 2)

      expect(mockSigner.signMessage).toHaveBeenCalledWith(getSigningMessage(2))
    })

    it('should default to CURRENT_ENCRYPTION_VERSION', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)

      await manager.initialize(mockSigner)

      expect(mockSigner.signMessage).toHaveBeenCalledWith(getSigningMessage(CURRENT_ENCRYPTION_VERSION))
    })

    it('should generate keyBundle', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)

      const result = await manager.initialize(mockSigner)

      expect(manager.keyBundle).not.toBeNull()
      expect(result.publicBundle).toBeDefined()
      expect(result.signature).toBe('0xmocksig')
    })

    it('should set initialized flag', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)

      expect(manager.initialized).toBe(false)
      await manager.initialize(mockSigner)
      expect(manager.initialized).toBe(true)
    })

    it('should store signingVersion', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)

      await manager.initialize(mockSigner, 1)
      expect(manager.signingVersion).toBe(1)

      const manager2 = new SessionManager(BOB_ADDRESS)
      await manager2.initialize(mockSigner, 2)
      expect(manager2.signingVersion).toBe(2)
    })
  })

  describe('ensureInitialized', () => {
    it('should throw when not initialized', () => {
      const manager = new SessionManager(ALICE_ADDRESS)

      expect(() => manager.ensureInitialized()).toThrow('SessionManager not initialized')
    })

    it('should not throw when initialized', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      expect(() => manager.ensureInitialized()).not.toThrow()
    })
  })

  describe('saveSessions', () => {
    it('should persist to localStorage', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      manager.saveSessions()

      expect(localStorageMock.setItem).toHaveBeenCalled()
      const key = `fairwins_crypto_sessions_${ALICE_ADDRESS.toLowerCase()}`
      expect(localStorageMock.setItem).toHaveBeenCalledWith(key, expect.any(String))
    })

    it('should serialize session data as JSON', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      manager.saveSessions()

      const calls = localStorageMock.setItem.mock.calls
      const savedData = calls[calls.length - 1][1]
      const parsed = JSON.parse(savedData)

      expect(parsed).toHaveProperty('myAddress')
      expect(parsed).toHaveProperty('pairwiseSessions')
      expect(parsed).toHaveProperty('groupSessions')
    })
  })

  describe('loadSessions', () => {
    it('should restore sessions from localStorage', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }

      // Pre-populate localStorage with session data
      const storedData = {
        myAddress: ALICE_ADDRESS.toLowerCase(),
        pairwiseSessions: [],
        groupSessions: []
      }
      const key = `fairwins_crypto_sessions_${ALICE_ADDRESS.toLowerCase()}`
      localStorageMock.setItem(key, JSON.stringify(storedData))
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(storedData))

      const manager = new SessionManager(ALICE_ADDRESS)
      // loadSessions is called during initialize
      await manager.initialize(mockSigner)

      expect(localStorageMock.getItem).toHaveBeenCalledWith(key)
    })

    it('should handle missing localStorage data gracefully', () => {
      localStorageMock.getItem.mockReturnValue(null)

      const manager = new SessionManager(ALICE_ADDRESS)
      // Should not throw
      expect(() => manager.loadSessions()).not.toThrow()
    })

    it('should handle corrupted localStorage data gracefully', () => {
      const _key = `fairwins_crypto_sessions_${ALICE_ADDRESS.toLowerCase()}`
      localStorageMock.getItem.mockReturnValueOnce('not valid json {{{')

      const manager = new SessionManager(ALICE_ADDRESS)
      // Should not throw, just log error
      expect(() => manager.loadSessions()).not.toThrow()
    })
  })

  describe('clearSessions', () => {
    it('should clear session maps', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      // Add some mock data
      manager.pairwiseSessions.set('test', { mock: true })
      manager.groupSessions.set('group', { mock: true })

      manager.clearSessions()

      expect(manager.pairwiseSessions.size).toBe(0)
      expect(manager.groupSessions.size).toBe(0)
    })

    it('should remove data from localStorage', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      manager.clearSessions()

      const key = `fairwins_crypto_sessions_${ALICE_ADDRESS.toLowerCase()}`
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(key)
    })
  })

  describe('Singleton Pattern - getSessionManager', () => {
    it('should return same instance for same address', () => {
      const manager1 = getSessionManager(ALICE_ADDRESS)
      const manager2 = getSessionManager(ALICE_ADDRESS)

      expect(manager1).toBe(manager2)
    })

    it('should return different instances for different addresses', () => {
      const aliceManager = getSessionManager(ALICE_ADDRESS)
      const bobManager = getSessionManager(BOB_ADDRESS)

      expect(aliceManager).not.toBe(bobManager)
    })

    it('should normalize address for singleton lookup', () => {
      const manager1 = getSessionManager(ALICE_ADDRESS.toLowerCase())
      const manager2 = getSessionManager(ALICE_ADDRESS.toUpperCase())

      expect(manager1).toBe(manager2)
    })
  })

  describe('clearSessionManager', () => {
    it('should remove manager from singleton map', () => {
      const manager1 = getSessionManager(ALICE_ADDRESS)
      clearSessionManager(ALICE_ADDRESS)
      const manager2 = getSessionManager(ALICE_ADDRESS)

      expect(manager1).not.toBe(manager2)
    })

    it('should call clearSessions on the manager', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = getSessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      // Add some mock data
      manager.pairwiseSessions.set('test', { mock: true })

      clearSessionManager(ALICE_ADDRESS)

      // Data should be cleared
      expect(manager.pairwiseSessions.size).toBe(0)
    })

    it('should handle non-existent manager gracefully', () => {
      // Should not throw for address without manager
      expect(() => clearSessionManager('0x9999999999999999999999999999999999999999')).not.toThrow()
    })
  })

  describe('getPublicBundle', () => {
    it('should return public bundle when initialized', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      const bundle = manager.getPublicBundle()

      expect(bundle).not.toBeNull()
      expect(bundle).toHaveProperty('identityKey')
      expect(bundle).toHaveProperty('signedPreKey')
    })

    it('should return null when not initialized', () => {
      const manager = new SessionManager(ALICE_ADDRESS)

      const bundle = manager.getPublicBundle()

      expect(bundle).toBeNull()
    })
  })

  describe('hasSession', () => {
    it('should return false when no session exists', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      expect(manager.hasSession(BOB_ADDRESS)).toBe(false)
    })

    it('should return true when session exists', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      // Manually add a session
      manager.pairwiseSessions.set(BOB_ADDRESS.toLowerCase(), { mock: true })

      expect(manager.hasSession(BOB_ADDRESS)).toBe(true)
    })

    it('should handle case-insensitive address matching', async () => {
      const mockSigner = {
        signMessage: vi.fn().mockResolvedValue('0xmocksig')
      }
      const manager = new SessionManager(ALICE_ADDRESS)
      await manager.initialize(mockSigner)

      manager.pairwiseSessions.set(BOB_ADDRESS.toLowerCase(), { mock: true })

      expect(manager.hasSession(BOB_ADDRESS.toUpperCase())).toBe(true)
    })
  })
})
