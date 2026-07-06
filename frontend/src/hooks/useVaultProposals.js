// Spec 043 (US2) — a vault's pending queue + history, built entirely from on-chain + hub state, plus the
// propose/approve/execute actions. Honest state: approvals and execution come from the Safe itself; the hub
// only supplies (verified) preimages. Guards: execute only when ready and nonce-current; approvals counted
// once per owner on-chain (idempotent); non-owners get read-only.

import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract, getAddress } from 'ethers'
import { useWallet } from '.'
import { SAFE_ABI } from '../abis/Safe'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../config/contracts'
import {
  buildSafeTx,
  computeSafeTxHash,
  buildPrevalidatedSignatures,
  encodeExecTransaction,
} from '../lib/custody/vaultTransaction'
import { emitProposal, cancelProposal, readVerifiedProposals } from '../lib/custody/proposalHub'
import { deriveProposalStatus, isQueued, STATUS } from '../lib/custody/proposalStatus'

export function useVaultProposals(vault) {
  const { chainId, signer, provider } = useWallet()
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqId = useRef(0)

  const vaultAddress = vault?.isSafe ? vault.address : null
  const hubAddress = getContractAddressForChain('safeProposalHub', chainId)

  const refresh = useCallback(async () => {
    // Bump first so any in-flight request is invalidated even on the early-return path.
    const myReq = ++reqId.current
    if (!vaultAddress || !hubAddress || !provider) {
      setProposals([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Never scan from genesis (contracts.js guidance): require a recorded hub deploy block.
      const fromBlock = getDeploymentBlockForChain('safeProposalHub', chainId)
      if (!fromBlock) {
        if (myReq === reqId.current) {
          setProposals([])
          setError('Custody proposal history is not configured for this network yet.')
        }
        return
      }
      const safe = new Contract(vaultAddress, SAFE_ABI, provider)
      const [owners, threshold, currentNonce] = await Promise.all([
        safe.getOwners(),
        safe.getThreshold(),
        safe.nonce(),
      ])
      const { proposals: verified } = await readVerifiedProposals({
        hubAddress,
        safeAddress: vaultAddress,
        chainId,
        provider,
        fromBlock,
      })

      // Execution outcomes from the Safe itself.
      const [successes, failures] = await Promise.all([
        safe.queryFilter(safe.filters.ExecutionSuccess(), fromBlock),
        safe.queryFilter(safe.filters.ExecutionFailure(), fromBlock),
      ])
      const executedHashes = new Set(successes.map((l) => String(l.args.txHash).toLowerCase()))
      const failedHashes = new Set(failures.map((l) => String(l.args.txHash).toLowerCase()))

      // Approvals per proposal (one on-chain read per owner per proposal).
      const enriched = await Promise.all(
        verified.map(async (p) => {
          const hashLc = String(p.safeTxHash).toLowerCase()
          const approvalFlags = await Promise.all(
            owners.map((o) => safe.approvedHashes(o, p.safeTxHash).then((n) => (n > 0n ? getAddress(o) : null))),
          )
          const approvers = approvalFlags.filter(Boolean)
          const status = deriveProposalStatus({
            approvals: approvers.length,
            threshold: Number(threshold),
            currentNonce: Number(currentNonce),
            proposalNonce: Number(p.nonce),
            executed: executedHashes.has(hashLc),
            failed: failedHashes.has(hashLc),
            cancelled: p.cancelled,
          })
          return { ...p, approvers, approvals: approvers.length, threshold: Number(threshold), status }
        }),
      )
      if (myReq === reqId.current) setProposals(enriched)
    } catch (e) {
      if (myReq === reqId.current) setError(e?.message || 'Failed to read proposals')
    } finally {
      if (myReq === reqId.current) setLoading(false)
    }
  }, [vaultAddress, hubAddress, provider, chainId])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Propose a transaction: build the SafeTx at the current nonce, broadcast it, and record the proposer's
   *  first approval on-chain. */
  const propose = useCallback(
    async ({ to, value = 0n, data = '0x', operation = 0 }) => {
      if (!signer) throw new Error('Connect a wallet to propose')
      if (!hubAddress) throw new Error('Custody proposals are not configured on this network')
      const safe = new Contract(vaultAddress, SAFE_ABI, signer)
      const nonce = await safe.nonce()
      const safeTx = buildSafeTx({ to, value, data, operation, nonce })
      const safeTxHash = computeSafeTxHash(vaultAddress, chainId, safeTx)
      await emitProposal({ hubAddress, safe: vaultAddress, safeTx, safeTxHash, signer })
      const approveTx = await safe.approveHash(safeTxHash)
      await approveTx.wait()
      await refresh()
      return { safeTxHash }
    },
    [signer, vaultAddress, hubAddress, chainId, refresh],
  )

  /** Record the connected owner's approval for a proposal (idempotent on-chain). */
  const approve = useCallback(
    async (safeTxHash) => {
      if (!signer) throw new Error('Connect a wallet to approve')
      const safe = new Contract(vaultAddress, SAFE_ABI, signer)
      const tx = await safe.approveHash(safeTxHash)
      await tx.wait()
      await refresh()
    },
    [signer, vaultAddress, refresh],
  )

  /** Execute a proposal that has reached threshold, using pre-validated (on-chain approval) signatures. */
  const execute = useCallback(
    async (proposal) => {
      if (!signer) throw new Error('Connect a wallet to execute')
      if (proposal.status !== STATUS.READY) throw new Error('Proposal is not ready to execute')
      const safe = new Contract(vaultAddress, SAFE_ABI, signer)
      const signatures = buildPrevalidatedSignatures(proposal.approvers)
      const args = encodeExecTransaction(proposal.safeTx, signatures)
      const tx = await safe.execTransaction(...args)
      const receipt = await tx.wait()
      await refresh()
      return { txHash: receipt.hash }
    },
    [signer, vaultAddress, refresh],
  )

  const cancel = useCallback(
    async (safeTxHash) => {
      if (!signer) throw new Error('Connect a wallet to cancel')
      if (!hubAddress) throw new Error('Custody proposals are not configured on this network')
      await cancelProposal({ hubAddress, safe: vaultAddress, safeTxHash, signer })
      await refresh()
    },
    [signer, hubAddress, vaultAddress, refresh],
  )

  const queue = proposals.filter((p) => isQueued(p.status))
  const history = proposals.filter((p) => !isQueued(p.status))

  return { proposals, queue, history, loading, error, refresh, propose, approve, execute, cancel }
}

export default useVaultProposals
