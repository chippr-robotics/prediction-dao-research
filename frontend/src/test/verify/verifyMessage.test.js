/**
 * Protect ▸ Verify — verification semantics.
 *
 * The suite is organised around the THREE outcomes, because the bug this feature can actually ship
 * is collapsing them into two: an unreachable node reported as a forged signature. Every
 * network-failure path below asserts `unverifiable`, never `invalid`.
 */

import { describe, it, expect, vi } from 'vitest'
import { ethers } from 'ethers'
import {
  verifyMessage,
  verifySignedMessage,
  checkErc1271,
  recoverPersonalSigner,
  VERIFY_STATUS,
  ERC1271_MAGIC,
} from '../../lib/verify/verifyMessage'
import {
  MESSAGE,
  AWKWARD_MESSAGE,
  SIGNATURE,
  AWKWARD_SIGNATURE,
  SIGNER_ADDRESS,
  OTHER_ADDRESS,
  CONTRACT_ACCOUNT,
  CONTRACT_ACCOUNT_CHAIN_ID,
  ERC1271_SIGNATURE,
  EIP191_DOCUMENT,
  ERC1271_DOCUMENT,
  stubProvider,
} from '../fixtures/signedMessages'

// No test may fall through to a real network route; the ERC-1271 leg always takes an injected
// provider here, and this makes an accidental omission fail loudly rather than hang.
vi.mock('../../utils/rpcProvider', () => ({
  getReadProvider: () => {
    throw new Error('a test reached the real provider factory')
  },
}))

describe('verifyMessage — valid', () => {
  it('confirms a wallet signature against the claimed address, with no network at all', async () => {
    const out = await verifyMessage({ message: MESSAGE, signature: SIGNATURE, address: SIGNER_ADDRESS })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
    expect(out.method).toBe('eip191')
    expect(out.signer).toBe(SIGNER_ADDRESS)
  })

  it('is case-insensitive about the claimed address', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: SIGNATURE,
      address: SIGNER_ADDRESS.toLowerCase(),
    })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
  })

  it('preserves whitespace and Unicode exactly — nothing is normalized', async () => {
    const out = await verifyMessage({
      message: AWKWARD_MESSAGE,
      signature: AWKWARD_SIGNATURE,
      address: SIGNER_ADDRESS,
    })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
    // …and the trimmed variant must NOT verify, which is what makes the above meaningful.
    const trimmed = await verifyMessage({
      message: AWKWARD_MESSAGE.trim(),
      signature: AWKWARD_SIGNATURE,
      address: SIGNER_ADDRESS,
      chainId: 137,
      provider: stubProvider({ code: '0x' }),
    })
    expect(trimmed.status).toBe(VERIFY_STATUS.INVALID)
  })

  it('names the signer when no address is claimed', async () => {
    const out = await verifyMessage({ message: MESSAGE, signature: SIGNATURE })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
    expect(out.signer).toBe(SIGNER_ADDRESS)
  })

  it('accepts a contract account whose isValidSignature returns the magic value', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: CONTRACT_ACCOUNT,
      chainId: CONTRACT_ACCOUNT_CHAIN_ID,
      provider: stubProvider({ answer: 'magic' }),
    })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
    expect(out.method).toBe('erc1271')
  })

  it('falls through to the contract when ECDSA recovers a DIFFERENT address (an owner is not the account)', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: SIGNATURE, // recovers to SIGNER_ADDRESS…
      address: CONTRACT_ACCOUNT, // …but the claim is the account it controls
      chainId: CONTRACT_ACCOUNT_CHAIN_ID,
      provider: stubProvider({ answer: 'magic' }),
    })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
    expect(out.method).toBe('erc1271')
  })
})

describe('verifyMessage — definite negatives', () => {
  it('rejects a signature by somebody else and names who actually signed', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: SIGNATURE,
      address: OTHER_ADDRESS,
      chainId: 137,
      provider: stubProvider({ code: '0x' }),
    })
    expect(out.status).toBe(VERIFY_STATUS.INVALID)
    expect(out.signer).toBe(SIGNER_ADDRESS)
    expect(out.reason).toContain(SIGNER_ADDRESS)
  })

  it('rejects a tampered message', async () => {
    const out = await verifyMessage({
      message: `${MESSAGE} (edited)`,
      signature: SIGNATURE,
      address: SIGNER_ADDRESS,
      chainId: 137,
      provider: stubProvider({ code: '0x' }),
    })
    expect(out.status).toBe(VERIFY_STATUS.INVALID)
  })

  it('rejects when the account contract itself says no', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: CONTRACT_ACCOUNT,
      chainId: CONTRACT_ACCOUNT_CHAIN_ID,
      provider: stubProvider({ answer: 'wrong' }),
    })
    expect(out.status).toBe(VERIFY_STATUS.INVALID)
    expect(out.method).toBe('erc1271')
  })

  it('rejects non-ECDSA bytes against an address holding no code on the named chain', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: OTHER_ADDRESS,
      chainId: 137,
      provider: stubProvider({ code: '0x' }),
    })
    expect(out.status).toBe(VERIFY_STATUS.INVALID)
    expect(out.reason).toMatch(/holds no contract/i)
  })

  it('rejects a signature that is not hex', async () => {
    const out = await verifyMessage({ message: MESSAGE, signature: 'not-a-signature', address: SIGNER_ADDRESS })
    expect(out.status).toBe(VERIFY_STATUS.INVALID)
    expect(out.reason).toMatch(/valid hex/i)
  })

  it('rejects an address that is not an address', async () => {
    const out = await verifyMessage({ message: MESSAGE, signature: SIGNATURE, address: '0xnope' })
    expect(out.status).toBe(VERIFY_STATUS.INVALID)
    expect(out.reason).toMatch(/not a valid address/i)
  })
})

