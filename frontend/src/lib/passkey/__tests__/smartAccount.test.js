/**
 * Spec 041 T019 — smart-account layer: owner-bytes encodings (must match the
 * MultiOwnable ABI exactly — parity vectors from test/account/factory.test.js),
 * batch composition, guard refusals, capability gating per network.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../config/networks', () => ({
  getNetwork: vi.fn((chainId) => {
    if (chainId === 80002) {
      return {
        chainId: 80002,
        rpcUrl: 'https://rpc.example',
        capabilities: { passkeyAccounts: true },
        passkey: { bundlerUrls: ['https://bundler.example'], erc20PaymasterUrl: null },
      }
    }
    return { chainId, capabilities: { passkeyAccounts: false }, passkey: null }
  }),
}))

vi.mock('../../../config/contracts', () => ({
  getContractAddressForChain: vi.fn((key, chainId) => {
    if (chainId !== 80002) return null
    return {
      accountFactory: '0xFAC70000000000000000000000000000000000001'.slice(0, 42),
      entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    }[key]
  }),
}))

import {
  publicKeyToOwnerBytes,
  addressToOwnerBytes,
  buildAction,
  encodeRemoveOwner,
  encodeAddWalletOwner,
  requirePasskeySupport,
  deriveAddress,
  ChainNotSupportedError,
  LastControllerError,
} from '../smartAccount'

const X = '0x' + '11'.repeat(32)
const Y = '0x' + '22'.repeat(32)

describe('owner-bytes encodings (MultiOwnable ABI parity)', () => {
  it('encodes a P-256 public key as 64 bytes x||y (abi.encode(bytes32,bytes32))', () => {
    const bytes = publicKeyToOwnerBytes({ x: X, y: Y })
    expect(bytes).toBe('0x' + '11'.repeat(32) + '22'.repeat(32))
    expect(bytes.length).toBe(2 + 128)
  })

  it('encodes an EOA as 32 bytes left-padded (abi.encode(address))', () => {
    const addr = '0xAbCd000000000000000000000000000000000123'
    const bytes = addressToOwnerBytes(addr)
    expect(bytes).toBe('0x' + '0'.repeat(24) + addr.slice(2).toLowerCase())
    expect(bytes.length).toBe(2 + 64)
  })
})

describe('capability gating (FR-022)', () => {
  it('resolves the stack on a supported network', () => {
    const out = requirePasskeySupport(80002)
    expect(out.factory).toMatch(/^0xFAC7/i)
    expect(out.bundlerUrls).toHaveLength(1)
  })

  it('throws ChainNotSupportedError on ETC/Mordor-class networks', () => {
    expect(() => requirePasskeySupport(63)).toThrow(ChainNotSupportedError)
  })
})

describe('deriveAddress', () => {
  it('reads the factory getAddress with the exact (owners, nonce) inputs', async () => {
    const publicClient = { readContract: vi.fn().mockResolvedValue('0xACC0000000000000000000000000000000000001') }
    const ownersBytes = [publicKeyToOwnerBytes({ x: X, y: Y })]
    const addr = await deriveAddress({ chainId: 80002, ownersBytes, nonce: 7n, deps: { publicClient } })
    expect(addr).toMatch(/^0xACC/)
    const call = publicClient.readContract.mock.calls[0][0]
    expect(call.functionName).toBe('getAddress')
    expect(call.args).toEqual([ownersBytes, 7n])
    expect(call.address).toMatch(/^0xFAC7/i)
  })
})

describe('action composition + guards', () => {
  it('buildAction shapes approve+act as one batch (FR-016)', () => {
    const { calls } = buildAction([
      { target: '0x' + 'a'.repeat(40), data: '0x01' },
      { target: '0x' + 'b'.repeat(40), data: '0x02', value: 5n },
    ])
    expect(calls).toEqual([
      { to: '0x' + 'a'.repeat(40), value: 0n, data: '0x01' },
      { to: '0x' + 'b'.repeat(40), value: 5n, data: '0x02' },
    ])
  })

  it('encodeRemoveOwner refuses to strand the account (FR-020 client half)', () => {
    expect(() => encodeRemoveOwner({ index: 0n, ownerBytes: '0x' + '0'.repeat(64), ownerCount: 1n })).toThrow(
      LastControllerError
    )
  })

  it('encodeRemoveOwner / encodeAddWalletOwner produce calldata for the vendored ABI', () => {
    const remove = encodeRemoveOwner({
      index: 1n,
      ownerBytes: addressToOwnerBytes('0x' + 'c'.repeat(40)),
      ownerCount: 2n,
    })
    expect(remove.startsWith('0x')).toBe(true)
    const add = encodeAddWalletOwner('0x' + 'd'.repeat(40))
    expect(add.startsWith('0x')).toBe(true)
    expect(add.toLowerCase()).toContain('d'.repeat(40))
  })
})
