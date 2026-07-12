// Spec 043 (US2) — a vault's pending queue + history, built entirely from on-chain + hub state, plus the
// propose/approve/execute actions. Honest state: approvals and execution come from the Safe itself; the hub
// only supplies (verified) preimages. Guards: execute only when ready and nonce-current; approvals counted
// once per owner on-chain (idempotent); non-owners get read-only.

import { useState, useEffect, useCallback, useRef } from 'react'
import { Contract, Interface, getAddress } from 'ethers'
import { useWallet } from '.'
import { SAFE_ABI } from '../abis/Safe'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../config/contracts'
import {
  buildSafeTx,
  computeSafeTxHash,
  buildPrevalidatedSignatures,
  encodeExecTransaction,
} from '../lib/custody/vaultTransaction'
import {
  emitProposal,
  cancelProposal,
  emitProposalCall,
  cancelProposalCall,
  readVerifiedProposals,
} from '../lib/custody/proposalHub'
import { deriveProposalStatus, isQueued, STATUS } from '../lib/custody/proposalStatus'

const safeIface = new Interface(SAFE_ABI)

export function useVaultProposals(vault) {
  const { chainId, signer, provider, sendCalls, loginMethod } = useWallet()
  const isPasskey = loginMethod === 'passkey'
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reqId = useRef(0)

  const vaultAddress = vault?.isSafe ? vault.address : null
  const hubAddress = getContractAddressForChain('safeProposalHub', chainId)
  // Only read when the connected wallet is on the vault's own network — the connected chainId/provider drive
  // the reads, so a mismatched chain would query the wrong contracts. The UI gates actions on the same fact.
  const onVaultChain = vault?.chainId != null && Number(chainId) === Number(vault.chainId)

  const refresh = useCallback(async () => {
    // Bump first so any in-flight request is invalidated even on the early-return path.
    const myReq = ++reqId.current
    if (!vaultAddress || !hubAddress || !provider || !onVaultChain) {
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
  }, [vaultAddress, hubAddress, provider, chainId, onVaultChain])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Propose a transaction: build the SafeTx at the current nonce, broadcast it, and record the proposer's
   *  first approval on-chain. An explicit `nonce` may be passed to queue ordered follow-ups (spec 049
   *  attach flow: configureRules at N, setGuard at N+1 — the chain then enforces the order). */
  const propose = useCallback(
    async ({ to, value = 0n, data = '0x', operation = 0, nonce: nonceOverride }) => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to propose')
      if (!hubAddress) throw new Error('Custody proposals are not configured on this network')
      // Nonce is a read: use the signer when present, else the session read provider (passkey).
      const safe = new Contract(vaultAddress, SAFE_ABI, signer || provider)
      const nonce = nonceOverride ?? (await safe.nonce())
      const safeTx = buildSafeTx({ to, value, data, operation, nonce })
      const safeTxHash = computeSafeTxHash(vaultAddress, chainId, safeTx)
      if (isPasskey) {
        // Passkey rail: broadcast the preimage AND record the proposer's approval in ONE sponsored
        // UserOp — same two on-chain effects as the classic path, batched.
        const calls = [
          emitProposalCall({ hubAddress, safe: vaultAddress, safeTx, safeTxHash }),
          { target: vaultAddress, data: safeIface.encodeFunctionData('approveHash', [safeTxHash]), value: 0n },
        ]
        await sendCalls(calls)
      } else {
        await emitProposal({ hubAddress, safe: vaultAddress, safeTx, safeTxHash, signer })
        const approveTx = await safe.approveHash(safeTxHash)
        await approveTx.wait()
      }
      await refresh()
      return { safeTxHash, nonce: Number(nonce) }
    },
    [isPasskey, signer, sendCalls, provider, vaultAddress, hubAddress, chainId, refresh],
  )

  /** Record the connected owner's approval for a proposal (idempotent on-chain). */
  const approve = useCallback(
    async (safeTxHash) => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to approve')
      if (isPasskey) {
        await sendCalls([
          { target: vaultAddress, data: safeIface.encodeFunctionData('approveHash', [safeTxHash]), value: 0n },
        ])
      } else {
        const safe = new Contract(vaultAddress, SAFE_ABI, signer)
        const tx = await safe.approveHash(safeTxHash)
        await tx.wait()
      }
      await refresh()
    },
    [isPasskey, signer, sendCalls, vaultAddress, refresh],
  )

  /** Execute a proposal that has reached threshold, using pre-validated (on-chain approval) signatures. */
  const execute = useCallback(
    async (proposal) => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to execute')
      if (proposal.status !== STATUS.READY) throw new Error('Proposal is not ready to execute')
      const signatures = buildPrevalidatedSignatures(proposal.approvers)
      const args = encodeExecTransaction(proposal.safeTx, signatures)
      if (isPasskey) {
        const sent = await sendCalls([
          { target: vaultAddress, data: safeIface.encodeFunctionData('execTransaction', args), value: 0n },
        ])
        await refresh()
        return { txHash: sent?.txHash ?? sent?.userOpHash ?? sent?.intentId }
      }
      const safe = new Contract(vaultAddress, SAFE_ABI, signer)
      const tx = await safe.execTransaction(...args)
      const receipt = await tx.wait()
      await refresh()
      return { txHash: receipt.hash }
    },
    [isPasskey, signer, sendCalls, vaultAddress, refresh],
  )

  const cancel = useCallback(
    async (safeTxHash) => {
      if (!isPasskey && !signer) throw new Error('Connect a wallet to cancel')
      if (!hubAddress) throw new Error('Custody proposals are not configured on this network')
      if (isPasskey) {
        await sendCalls([cancelProposalCall({ hubAddress, safe: vaultAddress, safeTxHash })])
      } else {
        await cancelProposal({ hubAddress, safe: vaultAddress, safeTxHash, signer })
      }
      await refresh()
    },
    [isPasskey, signer, sendCalls, hubAddress, vaultAddress, refresh],
  )

  const queue = proposals.filter((p) => isQueued(p.status))
  const history = proposals.filter((p) => !isQueued(p.status))

  return { proposals, queue, history, loading, error, refresh, propose, approve, execute, cancel }
}

export default useVaultProposals
