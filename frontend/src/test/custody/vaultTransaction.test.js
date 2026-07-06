// Spec 043 — encoder unit tests. The hash test independently reproduces Safe v1.4.1's getTransactionHash
// algorithm (EIP-712 domain separator + SafeTx typehash) and asserts our TypedDataEncoder-based
// computeSafeTxHash matches it byte-for-byte — proving on-chain/off-chain agreement without a chain.

import { describe, it, expect } from 'vitest'
import {
  AbiCoder,
  ZeroAddress,
  getAddress,
  id as keccakId,
  keccak256,
  solidityPacked,
} from 'ethers'
import {
  buildSafeTx,
  computeSafeTxHash,
  buildPrevalidatedSignatures,
  encodeMultiSend,
  encodeExecTransaction,
  buildAddOwner,
  buildChangeThreshold,
  prevOwnerOf,
  SENTINEL_OWNERS,
  DELEGATECALL,
} from '../../lib/custody/vaultTransaction'

const coder = AbiCoder.defaultAbiCoder()

// Independent, from-scratch reimplementation of Safe.encodeTransactionData / getTransactionHash.
function safeHashReference(safe, chainId, tx) {
  const DOMAIN_TYPEHASH = keccakId('EIP712Domain(uint256 chainId,address verifyingContract)')
  const SAFE_TX_TYPEHASH = keccakId(
    'SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)',
  )
  const domainSeparator = keccak256(
    coder.encode(['bytes32', 'uint256', 'address'], [DOMAIN_TYPEHASH, chainId, getAddress(safe)]),
  )
  const safeTxStructHash = keccak256(
    coder.encode(
      ['bytes32', 'address', 'uint256', 'bytes32', 'uint8', 'uint256', 'uint256', 'uint256', 'address', 'address', 'uint256'],
      [
        SAFE_TX_TYPEHASH,
        tx.to,
        tx.value,
        keccak256(tx.data),
        tx.operation,
        tx.safeTxGas,
        tx.baseGas,
        tx.gasPrice,
        tx.gasToken,
        tx.refundReceiver,
        tx.nonce,
      ],
    ),
  )
  return keccak256(solidityPacked(['bytes1', 'bytes1', 'bytes32', 'bytes32'], ['0x19', '0x01', domainSeparator, safeTxStructHash]))
}

const SAFE = '0x1111111111111111111111111111111111111111'
const CHAIN = 63

describe('computeSafeTxHash', () => {
  it('matches the raw Safe EIP-712 algorithm for a native transfer', () => {
    const tx = buildSafeTx({ to: '0x2222222222222222222222222222222222222222', value: 1000n, nonce: 5 })
    expect(computeSafeTxHash(SAFE, CHAIN, tx)).toBe(safeHashReference(SAFE, CHAIN, tx))
  })

  it('matches for a contract call with calldata and is chain/nonce sensitive', () => {
    const tx = buildSafeTx({ to: SAFE, data: '0xa9059cbb0000', nonce: 0 })
    expect(computeSafeTxHash(SAFE, CHAIN, tx)).toBe(safeHashReference(SAFE, CHAIN, tx))
    expect(computeSafeTxHash(SAFE, 137, tx)).not.toBe(computeSafeTxHash(SAFE, CHAIN, tx))
    const tx2 = buildSafeTx({ to: SAFE, data: '0xa9059cbb0000', nonce: 1 })
    expect(computeSafeTxHash(SAFE, CHAIN, tx2)).not.toBe(computeSafeTxHash(SAFE, CHAIN, tx))
  })
})

describe('buildPrevalidatedSignatures', () => {
  const A = '0x000000000000000000000000000000000000aaaa'
  const B = '0x000000000000000000000000000000000000bbbb'
  const C = '0x000000000000000000000000000000000000cccc'

  it('sorts owners ascending, 65 bytes each, v=1, r=padded owner', () => {
    const sig = buildPrevalidatedSignatures([C, A, B])
    expect((sig.length - 2) / 2).toBe(65 * 3)
    // first block must be the lowest address A
    const first = sig.slice(2, 2 + 130)
    expect(first.slice(24, 64).toLowerCase()).toBe(A.slice(2).toLowerCase()) // r low 20 bytes = owner
    expect(first.slice(64, 128)).toBe('00'.repeat(32)) // s = 0
    expect(first.slice(128, 130)).toBe('01') // v = 1
  })

  it('rejects duplicate owners and empty input', () => {
    expect(() => buildPrevalidatedSignatures([A, A])).toThrow(/duplicate/)
    expect(() => buildPrevalidatedSignatures([])).toThrow()
  })
})

describe('encodeMultiSend', () => {
  it('produces a DELEGATECALL SafeTx to MultiSendCallOnly wrapping the batch', () => {
    const MS = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2'
    const batch = encodeMultiSend(MS, [
      { to: '0x3333333333333333333333333333333333333333', data: '0x1234' },
      { to: '0x4444444444444444444444444444444444444444', value: 7n },
    ])
    expect(batch.operation).toBe(DELEGATECALL)
    expect(getAddress(batch.to)).toBe(getAddress(MS))
    expect(batch.data.startsWith('0x8d80ff0a')).toBe(true) // multiSend(bytes) selector
  })
})

describe('governance builders', () => {
  it('encodes addOwnerWithThreshold and changeThreshold targeting the Safe', () => {
    const add = buildAddOwner(SAFE, '0x5555555555555555555555555555555555555555', 2, 0)
    expect(getAddress(add.to)).toBe(getAddress(SAFE))
    expect(add.data.startsWith('0x0d582f13')).toBe(true) // addOwnerWithThreshold selector
    const chg = buildChangeThreshold(SAFE, 3, 1)
    expect(chg.data.startsWith('0x694e80c3')).toBe(true) // changeThreshold selector
  })
})

describe('prevOwnerOf', () => {
  it('returns SENTINEL for the first owner and the predecessor otherwise', () => {
    const owners = ['0xAA00000000000000000000000000000000000001', '0xBB00000000000000000000000000000000000002', '0xCC00000000000000000000000000000000000003']
    expect(prevOwnerOf(owners, owners[0])).toBe(SENTINEL_OWNERS)
    expect(getAddress(prevOwnerOf(owners, owners[2]))).toBe(getAddress(owners[1]))
    expect(() => prevOwnerOf(owners, ZeroAddress)).toThrow()
  })
})

describe('encodeExecTransaction', () => {
  it('returns the 10 ordered execTransaction args', () => {
    const tx = buildSafeTx({ to: SAFE, nonce: 0 })
    const args = encodeExecTransaction(tx, '0x01')
    expect(args).toHaveLength(10)
    expect(args[9]).toBe('0x01')
  })
})