describe('verifyMessage — unverifiable is not invalid', () => {
  it('reports unverifiable when the chain is unknown and the bytes are not ECDSA', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: CONTRACT_ACCOUNT,
    })
    expect(out.status).toBe(VERIFY_STATUS.UNVERIFIABLE)
    expect(out.reason).toMatch(/which network/i)
  })

  it('reports unverifiable when the node cannot be reached', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: CONTRACT_ACCOUNT,
      chainId: CONTRACT_ACCOUNT_CHAIN_ID,
      provider: stubProvider({ failCode: true }),
    })
    expect(out.status).toBe(VERIFY_STATUS.UNVERIFIABLE)
    expect(out.reason).toMatch(/could not be reached/i)
  })

  it('reports unverifiable when isValidSignature reverts — a broken account is not a forgery', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: CONTRACT_ACCOUNT,
      chainId: CONTRACT_ACCOUNT_CHAIN_ID,
      provider: stubProvider({ failCall: true }),
    })
    expect(out.status).toBe(VERIFY_STATUS.UNVERIFIABLE)
  })

  it('a mismatching recovery with an unreachable node stays unverifiable, and still names the recovered signer', async () => {
    const out = await verifyMessage({
      message: MESSAGE,
      signature: SIGNATURE,
      address: CONTRACT_ACCOUNT,
      chainId: CONTRACT_ACCOUNT_CHAIN_ID,
      provider: stubProvider({ failCode: true }),
    })
    expect(out.status).toBe(VERIFY_STATUS.UNVERIFIABLE)
    expect(out.signer).toBe(SIGNER_ADDRESS)
    expect(out.reason).toContain(SIGNER_ADDRESS)
  })

  // The same shape without a chain at all: an owner key recovering instead of the account it
  // controls is NOT evidence of forgery, so this must not be promoted to a negative.
  it('does not promote a mismatching recovery to a negative when no chain was given', async () => {
    const out = await verifyMessage({ message: MESSAGE, signature: SIGNATURE, address: CONTRACT_ACCOUNT })
    expect(out.status).toBe(VERIFY_STATUS.UNVERIFIABLE)
    expect(out.signer).toBe(SIGNER_ADDRESS)
  })

  it('cannot name a signer for contract-account bytes when no address is claimed', async () => {
    const out = await verifyMessage({ message: MESSAGE, signature: ERC1271_SIGNATURE })
    expect(out.status).toBe(VERIFY_STATUS.UNVERIFIABLE)
    expect(out.signer).toBeNull()
  })
})

describe('checkErc1271', () => {
  it('asks the account with the EIP-191 digest of the message', async () => {
    const call = vi.fn().mockResolvedValue(`${ERC1271_MAGIC}${'0'.repeat(56)}`)
    const provider = { getCode: async () => '0x6000', call }
    const out = await checkErc1271({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: CONTRACT_ACCOUNT,
      chainId: 137,
      provider,
    })
    expect(out).toEqual({ answered: true, valid: true })
    const iface = new ethers.Interface(['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'])
    const decoded = iface.decodeFunctionData('isValidSignature', call.mock.calls[0][0].data)
    expect(decoded[0]).toBe(ethers.hashMessage(MESSAGE))
  })

  it('treats an empty return as a definite no, not an outage', async () => {
    const out = await checkErc1271({
      message: MESSAGE,
      signature: ERC1271_SIGNATURE,
      address: CONTRACT_ACCOUNT,
      chainId: 137,
      provider: stubProvider({ answer: 'empty' }),
    })
    expect(out).toMatchObject({ answered: true, valid: false })
  })
})

describe('recoverPersonalSigner', () => {
  it('returns null instead of throwing on bytes that are not a signature', () => {
    expect(recoverPersonalSigner(MESSAGE, ERC1271_SIGNATURE)).toBeNull()
  })
})

describe('verifySignedMessage', () => {
  it('verifies straight from a parsed document', async () => {
    const out = await verifySignedMessage(EIP191_DOCUMENT)
    expect(out.status).toBe(VERIFY_STATUS.VALID)
  })

  it('carries the document chain into the on-chain leg', async () => {
    const out = await verifySignedMessage(ERC1271_DOCUMENT, { provider: stubProvider({ answer: 'magic' }) })
    expect(out.status).toBe(VERIFY_STATUS.VALID)
    expect(out.method).toBe('erc1271')
  })
})
