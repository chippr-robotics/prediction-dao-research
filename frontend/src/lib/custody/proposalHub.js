// Spec 043 (US2) — SafeProposalHub client: broadcast a proposal preimage, read+verify proposals from chain,
// and the never-stranded EIP-712 payload link/QR fallback. SECURITY: a proposal's integrity is never trusted
// from the hub — every read proposal is reconstructed and its safeTxHash recomputed locally (verifyProposal);
// a mismatch is discarded. See research.md Decision 4.

import { Contract, Interface, getAddress, toBeHex } from 'ethers'
import { SAFE_PROPOSAL_HUB_ABI } from '../../abis/SafeProposalHub'
import { buildSafeTx, computeSafeTxHash } from './vaultTransaction'

const hubIface = new Interface(SAFE_PROPOSAL_HUB_ABI)

/** Broadcast a proposal's preimage to the hub. */
export async function emitProposal({ hubAddress, safe, safeTx, safeTxHash, signer }) {
  const hub = new Contract(getAddress(hubAddress), SAFE_PROPOSAL_HUB_ABI, signer)
  return hub.propose(
    getAddress(safe),
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.operation,
    safeTx.nonce,
    safeTxHash,
  )
}

/** Signal cancellation of a proposal (advisory). */
export async function cancelProposal({ hubAddress, safe, safeTxHash, signer }) {
  const hub = new Contract(getAddress(hubAddress), SAFE_PROPOSAL_HUB_ABI, signer)
  return hub.cancel(getAddress(safe), safeTxHash)
}

/** Reconstruct a full SafeTx + metadata from decoded `Proposed` event args. Pure. */
export function reconstructProposal(args) {
  const safeTx = buildSafeTx({
    to: args.to,
    value: args.value,
    data: args.data,
    operation: Number(args.operation),
    nonce: args.nonce,
  })
  return {
    safe: getAddress(args.safe),
    proposer: getAddress(args.proposer),
    safeTxHash: args.safeTxHash,
    safeTx,
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    operation: safeTx.operation,
    nonce: safeTx.nonce,
  }
}

/**
 * Verify a reconstructed proposal: recompute the Safe tx hash from its own parameters and compare to the
 * emitted safeTxHash. Returns true only when they match (tampered/malformed preimages are rejected). Pure.
 */
export function verifyProposal(proposal, chainId) {
  const recomputed = computeSafeTxHash(proposal.safe, chainId, proposal.safeTx)
  return recomputed.toLowerCase() === String(proposal.safeTxHash).toLowerCase()
}

/**
 * Read all VERIFIED proposals for a vault from the hub. Decodes `Proposed` logs, reconstructs each, and keeps
 * only those whose recomputed hash matches. Also returns the set of cancelled hashes.
 * @returns {Promise<{proposals: object[], cancelled: Set<string>}>}
 */
export async function readVerifiedProposals({ hubAddress, safeAddress, chainId, provider, fromBlock = 0 }) {
  const hub = new Contract(getAddress(hubAddress), SAFE_PROPOSAL_HUB_ABI, provider)
  const safeTopic = getAddress(safeAddress)
  const proposedLogs = await hub.queryFilter(hub.filters.Proposed(safeTopic), fromBlock)
  const cancelledLogs = await hub.queryFilter(hub.filters.Cancelled(safeTopic), fromBlock)

  const cancelled = new Set(cancelledLogs.map((l) => String(l.args.safeTxHash).toLowerCase()))
  const proposals = []
  for (const log of proposedLogs) {
    try {
      const p = reconstructProposal(log.args)
      if (verifyProposal(p, chainId)) {
        proposals.push({ ...p, blockNumber: log.blockNumber, cancelled: cancelled.has(String(p.safeTxHash).toLowerCase()) })
      }
    } catch {
      /* malformed log — skip */
    }
  }
  return { proposals, cancelled }
}

// --- Never-stranded fallback: shareable EIP-712 payload link/QR (no hub required) ---

const PAYLOAD_SCHEMA = 'fairwins-safe-proposal-v1'

/** Serialize a proposal into a compact, shareable payload string (base64url of JSON). Pure. */
export function encodePayloadLink(safe, safeTx, chainId) {
  const payload = {
    schema: PAYLOAD_SCHEMA,
    chainId: Number(chainId),
    safe: getAddress(safe),
    tx: {
      to: safeTx.to,
      value: toBeHex(safeTx.value),
      data: safeTx.data,
      operation: safeTx.operation,
      nonce: toBeHex(safeTx.nonce),
    },
  }
  return base64UrlEncode(JSON.stringify(payload))
}

/**
 * Parse a payload string back into { safe, safeTx, chainId }. The caller MUST recompute the hash and verify
 * before acting — this function does not establish trust, only transport. Pure.
 */
export function parsePayloadLink(link) {
  const obj = JSON.parse(base64UrlDecode(String(link)))
  if (obj?.schema !== PAYLOAD_SCHEMA) throw new Error('Unrecognized proposal payload')
  const safeTx = buildSafeTx({
    to: obj.tx.to,
    value: BigInt(obj.tx.value),
    data: obj.tx.data,
    operation: Number(obj.tx.operation),
    nonce: BigInt(obj.tx.nonce),
  })
  return { safe: getAddress(obj.safe), chainId: Number(obj.chainId), safeTx }
}

function base64UrlEncode(str) {
  // btoa/atob are present in browsers and in the jsdom test environment.
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4
  if (pad) b64 += '='.repeat(4 - pad) // some atob implementations require '=' padding
  return atob(b64)
}

export { hubIface }
