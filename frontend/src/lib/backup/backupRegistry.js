// Spec 032 — the on-chain backup locator. Reads the per-wallet pointer from the canonical-network registry
// (free, via a read-only provider — works regardless of the member's connected network) and writes it with
// the member's signer. Gracefully reports "unavailable" until the registry is deployed + address-synced.

import { ethers } from 'ethers'
import { getProvider } from '../../utils/blockchainService'
import { getContractAddressForChain } from '../../config/contracts'
import { BACKUP_POINTER_REGISTRY_ABI, BACKUP_CANONICAL_CHAIN_ID } from '../../abis/backupPointerRegistry'

export const CANONICAL_CHAIN_ID = BACKUP_CANONICAL_CHAIN_ID

function registryAddress() {
  return getContractAddressForChain('backupPointerRegistry', CANONICAL_CHAIN_ID)
}

/** Whether the backup registry is deployed + configured on the canonical network. */
export function isBackupAvailable() {
  const addr = registryAddress()
  return !!addr && ethers.isAddress(addr)
}

/**
 * Read a wallet's latest backup pointer (CID). Returns "" when there is genuinely no pointer (or the registry
 * isn't configured), and `null` when the read could not be completed (RPC unreachable) — so callers can tell
 * "no backup" apart from "couldn't check" (honest state). Free (read-only provider).
 */
export async function readPointer(owner) {
  if (!isBackupAvailable() || !owner) return ''
  try {
    const reader = getProvider(CANONICAL_CHAIN_ID)
    const c = new ethers.Contract(registryAddress(), BACKUP_POINTER_REGISTRY_ABI, reader)
    return await c.getPointer(owner)
  } catch {
    return null // inconclusive read — not the same as "no pointer"
  }
}

/** Write (or clear with "") the caller's pointer on the canonical network. Requires that network + gas. */
export async function writePointer(signer, cid) {
  if (!isBackupAvailable()) throw new Error('Backup registry is not available on the canonical network yet')
  const c = new ethers.Contract(registryAddress(), BACKUP_POINTER_REGISTRY_ABI, signer)
  const tx = await c.setPointer(cid)
  return tx.wait()
}

/**
 * Encode the `setPointer(cid)` call for passkey (smart-account) sessions, which write through `sendCalls`
 * rather than an ethers signer. Returns a `{ target, data }` call the caller batches into one ceremony.
 * `cid` "" clears the pointer, mirroring {@link writePointer}.
 */
export function buildSetPointerCall(cid) {
  if (!isBackupAvailable()) throw new Error('Backup registry is not available on the canonical network yet')
  const iface = new ethers.Interface(BACKUP_POINTER_REGISTRY_ABI)
  return { target: registryAddress(), data: iface.encodeFunctionData('setPointer', [cid]) }
}
