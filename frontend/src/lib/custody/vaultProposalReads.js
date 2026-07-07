// Spec 043 — shared, pure read of a vault's proposal state from chain + hub, used by both useVaultProposals
// (US2) and custodySource (US6). Reads owners/threshold/nonce, the verified hub proposals, per-owner
// approvals, and execution outcomes, then derives each proposal's status. Read-only; no React.

import { Contract, getAddress } from 'ethers'
import { SAFE_ABI } from '../../abis/Safe'
import { readVerifiedProposals } from './proposalHub'
import { deriveProposalStatus } from './proposalStatus'

/**
 * @returns {Promise<{owners:string[], threshold:number, nonce:number, proposals:object[]}>}
 */
export async function readVaultProposalState({ safeAddress, hubAddress, chainId, provider, fromBlock }) {
  const safe = new Contract(safeAddress, SAFE_ABI, provider)
  const [ownersRaw, thresholdRaw, nonceRaw] = await Promise.all([
    safe.getOwners(),
    safe.getThreshold(),
    safe.nonce(),
  ])
  const owners = ownersRaw.map((o) => getAddress(o))
  const threshold = Number(thresholdRaw)
  const currentNonce = Number(nonceRaw)

  const { proposals: verified } = await readVerifiedProposals({
    hubAddress,
    safeAddress,
    chainId,
    provider,
    fromBlock,
  })

  const [successes, failures] = await Promise.all([
    safe.queryFilter(safe.filters.ExecutionSuccess(), fromBlock),
    safe.queryFilter(safe.filters.ExecutionFailure(), fromBlock),
  ])
  const executed = new Set(successes.map((l) => String(l.args.txHash).toLowerCase()))
  const failed = new Set(failures.map((l) => String(l.args.txHash).toLowerCase()))

  const proposals = await Promise.all(
    verified.map(async (p) => {
      const hashLc = String(p.safeTxHash).toLowerCase()
      const approvalFlags = await Promise.all(
        owners.map((o) => safe.approvedHashes(o, p.safeTxHash).then((n) => (n > 0n ? o : null))),
      )
      const approvers = approvalFlags.filter(Boolean)
      const status = deriveProposalStatus({
        approvals: approvers.length,
        threshold,
        currentNonce,
        proposalNonce: Number(p.nonce),
        executed: executed.has(hashLc),
        failed: failed.has(hashLc),
        cancelled: p.cancelled,
      })
      return { ...p, approvers, approvals: approvers.length, threshold, status }
    }),
  )

  return { owners, threshold, nonce: currentNonce, proposals }
}
