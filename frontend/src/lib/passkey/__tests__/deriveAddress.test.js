/**
 * Chain-independent account address derivation (spec 041 FR-023).
 *
 * `computeAccountAddress` replaces an RPC call to the factory's `getAddress`. That swap is what
 * lets a member sign in on ANY network — including one with no bundler, no deployment, or no
 * reachable RPC — but it means a drifted constant would silently mint addresses nobody can spend
 * from. These vectors were produced by CALLING the live factory
 * (0xd519C25e9dEd0DAC586B764574100479CB318734) on Polygon, so they fail loudly if
 * ACCOUNT_INIT_CODE_HASH, the factory address, or the salt encoding ever changes.
 */
import { describe, it, expect, vi } from 'vitest'

import {
  computeAccountAddress,
  deriveAddress,
  accountFactoryAddress,
  publicKeyToOwnerBytes,
  addressToOwnerBytes,
  ACCOUNT_INIT_CODE_HASH,
} from '../smartAccount'

const FACTORY = '0xd519C25e9dEd0DAC586B764574100479CB318734'
const EOA = '0x52502d049571C7893447b86c4d8B38e6184bF6e1'

// owners / nonce -> address, each confirmed against the deployed factory's getAddress().
const VECTORS = [
  { owners: [`0x${'11'.repeat(64)}`], nonce: 0n, expected: '0x58414b1C931D1609491d32901Fb157a7F1E71e91' },
  { owners: [`0x${'ab'.repeat(64)}`], nonce: 7n, expected: '0xF29dC3109318ae11EA080267b3b0E322EE862bED' },
  { owners: [addressToOwnerBytes(EOA)], nonce: 0n, expected: '0x6DdB19B1ae5cb1465B11e1c644cC80beEd7728f8' },
  {
    owners: [`0x${'11'.repeat(64)}`, addressToOwnerBytes(EOA)],
    nonce: 3n,
    expected: '0xEe13e64928795A6B273F8867eCb0663F76D93D76',
  },
]

describe('computeAccountAddress — matches the on-chain factory', () => {
  it.each(VECTORS)('owners=$owners.length nonce=$nonce', ({ owners, nonce, expected }) => {
    expect(computeAccountAddress({ ownersBytes: owners, nonce })).toBe(expected)
  })

  it('pins the init code hash the vectors were generated against', () => {
    expect(ACCOUNT_INIT_CODE_HASH).toBe('0x0a40302ceb0b44810777085a7c2c96a8c4d443faad822012befbc253996f4f2e')
  })

  it('treats a numeric nonce the same as a bigint (call sites pass both)', () => {
    expect(computeAccountAddress({ ownersBytes: [`0x${'11'.repeat(64)}`], nonce: 0 })).toBe(VECTORS[0].expected)
  })

  it('derives a DIFFERENT address per owner set and per nonce (salt actually binds both)', () => {
    const addrs = new Set(VECTORS.map((v) => computeAccountAddress({ ownersBytes: v.owners, nonce: v.nonce })))
    expect(addrs.size).toBe(VECTORS.length)
  })
})

describe('sign-in never touches the chain', () => {
  it('deriveAddress resolves without an RPC, on a chain with no passkey config at all', async () => {
    // Hoodi (560048) has no bundler and no deployment. Before this change, deriveAddress went
    // through requirePasskeySupport and threw ChainNotSupportedError here — which is what locked
    // members out. A rejecting client proves no network call is made.
    const publicClient = { readContract: vi.fn().mockRejectedValue(new Error('no RPC on this chain')) }
    const address = await deriveAddress({
      chainId: 560048,
      ownersBytes: [`0x${'11'.repeat(64)}`],
      deps: { publicClient },
    })
    expect(address).toBe(VECTORS[0].expected)
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('produces the SAME address regardless of which chain is passed (FR-023)', async () => {
    const owners = [publicKeyToOwnerBytes({ x: `0x${'11'.repeat(32)}`, y: `0x${'11'.repeat(32)}` })]
    const addrs = await Promise.all([1, 10, 137, 8453, 42161, 61, 63, 560048].map((id) => deriveAddress({ chainId: id, ownersBytes: owners })))
    expect(new Set(addrs).size).toBe(1)
  })
})

describe('accountFactoryAddress', () => {
  it('resolves the single factory shared by every configured network', () => {
    expect(accountFactoryAddress()).toBe(FACTORY)
  })
})
