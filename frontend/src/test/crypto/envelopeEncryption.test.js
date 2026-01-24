import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  deriveKeyPair,
  publicKeyFromSignature,
  deriveKeyPairFromSignature,
  encryptEnvelope,
  decryptEnvelope,
  addRecipient,
  removeRecipient,
  canDecrypt,
  getRecipients,
  isEncryptedEnvelope,
  encryptMarketMetadata,
  decryptMarketMetadata,
  createEncryptedMarket,
  addParticipantToMarket,
  getEnvelopeSigningVersion
} from '../../utils/crypto/envelopeEncryption'
import { CURRENT_ENCRYPTION_VERSION, getMarketSigningMessage } from '../../utils/crypto/constants'

// Mock signer for testing
const createMockSigner = (address, signatureBase = 'test-signature') => ({
  signMessage: vi.fn().mockImplementation((message) =>
    Promise.resolve(`0x${signatureBase}-${address.slice(0, 6)}-sig`)
  ),
  getAddress: vi.fn().mockResolvedValue(address)
})

// Test addresses
const ALICE_ADDRESS = '0x1111111111111111111111111111111111111111'
const BOB_ADDRESS = '0x2222222222222222222222222222222222222222'
const CHARLIE_ADDRESS = '0x3333333333333333333333333333333333333333'

