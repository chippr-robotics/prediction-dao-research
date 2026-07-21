/**
 * Spec 041 — app-wide passkey encrypt/decrypt surface.
 *
 * A passkey session has no ethers signer: encryption keys come from the WebAuthn
 * PRF master seed, and the on-chain KeyRegistry write goes through sendCalls. These
 * tests verify useEncryption drives that path — derive from PRF (no signMessage),
 * auto-register via sendCalls, and a full createEncrypted → decryptMetadata
 * round-trip — so encrypted wagers work identically to the EOA path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { deriveKeyPairFromSeed, deriveXWingKeyPairFromSeed } from '../utils/crypto/envelopeEncryption.js'

const ACCOUNT = '0x00000000000000000000000000000000000000aa'
const OPPONENT = '0x00000000000000000000000000000000000000bb'
const SEED = new Uint8Array(32).fill(7)

// The passkey account's deterministic keys (as ensurePasskeyEncryptionKeys would return).
const x = deriveKeyPairFromSeed(SEED)
const xw = deriveXWingKeyPairFromSeed(SEED)
const PASSKEY_KEYS = {
  publicKey: x.publicKey,
  privateKey: x.privateKey,
  xwingPublicKey: xw.publicKey,
  xwingSecretKey: xw.secretKey,
}

const sendCalls = vi.fn(async () => ({ route: 'userop', txHash: '0xregister' }))
const readProvider = { getNetwork: async () => ({ chainId: 137n }) }

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => ({
    account: ACCOUNT,
    isConnected: true,
    loginMethod: 'passkey',
    signer: null, // the whole point: no EOA signer
    sendCalls,
    chainId: 137,
    provider: readProvider,
  }),
}))

// PRF derivation is exercised in its own suite; here we assert the wiring, so we
// stub it to return the deterministic keys above.
const ensurePasskeyEncryptionKeys = vi.fn(async () => PASSKEY_KEYS)
vi.mock('../lib/passkey/encryption.js', () => ({
  ensurePasskeyEncryptionKeys: (...a) => ensurePasskeyEncryptionKeys(...a),
}))
vi.mock('../connectors/passkey.js', () => ({
  readSession: () => ({ credentialId: 'cred-1' }),
}))
vi.mock('../utils/legalDocs.js', () => ({
  getCurrentDocument: () => ({ hash: null }),
}))

const buildRegisterKeyCalls = vi.fn(() => [{ target: '0xkeyRegistry', data: '0xdead', value: 0n }])
const hasRegisteredKey = vi.fn(async () => false)
const registerEncryptionKey = vi.fn(async () => ({ hash: '0x1', status: 'success' }))
vi.mock('../utils/keyRegistryService.js', () => ({
  lookupPublicKey: vi.fn(async () => null),
  hasRegisteredKey: (...a) => hasRegisteredKey(...a),
  ensureKeyRegistered: vi.fn(async () => false),
  registerEncryptionKey: (...a) => registerEncryptionKey(...a),
  buildRegisterKeyCalls: (...a) => buildRegisterKeyCalls(...a),
  clearKeyCache: vi.fn(),
}))

import { useEncryption } from '../hooks/useEncryption'
import { getRecipients } from '../utils/crypto/envelopeEncryption.js'

const metadata = { name: 'Private passkey wager', description: 'Heads or tails for 10 USDC' }

describe('useEncryption — passkey encrypt/decrypt surface', () => {
  beforeEach(() => {
    sendCalls.mockClear()
    ensurePasskeyEncryptionKeys.mockClear()
    buildRegisterKeyCalls.mockClear()
    hasRegisteredKey.mockClear()
    hasRegisteredKey.mockResolvedValue(false)
  })

  it('registerKeyNow bootstraps (allowInit) + awaits the on-chain register, and surfaces failures', async () => {
    const { result } = renderHook(() => useEncryption())
    let out
    await act(async () => {
      out = await result.current.registerKeyNow()
    })
    // No on-chain key yet ⇒ allowInit true, so a stranded single-device passkey can mint its own seed.
    expect(ensurePasskeyEncryptionKeys).toHaveBeenCalledWith(
      expect.objectContaining({ account: ACCOUNT, credentialId: 'cred-1', allowInit: true })
    )
    expect(buildRegisterKeyCalls).toHaveBeenCalledWith(PASSKEY_KEYS.publicKey, 137, null)
    expect(sendCalls).toHaveBeenCalledWith([{ target: '0xkeyRegistry', data: '0xdead', value: 0n }])
    expect(out).toMatchObject({ alreadyRegistered: false })

    // A relayer/paymaster outage now propagates to the caller (was swallowed by the fire-and-forget path).
    sendCalls.mockRejectedValueOnce(new Error('paymaster unavailable'))
    await act(async () => {
      await expect(result.current.registerKeyNow()).rejects.toThrow(/paymaster unavailable/i)
    })
  })

  it('registerKeyNow never bootstraps a fresh seed when a key is already published on-chain', async () => {
    hasRegisteredKey.mockResolvedValue(true)
    const { result } = renderHook(() => useEncryption())
    let out
    await act(async () => {
      out = await result.current.registerKeyNow()
    })
    // allowInit MUST be false so we never mint a second seed that would orphan the published key.
    expect(ensurePasskeyEncryptionKeys).toHaveBeenCalledWith(
      expect.objectContaining({ allowInit: false })
    )
    expect(out).toMatchObject({ alreadyRegistered: true })
    expect(sendCalls).not.toHaveBeenCalled()
  })

  it('derives encryption keys from the PRF seed — no signer, no signMessage', async () => {
    const { result } = renderHook(() => useEncryption())
    let init
    await act(async () => {
      init = await result.current.ensureInitialized()
    })
    expect(ensurePasskeyEncryptionKeys).toHaveBeenCalledTimes(1)
    expect(Array.from(init.publicKey)).toEqual(Array.from(PASSKEY_KEYS.publicKey))
    expect(result.current.isInitialized).toBe(true)
  })

  it('auto-registers the X25519 key on-chain through sendCalls (not a signer write)', async () => {
    const { result } = renderHook(() => useEncryption())
    await act(async () => {
      await result.current.initializeKeys()
    })
    await vi.waitFor(() => expect(sendCalls).toHaveBeenCalledTimes(1))
    expect(buildRegisterKeyCalls).toHaveBeenCalledWith(PASSKEY_KEYS.publicKey, 137, null)
    // The batch handed to sendCalls is the register call.
    expect(sendCalls.mock.calls[0][0]).toEqual([{ target: '0xkeyRegistry', data: '0xdead', value: 0n }])
  })

  it('createEncrypted → decryptMetadata round-trips for a passkey account (X-Wing)', async () => {
    const { result } = renderHook(() => useEncryption())
    let created
    await act(async () => {
      created = await result.current.createEncrypted(metadata) // default xwing
    })
    expect(getRecipients(created.envelope)).toEqual([ACCOUNT.toLowerCase()])

    let decrypted
    await act(async () => {
      decrypted = await result.current.decryptMetadata(created.envelope)
    })
    expect(decrypted).toMatchObject(metadata)
  })

  it('createEncrypted (x25519) + addRecipientByPublicKey adds an opponent in the same tick', async () => {
    const { result } = renderHook(() => useEncryption())
    let finalEnvelope
    await act(async () => {
      const { envelope } = await result.current.createEncrypted(metadata, { algorithm: 'x25519' })
      // Same handler tick as createEncrypted — the ref (not React state) must supply
      // the private key, since a passkey session has no signature cache to fall back on.
      const opponentKey = deriveKeyPairFromSeed(new Uint8Array(32).fill(9)).publicKey
      finalEnvelope = result.current.addRecipientByPublicKey(envelope, OPPONENT, opponentKey)
    })
    expect(getRecipients(finalEnvelope)).toEqual(
      expect.arrayContaining([ACCOUNT.toLowerCase(), OPPONENT.toLowerCase()])
    )
  })
})
