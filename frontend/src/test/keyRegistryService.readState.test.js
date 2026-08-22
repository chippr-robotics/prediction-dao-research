/**
 * #1286 — a key lookup must not answer a question it could not ask.
 *
 * `lookupPublicKey` used to return `null` for three different situations: the account genuinely
 * has no key, the registry is not deployed here, and the read failed. Its one caller turns `null`
 * into "Your opponent has not registered their encryption key yet" — a definite claim about
 * ANOTHER member, which an RPC timeout is in no position to support.
 *
 * Same three-state rule the estate reads follow: read / not-deployed / unreadable, and a value
 * only on `read`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getPublicKey, resolver } = vi.hoisted(() => ({
  getPublicKey: vi.fn(),
  resolver: vi.fn(() => '0xREG000000000000000000000000000000000001'),
}))

vi.mock('../config/contracts', () => ({
  getContractAddress: vi.fn(() => '0xREG000000000000000000000000000000000001'),
  getContractAddressForChain: resolver,
}))

vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers')
  return {
    ...actual,
    ethers: { ...actual.ethers, Contract: class { constructor() { this.getPublicKey = getPublicKey } } },
  }
})

import { lookupPublicKey, KeyLookupUnavailableError } from '../utils/keyRegistryService'

const provider = { getNetwork: async () => ({ chainId: 80002n }) }
// A fresh address per test: the module caches by address, and a cached miss from one test would
// answer the next one without ever reaching the stub.
let n = 0
const nextAddress = () => `0x${String(++n).padStart(40, '0')}`

beforeEach(() => {
  getPublicKey.mockReset()
  resolver.mockClear()
})

describe('lookupPublicKey — read / not-deployed / unreadable', () => {
  it('treats 0x as the ABSENCE of a key, quietly', () => {
    /*
     * ethers returns `'0x'` for an unset `bytes`, never `''`. The old empty-check compared against
     * `''`, so an unregistered account fell through to the length guard and was reported as
     * `Unexpected key length: 0 bytes` — as though the registry had answered with something
     * malformed. It had answered correctly: nothing.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getPublicKey.mockResolvedValue('0x')
    return lookupPublicKey(nextAddress(), provider).then((result) => {
      expect(result, 'a genuine absence is null').toBeNull()
      expect(warn, 'and is not reported as a malformed answer').not.toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  it('REFUSES to answer when the read failed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    getPublicKey.mockRejectedValue(new Error('network unreachable'))
    await expect(lookupPublicKey(nextAddress(), provider)).rejects.toBeInstanceOf(KeyLookupUnavailableError)
    err.mockRestore()
  })

  it('the refusal says it could not check — never that the account has no key', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    getPublicKey.mockRejectedValue(new Error('timeout'))
    await lookupPublicKey(nextAddress(), provider).then(
      () => { throw new Error('expected a refusal') },
      (e) => {
        expect(e.message).toMatch(/could not check/i)
        expect(e.message, 'no claim about the account').not.toMatch(/has not registered|no key/i)
      },
    )
    err.mockRestore()
  })

  it('returns the key on a clean read', async () => {
    const key = `0x${'ab'.repeat(32)}`
    getPublicKey.mockResolvedValue(key)
    const out = await lookupPublicKey(nextAddress(), provider)
    expect(out).toBeInstanceOf(Uint8Array)
    expect(out.length).toBe(32)
  })

  it('a registry that is not deployed here is an absence, not a refusal', async () => {
    // Nothing to read is a different fact from a failed read, and callers have always been
    // entitled to treat it as "no key". Preserved deliberately.
    resolver.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined)
    const { getContractAddress } = await import('../config/contracts')
    getContractAddress.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined)
    await expect(lookupPublicKey(nextAddress(), provider)).resolves.toBeNull()
  })
})
