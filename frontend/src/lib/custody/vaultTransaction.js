// Spec 043 — Safe (v1.4.1) transaction encoders for the on-chain-only custody flow. Pure functions over
// ethers v6; no provider required (so they are deterministically unit-testable). See
// specs/043-safe-multisig-custody/contracts/vault-transactions.md.
//
// Flow: build a SafeTx → computeSafeTxHash → each owner approveHash(hash) on-chain → any owner execTransaction
// with a PRE-VALIDATED signature bundle once threshold owners have approved. No off-chain ECDSA is ever needed.

import { Interface, TypedDataEncoder, ZeroAddress, getAddress, solidityPacked, zeroPadValue } from 'ethers'
import { SAFE_ABI } from '../../abis/Safe'
import { MULTI_SEND_CALL_ONLY_ABI } from '../../abis/MultiSendCallOnly'

/** EIP-712 type of a Safe transaction (matches Safe v1.4.1 `SafeTx` typehash). */
export const SAFE_TX_TYPES = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
}

export const CALL = 0
export const DELEGATECALL = 1

const safeIface = new Interface(SAFE_ABI)
const multiSendIface = new Interface(MULTI_SEND_CALL_ONLY_ABI)

/**
 * Normalize a partial Safe transaction into a full SafeTx with the custody defaults (no gas refunds).
 * @param {{to:string,value?:bigint|number|string,data?:string,operation?:number,nonce:bigint|number|string,
 *   safeTxGas?:bigint|number|string,baseGas?:bigint|number|string,gasPrice?:bigint|number|string,
 *   gasToken?:string,refundReceiver?:string}} tx
 */
export function buildSafeTx(tx) {
  if (!tx || tx.to == null) throw new Error('buildSafeTx: `to` is required')
  if (tx.nonce == null) throw new Error('buildSafeTx: `nonce` is required')
  const operation = tx.operation ?? CALL
  if (operation !== CALL && operation !== DELEGATECALL) {
    throw new Error(`buildSafeTx: invalid operation ${operation}`)
  }
  return {
    to: getAddress(tx.to),
    value: BigInt(tx.value ?? 0),
    data: tx.data ?? '0x',
    operation,
    safeTxGas: BigInt(tx.safeTxGas ?? 0),
    baseGas: BigInt(tx.baseGas ?? 0),
    gasPrice: BigInt(tx.gasPrice ?? 0),
    gasToken: getAddress(tx.gasToken ?? ZeroAddress),
    refundReceiver: getAddress(tx.refundReceiver ?? ZeroAddress),
    nonce: BigInt(tx.nonce),
  }
}

/**
 * Compute the Safe transaction hash (the value each owner approves) off-chain. Matches
 * `Safe.getTransactionHash(...)`: EIP-712 over the SafeTx type with domain {chainId, verifyingContract: safe}.
 * @param {string} safeAddress
 * @param {number|string} chainId
 * @param {object} safeTx result of buildSafeTx
 * @returns {string} 32-byte hash
 */
export function computeSafeTxHash(safeAddress, chainId, safeTx) {
  const domain = { chainId: Number(chainId), verifyingContract: getAddress(safeAddress) }
  return TypedDataEncoder.hash(domain, SAFE_TX_TYPES, safeTx)
}

/**
 * Build the pre-validated ("approved hash") signature bundle for `execTransaction`. For each approving owner,
 * 65 bytes: r = owner left-padded to 32 bytes, s = 32 zero bytes, v = 0x01. Blocks MUST be concatenated in
 * ASCENDING owner-address order (the Safe's checkNSignatures loop requires currentOwner > lastOwner).
 * @param {string[]} approverAddresses owners that have called approveHash for this tx
 * @returns {string} 0x-prefixed concatenated signatures
 */
