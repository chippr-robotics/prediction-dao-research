import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use same mocks as the existing sessionManager test
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
      signedPreKey: { privateKey: '0202020202020202020202020202020202020202020202020202020202020202' }
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
  ratchetDecrypt: vi.fn(() => new TextEncoder().encode(JSON.stringify({ text: 'hello' }))),
  serializeSession: vi.fn((session) => JSON.stringify(session)),
  deserializeSession: vi.fn((data) => JSON.parse(data))
}))

vi.mock('../../utils/crypto/senderKeys.js', () => {
  class MockGroupSession {
    constructor(groupId, address) {
      this.groupId = groupId
      this.address = address
    }
    initialize() { return { distribution: 'mock' } }
    processMemberKey() {}
    encrypt() { return { ciphertext: 'group-encrypted' } }
    decrypt() { return new TextEncoder().encode(JSON.stringify({ text: 'group-msg' })) }
    getKnownMembers() { return ['0xaaaa', '0xbbbb'] }
    rotateKey() { return { distribution: 'rotated' } }
    serialize() { return JSON.stringify({ mock: true }) }
  }
  return { GroupSession: MockGroupSession }
})

import {
  SessionManager,
  getSessionManager,
  clearSessionManager
} from '../../utils/crypto/sessionManager'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'

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