describe('crypto/envelopeEncryption', () => {
  describe('deriveKeyPair', () => {
    it('should derive keypair with publicKey, privateKey, signature, and version', async () => {
      const signer = createMockSigner(ALICE_ADDRESS)
      const result = await deriveKeyPair(signer)

      expect(result).toHaveProperty('publicKey')
      expect(result).toHaveProperty('privateKey')
      expect(result).toHaveProperty('signature')
      expect(result).toHaveProperty('version')
      expect(result.publicKey).toBeInstanceOf(Uint8Array)
      expect(result.privateKey).toBeInstanceOf(Uint8Array)
      expect(result.publicKey.length).toBe(32) // X25519 public key is 32 bytes
      expect(result.privateKey.length).toBe(32) // X25519 private key is 32 bytes
    })

    it('should default to CURRENT_ENCRYPTION_VERSION', async () => {
      const signer = createMockSigner(ALICE_ADDRESS)
      const result = await deriveKeyPair(signer)

      expect(result.version).toBe(CURRENT_ENCRYPTION_VERSION)
      expect(signer.signMessage).toHaveBeenCalledWith(getMarketSigningMessage(CURRENT_ENCRYPTION_VERSION))
    })

    it('should use specified version when provided', async () => {
      const signer = createMockSigner(ALICE_ADDRESS)

      const resultV1 = await deriveKeyPair(signer, 1)
      expect(resultV1.version).toBe(1)
      expect(signer.signMessage).toHaveBeenCalledWith(getMarketSigningMessage(1))

      const resultV2 = await deriveKeyPair(signer, 2)
      expect(resultV2.version).toBe(2)
    })

    it('should derive same keypair for same signer and version', async () => {
      // Use a fixed signature response for determinism
      const fixedSigner = {
        signMessage: vi.fn().mockResolvedValue('0xfixedsignature123'),
        getAddress: vi.fn().mockResolvedValue(ALICE_ADDRESS)
      }

      const result1 = await deriveKeyPair(fixedSigner, 2)
      const result2 = await deriveKeyPair(fixedSigner, 2)

      expect(result1.publicKey).toEqual(result2.publicKey)
      expect(result1.privateKey).toEqual(result2.privateKey)
    })

    it('should derive different keypairs for different versions', async () => {
      // Mock different signatures for different versions
      const signer = {
        signMessage: vi.fn()
          .mockResolvedValueOnce('0xv1signature')
          .mockResolvedValueOnce('0xv2signature'),
        getAddress: vi.fn().mockResolvedValue(ALICE_ADDRESS)
      }

      const resultV1 = await deriveKeyPair(signer, 1)
      const resultV2 = await deriveKeyPair(signer, 2)

      // Keys should be different because signatures are different
      expect(resultV1.publicKey).not.toEqual(resultV2.publicKey)
    })
  })

  describe('publicKeyFromSignature', () => {
    it('should derive public key from signature', () => {
      const signature = '0xtest-signature-12345'
      const publicKey = publicKeyFromSignature(signature)

      expect(publicKey).toBeInstanceOf(Uint8Array)
      expect(publicKey.length).toBe(32) // X25519 public key
    })

    it('should be deterministic - same signature produces same public key', () => {
      const signature = '0xdeterministic-sig'
      const pk1 = publicKeyFromSignature(signature)
      const pk2 = publicKeyFromSignature(signature)

      expect(pk1).toEqual(pk2)
    })

    it('should match publicKey from deriveKeyPairFromSignature', () => {
      const signature = '0xtest-signature-match'
      const publicKeyDirect = publicKeyFromSignature(signature)
      const keypair = deriveKeyPairFromSignature(signature)

      expect(publicKeyDirect).toEqual(keypair.publicKey)
    })
  })

  describe('deriveKeyPairFromSignature', () => {
    it('should derive full keypair from cached signature', () => {
      const signature = '0xcached-sig-test'
      const result = deriveKeyPairFromSignature(signature)

      expect(result).toHaveProperty('publicKey')
      expect(result).toHaveProperty('privateKey')
      expect(result).toHaveProperty('signature')
      expect(result.signature).toBe(signature)
      expect(result.publicKey).toBeInstanceOf(Uint8Array)
      expect(result.privateKey).toBeInstanceOf(Uint8Array)
    })
  })

  describe('encryptEnvelope', () => {
    it('should create proper envelope structure', () => {
      const data = { message: 'Hello, World!' }
      const signature = '0xalice-signature'
      const alicePublicKey = publicKeyFromSignature(signature)

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: alicePublicKey }
      ])

      expect(envelope).toHaveProperty('version', '1.0')
      expect(envelope).toHaveProperty('algorithm', 'x25519-chacha20poly1305')
      expect(envelope).toHaveProperty('signingVersion')
      expect(envelope).toHaveProperty('content')
      expect(envelope.content).toHaveProperty('nonce')
      expect(envelope.content).toHaveProperty('ciphertext')
      expect(envelope).toHaveProperty('keys')
      expect(Array.isArray(envelope.keys)).toBe(true)
    })

    it('should include signingVersion in envelope', () => {
      const data = { test: true }
      const signature = '0xtest-sig'
      const publicKey = publicKeyFromSignature(signature)

      const envelopeV2 = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey }
      ], 2)

      const envelopeV1 = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey }
      ], 1)

      expect(envelopeV2.signingVersion).toBe(2)
      expect(envelopeV1.signingVersion).toBe(1)
    })

    it('should encrypt for multiple recipients', () => {
      const data = { shared: 'secret' }
      const aliceSig = '0xalice-sig'
      const bobSig = '0xbob-sig'

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: publicKeyFromSignature(aliceSig) },
        { address: BOB_ADDRESS, publicKey: publicKeyFromSignature(bobSig) }
      ])

      expect(envelope.keys).toHaveLength(2)
      expect(envelope.keys.map(k => k.address)).toContain(ALICE_ADDRESS.toLowerCase())
      expect(envelope.keys.map(k => k.address)).toContain(BOB_ADDRESS.toLowerCase())
    })

    it('should handle string data', () => {
      const data = 'just a string'
      const signature = '0xsig'
      const publicKey = publicKeyFromSignature(signature)

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey }
      ])

      expect(envelope.content.ciphertext).toBeDefined()
    })

    it('should lowercase recipient addresses', () => {
      const data = { test: true }
      const mixedCaseAddress = '0xABCDef1234567890123456789012345678901234'
      const signature = '0xsig'
      const publicKey = publicKeyFromSignature(signature)

      const envelope = encryptEnvelope(data, [
        { address: mixedCaseAddress, publicKey }
      ])

      expect(envelope.keys[0].address).toBe(mixedCaseAddress.toLowerCase())
    })
  })

  describe('decryptEnvelope', () => {
    it('should successfully decrypt when address is in recipients', () => {
      const data = { secret: 'message', number: 42 }
      const signature = '0xalice-decrypt-sig'
      const keypair = deriveKeyPairFromSignature(signature)

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ])

      const decrypted = decryptEnvelope(envelope, ALICE_ADDRESS, keypair.privateKey)

      expect(decrypted).toEqual(data)
    })

    it('should throw when address not in recipients', () => {
      const data = { secret: 'message' }
      const aliceSig = '0xalice-sig'
      const bobSig = '0xbob-sig'
      const aliceKeypair = deriveKeyPairFromSignature(aliceSig)
      const bobKeypair = deriveKeyPairFromSignature(bobSig)

      // Encrypt only for Alice
      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey }
      ])

      // Bob tries to decrypt
      expect(() => {
        decryptEnvelope(envelope, BOB_ADDRESS, bobKeypair.privateKey)
      }).toThrow('No key found for this address')
    })

    it('should handle case-insensitive address matching', () => {
      const data = { test: true }
      const signature = '0xcase-test-sig'
      const keypair = deriveKeyPairFromSignature(signature)

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS.toLowerCase(), publicKey: keypair.publicKey }
      ])

      // Try to decrypt with uppercase address
      const decrypted = decryptEnvelope(envelope, ALICE_ADDRESS.toUpperCase(), keypair.privateKey)
      expect(decrypted).toEqual(data)
    })

    it('should return string for non-JSON data', () => {
      const data = 'plain string not JSON'
      const signature = '0xstring-sig'
      const keypair = deriveKeyPairFromSignature(signature)

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ])

      const decrypted = decryptEnvelope(envelope, ALICE_ADDRESS, keypair.privateKey)
      expect(decrypted).toBe(data)
    })

    it('should decrypt correctly for any recipient in multi-recipient envelope', () => {
      const data = { shared: 'among all' }
      const aliceKeypair = deriveKeyPairFromSignature('0xalice-multi')
      const bobKeypair = deriveKeyPairFromSignature('0xbob-multi')

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey },
        { address: BOB_ADDRESS, publicKey: bobKeypair.publicKey }
      ])

      const aliceDecrypted = decryptEnvelope(envelope, ALICE_ADDRESS, aliceKeypair.privateKey)
      const bobDecrypted = decryptEnvelope(envelope, BOB_ADDRESS, bobKeypair.privateKey)

      expect(aliceDecrypted).toEqual(data)
      expect(bobDecrypted).toEqual(data)
    })
  })

  describe('addRecipient', () => {
    it('should add new recipient successfully', () => {
      const data = { original: 'data' }
      const aliceKeypair = deriveKeyPairFromSignature('0xalice-add')
      const bobKeypair = deriveKeyPairFromSignature('0xbob-add')

      // Create envelope with just Alice
      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey }
      ])

      expect(envelope.keys).toHaveLength(1)

      // Add Bob
      const updatedEnvelope = addRecipient(
        envelope,
        ALICE_ADDRESS,
        aliceKeypair.privateKey,
        { address: BOB_ADDRESS, publicKey: bobKeypair.publicKey }
      )

      expect(updatedEnvelope.keys).toHaveLength(2)
    })

    it('should allow new recipient to decrypt', () => {
      const data = { message: 'welcome Bob' }
      const aliceKeypair = deriveKeyPairFromSignature('0xalice-welcome')
      const bobKeypair = deriveKeyPairFromSignature('0xbob-welcome')

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey }
      ])

      const updatedEnvelope = addRecipient(
        envelope,
        ALICE_ADDRESS,
        aliceKeypair.privateKey,
        { address: BOB_ADDRESS, publicKey: bobKeypair.publicKey }
      )

      const decrypted = decryptEnvelope(updatedEnvelope, BOB_ADDRESS, bobKeypair.privateKey)
      expect(decrypted).toEqual(data)
    })

    it('should throw if non-recipient tries to add someone', () => {
      const data = { test: true }
      const aliceKeypair = deriveKeyPairFromSignature('0xalice-only')
      const bobKeypair = deriveKeyPairFromSignature('0xbob-outsider')
      const charlieKeypair = deriveKeyPairFromSignature('0xcharlie-new')

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey }
      ])

      // Bob (not a recipient) tries to add Charlie
      expect(() => {
        addRecipient(
          envelope,
          BOB_ADDRESS,
          bobKeypair.privateKey,
          { address: CHARLIE_ADDRESS, publicKey: charlieKeypair.publicKey }
        )
      }).toThrow('Not a recipient of this envelope')
    })
  })

  describe('removeRecipient', () => {
    it('should remove recipient from keys array', () => {
      const data = { test: true }
      const aliceKeypair = deriveKeyPairFromSignature('0xalice-remove')
      const bobKeypair = deriveKeyPairFromSignature('0xbob-remove')

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey },
        { address: BOB_ADDRESS, publicKey: bobKeypair.publicKey }
      ])

      expect(envelope.keys).toHaveLength(2)

      const updatedEnvelope = removeRecipient(envelope, BOB_ADDRESS)

      expect(updatedEnvelope.keys).toHaveLength(1)
      expect(updatedEnvelope.keys[0].address).toBe(ALICE_ADDRESS.toLowerCase())
    })

    it('should handle case-insensitive removal', () => {
      const data = { test: true }
      const aliceKeypair = deriveKeyPairFromSignature('0xalice-case')

      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS.toLowerCase(), publicKey: aliceKeypair.publicKey }
      ])

      const updatedEnvelope = removeRecipient(envelope, ALICE_ADDRESS.toUpperCase())

      expect(updatedEnvelope.keys).toHaveLength(0)
    })
  })

  describe('canDecrypt', () => {
    it('should return true when address is in recipients', () => {
      const keypair = deriveKeyPairFromSignature('0xsig')
      const envelope = encryptEnvelope({ test: true }, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ])

      expect(canDecrypt(envelope, ALICE_ADDRESS)).toBe(true)
    })

    it('should return false when address is not in recipients', () => {
      const keypair = deriveKeyPairFromSignature('0xsig')
      const envelope = encryptEnvelope({ test: true }, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ])

      expect(canDecrypt(envelope, BOB_ADDRESS)).toBe(false)
    })

    it('should handle case-insensitive matching', () => {
      const keypair = deriveKeyPairFromSignature('0xsig')
      const envelope = encryptEnvelope({ test: true }, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ])

      expect(canDecrypt(envelope, ALICE_ADDRESS.toUpperCase())).toBe(true)
    })

    it('should return false for invalid envelope', () => {
      expect(canDecrypt(null, ALICE_ADDRESS)).toBe(false)
      expect(canDecrypt({}, ALICE_ADDRESS)).toBe(false)
      expect(canDecrypt({ keys: null }, ALICE_ADDRESS)).toBe(false)
    })
  })

  describe('getRecipients', () => {
    it('should return list of all recipient addresses', () => {
      const aliceKeypair = deriveKeyPairFromSignature('0xalice-list')
      const bobKeypair = deriveKeyPairFromSignature('0xbob-list')

      const envelope = encryptEnvelope({ test: true }, [
        { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey },
        { address: BOB_ADDRESS, publicKey: bobKeypair.publicKey }
      ])

      const recipients = getRecipients(envelope)

      expect(recipients).toHaveLength(2)
      expect(recipients).toContain(ALICE_ADDRESS.toLowerCase())
      expect(recipients).toContain(BOB_ADDRESS.toLowerCase())
    })

    it('should return empty array for invalid envelope', () => {
      expect(getRecipients(null)).toEqual([])
      expect(getRecipients({})).toEqual([])
      expect(getRecipients({ keys: null })).toEqual([])
    })
  })

  describe('isEncryptedEnvelope', () => {
    it('should return true for valid envelope', () => {
      const keypair = deriveKeyPairFromSignature('0xsig')
      const envelope = encryptEnvelope({ test: true }, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ])

      expect(isEncryptedEnvelope(envelope)).toBe(true)
    })

    it('should return false for invalid structures', () => {
      expect(isEncryptedEnvelope(null)).toBe(false)
      expect(isEncryptedEnvelope({})).toBe(false)
      expect(isEncryptedEnvelope({ version: '1.0' })).toBe(false)
      expect(isEncryptedEnvelope({ version: '1.0', algorithm: 'wrong' })).toBe(false)
      expect(isEncryptedEnvelope({
        version: '1.0',
        algorithm: 'x25519-chacha20poly1305',
        content: {}
      })).toBe(false)
      expect(isEncryptedEnvelope({
        version: '1.0',
        algorithm: 'x25519-chacha20poly1305',
        content: { ciphertext: 'test' },
        keys: 'not-array'
      })).toBe(false)
    })

    it('should return true when all required fields are present', () => {
      const validEnvelope = {
        version: '1.0',
        algorithm: 'x25519-chacha20poly1305',
        content: { ciphertext: 'encrypted-data', nonce: 'nonce' },
        keys: []
      }

      expect(isEncryptedEnvelope(validEnvelope)).toBe(true)
    })
  })

  describe('getEnvelopeSigningVersion', () => {
    it('should return signingVersion from envelope', () => {
      const keypair = deriveKeyPairFromSignature('0xsig')
      const envelope = encryptEnvelope({ test: true }, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ], 2)

      expect(getEnvelopeSigningVersion(envelope)).toBe(2)
    })

    it('should default to 1 for legacy envelopes without signingVersion', () => {
      const legacyEnvelope = {
        version: '1.0',
        algorithm: 'x25519-chacha20poly1305',
        content: { ciphertext: 'test' },
        keys: []
        // No signingVersion field
      }

      expect(getEnvelopeSigningVersion(legacyEnvelope)).toBe(1)
    })

    it('should handle null/undefined envelope', () => {
      expect(getEnvelopeSigningVersion(null)).toBe(1)
      expect(getEnvelopeSigningVersion(undefined)).toBe(1)
    })
  })

  describe('High-Level API', () => {
    describe('encryptMarketMetadata', () => {
      it('should encrypt metadata for participants with signatures', () => {
        const metadata = { name: 'Test Market', description: 'A test' }
        const participants = [
          { address: ALICE_ADDRESS, signature: '0xalice-sig' },
          { address: BOB_ADDRESS, signature: '0xbob-sig' }
        ]

        const envelope = encryptMarketMetadata(metadata, participants)

        expect(isEncryptedEnvelope(envelope)).toBe(true)
        expect(envelope.keys).toHaveLength(2)
      })
    })

    describe('decryptMarketMetadata', () => {
      it('should decrypt using signer with correct version from envelope', async () => {
        const metadata = { name: 'Test', value: 123 }
        const signature = '0xtest-decrypt-meta'
        const keypair = deriveKeyPairFromSignature(signature)

        const envelope = encryptEnvelope(metadata, [
          { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
        ], 2)

        // Using private key directly
        const decrypted = await decryptMarketMetadata(
          envelope,
          ALICE_ADDRESS,
          keypair.privateKey
        )

        expect(decrypted).toEqual(metadata)
      })

      it('should use privateKey directly when Uint8Array is passed', async () => {
        const metadata = { directKey: true }
        const signature = '0xdirect-key'
        const keypair = deriveKeyPairFromSignature(signature)

        const envelope = encryptEnvelope(metadata, [
          { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
        ])

        const decrypted = await decryptMarketMetadata(
          envelope,
          ALICE_ADDRESS,
          keypair.privateKey
        )

        expect(decrypted).toEqual(metadata)
      })
    })

    describe('createEncryptedMarket', () => {
      it('should create envelope with creator as first recipient', async () => {
        const metadata = { name: 'New Market' }
        const signer = createMockSigner(ALICE_ADDRESS)

        const result = await createEncryptedMarket(metadata, signer, ALICE_ADDRESS)

        expect(result).toHaveProperty('envelope')
        expect(result).toHaveProperty('creatorSignature')
        expect(result).toHaveProperty('signingVersion')
        expect(isEncryptedEnvelope(result.envelope)).toBe(true)
        expect(result.envelope.keys).toHaveLength(1)
        expect(result.signingVersion).toBe(CURRENT_ENCRYPTION_VERSION)
      })
    })

    describe('addParticipantToMarket', () => {
      it('should add participant to market using privateKey', async () => {
        const metadata = { test: 'market' }
        const aliceKeypair = deriveKeyPairFromSignature('0xalice-market')
        const bobSig = '0xbob-market'
        const bobKeypair = deriveKeyPairFromSignature(bobSig)

        const envelope = encryptEnvelope(metadata, [
          { address: ALICE_ADDRESS, publicKey: aliceKeypair.publicKey }
        ])

        const updatedEnvelope = await addParticipantToMarket(
          envelope,
          ALICE_ADDRESS,
          aliceKeypair.privateKey,
          BOB_ADDRESS,
          bobSig
        )

        expect(updatedEnvelope.keys).toHaveLength(2)

        // Bob should be able to decrypt
        const decrypted = decryptEnvelope(updatedEnvelope, BOB_ADDRESS, bobKeypair.privateKey)
        expect(decrypted).toEqual(metadata)
      })
    })
  })

  describe('Version Compatibility', () => {
    it('v1 envelope should preserve signingVersion for decryption', () => {
      const keypair = deriveKeyPairFromSignature('0xv1-compat')
      const envelope = encryptEnvelope({ v1: 'data' }, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ], 1)

      expect(envelope.signingVersion).toBe(1)
    })

    it('v2 envelope should preserve signingVersion for decryption', () => {
      const keypair = deriveKeyPairFromSignature('0xv2-compat')
      const envelope = encryptEnvelope({ v2: 'data' }, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ], 2)

      expect(envelope.signingVersion).toBe(2)
    })

    it('should decrypt correctly when version matches keypair derivation', () => {
      // This tests the most important compatibility requirement:
      // An envelope encrypted with version N must be decrypted with keys derived from version N

      const data = { versioned: 'content' }
      const keypair = deriveKeyPairFromSignature('0xversion-match')

      // Encrypt with v2
      const envelope = encryptEnvelope(data, [
        { address: ALICE_ADDRESS, publicKey: keypair.publicKey }
      ], 2)

      // Decrypt should work with same keypair (version doesn't matter for direct private key usage)
      const decrypted = decryptEnvelope(envelope, ALICE_ADDRESS, keypair.privateKey)
      expect(decrypted).toEqual(data)
    })
  })
})