export function buildPrevalidatedSignatures(approverAddresses) {
  if (!Array.isArray(approverAddresses) || approverAddresses.length === 0) {
    throw new Error('buildPrevalidatedSignatures: at least one approver is required')
  }
  const sorted = [...approverAddresses]
    .map((a) => getAddress(a))
    .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0))
  // reject duplicates (would be rejected on-chain and double-count nothing)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1]) throw new Error(`buildPrevalidatedSignatures: duplicate owner ${sorted[i]}`)
  }
  let out = '0x'
  for (const owner of sorted) {
    const r = zeroPadValue(owner, 32).slice(2) // 32-byte left-padded address
    const s = '00'.repeat(32)
    const v = '01'
    out += r + s + v
  }
  return out
}

/**
 * Pack inner transactions for MultiSendCallOnly. Each: operation(1=0x00) ‖ to(20) ‖ value(32) ‖ dataLen(32) ‖
 * data. Returns a SafeTx-shaped object (operation=DELEGATECALL to MultiSendCallOnly) to feed buildSafeTx.
 * @param {string} multiSendCallOnly address
 * @param {{to:string,value?:bigint|number|string,data?:string}[]} innerTxs
 */
export function encodeMultiSend(multiSendCallOnly, innerTxs) {
  if (!Array.isArray(innerTxs) || innerTxs.length === 0) {
    throw new Error('encodeMultiSend: at least one inner transaction is required')
  }
  const packed = innerTxs
    .map((t) => {
      const data = t.data ?? '0x'
      const dataLen = (data.length - 2) / 2
      return solidityPacked(
        ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
        [CALL, getAddress(t.to), BigInt(t.value ?? 0), BigInt(dataLen), data],
      ).slice(2)
    })
    .join('')
  const data = multiSendIface.encodeFunctionData('multiSend', ['0x' + packed])
  return { to: getAddress(multiSendCallOnly), value: 0n, data, operation: DELEGATECALL }
}

/**
 * Build the ordered argument array for `Safe.execTransaction(...)`.
 * @param {object} safeTx result of buildSafeTx
 * @param {string} signatures pre-validated bundle
 */
export function encodeExecTransaction(safeTx, signatures) {
  return [
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.operation,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    signatures,
  ]
}

// --- Governance builders: ordinary Safe transactions targeting the Safe itself (to = safeAddress) ---

export function buildAddOwner(safeAddress, newOwner, newThreshold, nonce) {
  const data = safeIface.encodeFunctionData('addOwnerWithThreshold', [getAddress(newOwner), BigInt(newThreshold)])
  return buildSafeTx({ to: safeAddress, data, nonce })
}

/** prevOwner is the owner pointing to `owner` in the Safe's linked list (SENTINEL 0x…1 if `owner` is first). */
export function buildRemoveOwner(safeAddress, prevOwner, owner, newThreshold, nonce) {
  const data = safeIface.encodeFunctionData('removeOwner', [
    getAddress(prevOwner),
    getAddress(owner),
    BigInt(newThreshold),
  ])
  return buildSafeTx({ to: safeAddress, data, nonce })
}

export function buildSwapOwner(safeAddress, prevOwner, oldOwner, newOwner, nonce) {
  const data = safeIface.encodeFunctionData('swapOwner', [
    getAddress(prevOwner),
    getAddress(oldOwner),
    getAddress(newOwner),
  ])
  return buildSafeTx({ to: safeAddress, data, nonce })
}

export function buildChangeThreshold(safeAddress, newThreshold, nonce) {
  const data = safeIface.encodeFunctionData('changeThreshold', [BigInt(newThreshold)])
  return buildSafeTx({ to: safeAddress, data, nonce })
}

/** Sentinel owner used as the head of the Safe owners linked list. */
export const SENTINEL_OWNERS = '0x0000000000000000000000000000000000000001'

/** Given the current owners array and a target, return the prevOwner argument for removeOwner/swapOwner. */
export function prevOwnerOf(owners, target) {
  const list = owners.map((o) => getAddress(o))
  const t = getAddress(target)
  const idx = list.indexOf(t)
  if (idx === -1) throw new Error(`prevOwnerOf: ${target} is not an owner`)
  return idx === 0 ? SENTINEL_OWNERS : list[idx - 1]
}