describe('SessionManager - Extended Coverage', () => {
  let manager
  const mockSigner = { signMessage: vi.fn().mockResolvedValue('0xmocksig') }

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorageMock.clear()
    clearSessionManager(ALICE)
    clearSessionManager(BOB)

    manager = new SessionManager(ALICE)
    await manager.initialize(mockSigner)
  })

  describe('establishSession', () => {
    it('should establish a session with X3DH and Double Ratchet', () => {
      const theirBundle = {
        identityKey: 'their-id-key',
        signedPreKey: { publicKey: 'their-spk' },
      }
      const result = manager.establishSession(BOB, theirBundle)

      expect(result.sessionEstablished).toBe(true)
      expect(result.initialMessage).toEqual({ type: 'x3dh-init' })
      expect(manager.hasSession(BOB)).toBe(true)
    })

    it('should normalize address when establishing session', () => {
      const theirBundle = { identityKey: 'key', signedPreKey: { publicKey: 'spk' } }
      manager.establishSession(BOB.toUpperCase(), theirBundle)
      expect(manager.hasSession(BOB.toLowerCase())).toBe(true)
    })

    it('should throw when not initialized', () => {
      const uninitManager = new SessionManager(BOB)
      expect(() =>
        uninitManager.establishSession(ALICE, {})
      ).toThrow('SessionManager not initialized')
    })
  })

  describe('receiveSessionEstablishment', () => {
    it('should complete session establishment as recipient', () => {
      const initialMessage = { type: 'x3dh-init', ephemeralKey: 'key' }
      const result = manager.receiveSessionEstablishment(BOB, initialMessage)

      expect(result).toBe(true)
      expect(manager.hasSession(BOB)).toBe(true)
    })
  })

  describe('encryptMessage', () => {
    it('should encrypt a string message', () => {
      // Establish session first
      manager.establishSession(BOB, {
        identityKey: 'key',
        signedPreKey: { publicKey: 'spk' },
      })

      const encrypted = manager.encryptMessage(BOB, 'Hello Bob')

      expect(encrypted.type).toBe('1v1')
      expect(encrypted.from).toBe(ALICE.toLowerCase())
      expect(encrypted.to).toBe(BOB.toLowerCase())
      expect(encrypted.ciphertext).toBe('encrypted')
    })

    it('should encrypt an object message as JSON', () => {
      manager.establishSession(BOB, {
        identityKey: 'key',
        signedPreKey: { publicKey: 'spk' },
      })

      const encrypted = manager.encryptMessage(BOB, { text: 'Hello' })
      expect(encrypted.type).toBe('1v1')
    })

    it('should throw when no session exists', () => {
      expect(() =>
        manager.encryptMessage(BOB, 'Hello')
      ).toThrow(`No session with ${BOB}`)
    })
  })

  describe('decryptMessage', () => {
    it('should decrypt a message and parse JSON', () => {
      manager.establishSession(BOB, {
        identityKey: 'key',
        signedPreKey: { publicKey: 'spk' },
      })

      const decrypted = manager.decryptMessage({
        from: BOB,
        ciphertext: 'encrypted',
      })

      expect(decrypted).toEqual({ text: 'hello' })
    })

    it('should throw when no session exists with sender', () => {
      expect(() =>
        manager.decryptMessage({ from: BOB, ciphertext: 'data' })
      ).toThrow(`No session with ${BOB.toLowerCase()}`)
    })

    it('should return plain string if not valid JSON', async () => {
      const { ratchetDecrypt } = await import('../../utils/crypto/doubleRatchet.js')
      ratchetDecrypt.mockReturnValueOnce(new TextEncoder().encode('plain text'))

      manager.establishSession(BOB, {
        identityKey: 'key',
        signedPreKey: { publicKey: 'spk' },
      })

      const result = manager.decryptMessage({ from: BOB, ciphertext: 'x' })
      expect(result).toBe('plain text')
    })
  })

  describe('Group sessions', () => {
    const GROUP_ID = 'market-42'

    it('should create and join a group', () => {
      const distribution = manager.joinGroup(GROUP_ID)
      expect(distribution).toEqual({ distribution: 'mock' })
    })

    it('should reuse existing group session on re-join', () => {
      manager.joinGroup(GROUP_ID)
      const dist2 = manager.joinGroup(GROUP_ID)
      // Second call should reuse the session
      expect(dist2).toEqual({ distribution: 'mock' })
    })

    it('should process member key distribution', () => {
      manager.joinGroup(GROUP_ID)
      // Should not throw
      expect(() => manager.processMemberKey(GROUP_ID, { senderKey: 'key-data' })).not.toThrow()
    })

    it('should create group session on processMemberKey if not joined', () => {
      manager.processMemberKey('new-group', { senderKey: 'key-data' })
      // Should not throw - creates a new session
      expect(manager.groupSessions.has('new-group')).toBe(true)
    })

    it('should encrypt group message', () => {
      manager.joinGroup(GROUP_ID)
      const encrypted = manager.encryptGroupMessage(GROUP_ID, 'Group hello')
      expect(encrypted.type).toBe('group')
      expect(encrypted.groupId).toBe(GROUP_ID)
    })

    it('should throw when encrypting for non-joined group', () => {
      expect(() =>
        manager.encryptGroupMessage('nonexistent', 'msg')
      ).toThrow('Not a member of group nonexistent')
    })

    it('should decrypt group message', () => {
      manager.joinGroup(GROUP_ID)
      const result = manager.decryptGroupMessage({
        groupId: GROUP_ID,
        ciphertext: 'encrypted',
      })
      expect(result).toEqual({ text: 'group-msg' })
    })

    it('should throw when decrypting for non-joined group', () => {
      expect(() =>
        manager.decryptGroupMessage({ groupId: 'nonexistent', ciphertext: 'x' })
      ).toThrow('Not a member of group nonexistent')
    })

    it('should get group members', () => {
      manager.joinGroup(GROUP_ID)
      const members = manager.getGroupMembers(GROUP_ID)
      expect(members).toEqual(['0xaaaa', '0xbbbb'])
    })

    it('should return empty array for non-joined group members', () => {
      const members = manager.getGroupMembers('nonexistent')
      expect(members).toEqual([])
    })

    it('should rotate group key', () => {
      manager.joinGroup(GROUP_ID)
      const dist = manager.rotateGroupKey(GROUP_ID)
      expect(dist).toEqual({ distribution: 'rotated' })
    })

    it('should throw when rotating key for non-joined group', () => {
      expect(() =>
        manager.rotateGroupKey('nonexistent')
      ).toThrow('Not a member of group nonexistent')
    })
  })

  describe('saveSessions error handling', () => {
    it('should handle localStorage.setItem error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage full')
      })

      // Should not throw
      expect(() => manager.saveSessions()).not.toThrow()
      consoleSpy.mockRestore()
    })
  })

  describe('clearSessions error handling', () => {
    it('should handle localStorage.removeItem error gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('Storage error')
      })

      expect(() => manager.clearSessions()).not.toThrow()
      consoleSpy.mockRestore()
    })
  })
})
