/**
 * Regression tests for the two wager-encryption bugs surfaced during private
 * wager creation:
 *
 *  1. Double "sign the rules" prompt — createEncrypted used to sign the key
 *     derivation message twice (once in ensureInitialized, once again inside
 *     createEncryptedMarket{,XWing}). It must now sign at most once.
 *
 *  2. "Encryption keys not initialized" — addRecipientByPublicKey read the
 *     X25519 private key straight from React state, which is still null within
 *     the same handler tick that just initialized the keys. It must fall back
 *     to deriving the key from the cached session signature.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useEncryption } from '../hooks/useEncryption'
import {
  encryptMarketMetadata,
  publicKeyFromSignature,
  getRecipients
} from '../utils/crypto/envelopeEncryption.js'

const ACCOUNT = '0x1111111111111111111111111111111111111111'
const OPPONENT = '0x2222222222222222222222222222222222222222'
const FIXED_SIGNATURE = '0x' + 'a'.repeat(130)
const SIGNATURE_CACHE_KEY = 'fairwins_encryption_signature'

// signMessage spy shared across the mocked wallet so the test can assert how
// many times the user was prompted to sign.
const signMessage = vi.fn(async () => FIXED_SIGNATURE)

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => ({
    account: ACCOUNT,
    isConnected: true,
    signer: {
      signMessage,
      getAddress: async () => ACCOUNT,
      provider: { getNetwork: async () => ({ chainId: 80002n }) }
    }
  })
}))

// Avoid real on-chain key registration during initializeKeys().
vi.mock('../utils/keyRegistryService.js', () => ({
  lookupPublicKey: vi.fn(async () => null),
  hasRegisteredKey: vi.fn(async () => false),
  ensureKeyRegistered: vi.fn(async () => false),
  clearKeyCache: vi.fn()
}))

function cacheSignature(account, signature, version = 2) {
  sessionStorage.setItem(
    `${SIGNATURE_CACHE_KEY}_${account.toLowerCase()}`,
    JSON.stringify({ signature, version })
  )
}

const metadata = { name: 'Test wager', description: 'Heads or tails for 10 USDC' }

describe('useEncryption — wager creation bug fixes', () => {
  beforeEach(() => {
    signMessage.mockClear()
    sessionStorage.clear()
  })

  it('Fix #1: createEncrypted prompts for a signature only once (no double sign)', async () => {
    const { result } = renderHook(() => useEncryption())

    let created
    await act(async () => {
      created = await result.current.createEncrypted(metadata, { algorithm: 'x25519' })
    })

    expect(signMessage).toHaveBeenCalledTimes(1)
    expect(created.envelope).toBeTruthy()
    // Creator is the sole recipient of a freshly-created envelope.
    expect(getRecipients(created.envelope)).toEqual([ACCOUNT.toLowerCase()])
  })

  it('Fix #1: createEncrypted does not re-prompt when a session signature is cached', async () => {
    cacheSignature(ACCOUNT, FIXED_SIGNATURE)
    const { result } = renderHook(() => useEncryption())

    await act(async () => {
      await result.current.createEncrypted(metadata, { algorithm: 'x25519' })
    })

    // Keys derive from the cached signature — the user is never prompted.
    expect(signMessage).not.toHaveBeenCalled()
  })

  it('Fix #2: addRecipientByPublicKey works from the cached signature when keyPairs state is empty', () => {
    // Render with no cache so the mount effect leaves keyPairs null...
    const { result } = renderHook(() => useEncryption())
    expect(result.current.isInitialized).toBe(false)

    // ...then a session signature appears (mirrors initializeKeys() having just
    // cached the signature but React state not yet reflecting it in this tick).
    cacheSignature(ACCOUNT, FIXED_SIGNATURE)

    const envelope = encryptMarketMetadata(
      metadata,
      [{ address: ACCOUNT, signature: FIXED_SIGNATURE }],
      2
    )
    const opponentKey = publicKeyFromSignature('0x' + 'b'.repeat(130))

    let updated
    expect(() => {
      updated = result.current.addRecipientByPublicKey(envelope, OPPONENT, opponentKey)
    }).not.toThrow()

    expect(getRecipients(updated)).toEqual(
      expect.arrayContaining([ACCOUNT.toLowerCase(), OPPONENT.toLowerCase()])
    )
  })

  it('addRecipientByPublicKey still throws when there is no key material at all', () => {
    const { result } = renderHook(() => useEncryption())

    const envelope = encryptMarketMetadata(
      metadata,
      [{ address: ACCOUNT, signature: FIXED_SIGNATURE }],
      2
    )
    const opponentKey = publicKeyFromSignature('0x' + 'b'.repeat(130))

    // No cached signature, no in-state keys → genuine "not initialized".
    expect(() =>
      result.current.addRecipientByPublicKey(envelope, OPPONENT, opponentKey)
    ).toThrow(/not initialized/i)
  })
})
