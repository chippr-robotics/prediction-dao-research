/**
 * Protect ▸ Verify — the signing seam.
 *
 * Two properties matter more than the rest: the message must reach the signer byte-for-byte, and
 * an identity that cannot sign must say so BEFORE the member types anything (never a dead button).
 */

import { describe, it, expect, vi } from 'vitest'
import { ethers } from 'ethers'
import { resolveMessageSigner, signMessageAsAccount, SignatureDeclined } from '../../lib/verify/signMessage'
import { verifyMessage, VERIFY_STATUS } from '../../lib/verify/verifyMessage'
import { SIGN_SCHEMES } from '../../lib/verify/signedMessage'
import {
  MESSAGE,
  AWKWARD_MESSAGE,
  SIGNER_KEY,
  SIGNER_ADDRESS,
  CONTRACT_ACCOUNT,
  ERC1271_SIGNATURE,
} from '../fixtures/signedMessages'

const walletSigner = new ethers.Wallet(SIGNER_KEY)

describe('resolveMessageSigner', () => {
  it('signs with the connected wallet on a classic session', () => {
    const out = resolveMessageSigner({
      loginMethod: 'injected',
      signer: walletSigner,
      address: SIGNER_ADDRESS,
      chainId: 137,
    })
    expect(out).toMatchObject({ canSign: true, kind: 'eoa', scheme: SIGN_SCHEMES.EIP191 })
  })

  it('signs through the account contract on a passkey session', () => {
    const makePasskeySigner = vi.fn(() => ({ signMessage: async () => ERC1271_SIGNATURE }))
    const out = resolveMessageSigner({
      loginMethod: 'passkey',
      signer: null,
      address: CONTRACT_ACCOUNT,
      chainId: 137,
      passkey: { credentialId: 'cred-1' },
      makePasskeySigner,
    })
    expect(out).toMatchObject({ canSign: true, kind: 'passkey', scheme: SIGN_SCHEMES.ERC1271 })
    expect(makePasskeySigner).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 137, address: CONTRACT_ACCOUNT, credentialId: 'cred-1' }),
    )
  })

  // The refusal that matters: a Safe has no key. Signing here would prove control of the member's
  // OWN account while the UI said "vault" — the exact misattribution this surface exists to stop.
  it('refuses to sign as a vault, and says why', () => {
    const out = resolveMessageSigner({
      loginMethod: 'injected',
      signer: walletSigner,
      address: SIGNER_ADDRESS,
      chainId: 137,
      identity: { mode: 'vault', vaultAddress: '0xabc' },
    })
    expect(out.canSign).toBe(false)
    expect(out.kind).toBe('vault')
    expect(out.reason).toMatch(/threshold of its owners/i)
  })

  it('refuses a passkey session with no credential on this device', () => {
    const out = resolveMessageSigner({ loginMethod: 'passkey', address: CONTRACT_ACCOUNT, chainId: 137 })
    expect(out).toMatchObject({ canSign: false, kind: 'passkey' })
    expect(out.reason).toMatch(/sign in again/i)
  })

  it('refuses a passkey session with no network — the contract has to be somewhere', () => {
    const out = resolveMessageSigner({
      loginMethod: 'passkey',
      address: CONTRACT_ACCOUNT,
      chainId: null,
      passkey: { credentialId: 'cred-1' },
    })
    expect(out.canSign).toBe(false)
    expect(out.reason).toMatch(/network/i)
  })

  it('refuses with no account at all', () => {
    expect(resolveMessageSigner({ loginMethod: null, address: null })).toMatchObject({
      canSign: false,
      kind: 'none',
    })
  })
})

describe('signMessageAsAccount', () => {
  const resolved = () =>
    resolveMessageSigner({ loginMethod: 'injected', signer: walletSigner, address: SIGNER_ADDRESS, chainId: 137 })

  it('produces a document that verifies', async () => {
    const doc = await signMessageAsAccount({ message: MESSAGE, resolved: resolved(), chainId: 137 })
    expect(doc.address).toBe(SIGNER_ADDRESS)
    expect(doc.chainId).toBe(137)
    const out = await verifyMessage({ message: doc.message, signature: doc.signature, address: doc.address })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
  })

  it('signs the message verbatim — no trimming, no wrapper, no appended nonce', async () => {
    const sign = vi.fn(async (m) => walletSigner.signMessage(m))
    const doc = await signMessageAsAccount({
      message: AWKWARD_MESSAGE,
      resolved: { canSign: true, address: SIGNER_ADDRESS, scheme: SIGN_SCHEMES.EIP191, sign },
      chainId: 137,
    })
    expect(sign).toHaveBeenCalledWith(AWKWARD_MESSAGE)
    expect(doc.message).toBe(AWKWARD_MESSAGE)
  })

  it('refuses an empty message', async () => {
    await expect(signMessageAsAccount({ message: '', resolved: resolved(), chainId: 137 })).rejects.toThrow(
      /write a message/i,
    )
  })

  it("surfaces the resolver's reason when the identity cannot sign", async () => {
    await expect(
      signMessageAsAccount({
        message: MESSAGE,
        resolved: { canSign: false, reason: 'no key here' },
        chainId: 137,
      }),
    ).rejects.toThrow('no key here')
  })

  it.each([
    ['EIP-1193 rejection', Object.assign(new Error('boom'), { code: 4001 })],
    ['ethers ACTION_REJECTED', Object.assign(new Error('boom'), { code: 'ACTION_REJECTED' })],
    ['WebAuthn dismissal', Object.assign(new Error('boom'), { name: 'NotAllowedError' })],
    ['wallet copy', new Error('User rejected the request')],
  ])('reports %s as a cancellation, not a failure', async (_label, error) => {
    const failing = {
      canSign: true,
      address: SIGNER_ADDRESS,
      scheme: SIGN_SCHEMES.EIP191,
      sign: async () => {
        throw error
      },
    }
    await expect(signMessageAsAccount({ message: MESSAGE, resolved: failing, chainId: 137 })).rejects.toBeInstanceOf(
      SignatureDeclined,
    )
  })

  it('lets a real signing failure through as itself', async () => {
    const failing = {
      canSign: true,
      address: SIGNER_ADDRESS,
      scheme: SIGN_SCHEMES.EIP191,
      sign: async () => {
        throw new Error('hardware wallet is locked')
      },
    }
    await expect(signMessageAsAccount({ message: MESSAGE, resolved: failing, chainId: 137 })).rejects.toThrow(
      /hardware wallet/,
    )
  })
})
