/**
 * Custody activity source (spec 043, US6 / spec 031). Snapshot-diffs each vault the member belongs to on the
 * active network: a pending proposal that needs the member's approval (action: approve), a proposal newly
 * executed, and an owners/threshold governance change. Pure snapshot-diff (first-sight = baseline). No hooks;
 * read-only provider. No-ops until the SafeProposalHub is deployed + its block recorded (never scans genesis).
 *
 * Spec 049 (FR-016): the SafePolicyGuard's rule events (RulesConfigured, CooldownSet, AllowlistEnabled,
 * AllowlistChanged) join the same snapshot-diff — a per-vault event count is snapped, and any increase emits a
 * "policy-changed" entry in the custody domain. No-ops until the guard is deployed + its block recorded.
 */
import { ethers } from 'ethers'
import { getProvider } from '../../../utils/blockchainService'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../../../config/contracts'
import { getSafeContracts } from '../../../config/safeContracts'
import { loadVaultReferences } from '../../../lib/custody/vaultReferences'
import { readVaultProposalState } from '../../../lib/custody/vaultProposalReads'
import { readPolicyEventCount } from '../../../lib/custody/policyEvents'
import { STATUS } from '../../../lib/custody/proposalStatus'

const EMPTY = { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }

export const custodySource = {
  key: 'custody',
  label: 'Custody',
  async detect({ account, chainId, nowMs, prior }) {
    if (!account || !getSafeContracts(chainId)) return EMPTY
    const hubAddress = getContractAddressForChain('safeProposalHub', chainId)
    const fromBlock = getDeploymentBlockForChain('safeProposalHub', chainId)
    // Until the hub is deployed + its block recorded, there is nothing to read (and we never scan genesis).
    if (!hubAddress || !ethers.isAddress(hubAddress) || !fromBlock) return EMPTY

    const refs = loadVaultReferences(account).filter((r) => r.chainId === Number(chainId))
    if (refs.length === 0) return EMPTY

    // Spec 049 — policy engine coordinates (optional; policy diffing no-ops when absent).
    const guardAddress = getContractAddressForChain('safePolicyGuard', chainId)
    const guardFromBlock = getDeploymentBlockForChain('safePolicyGuard', chainId)
    const policyEnabled = !!guardAddress && ethers.isAddress(guardAddress) && !!guardFromBlock

    let provider
    try {
      provider = getProvider(chainId)
    } catch {
      return { ok: false }
    }

    const entries = []
    const currentIds = []
    const actionNeededById = {}
    const nextSnapshots = { ...(prior.snapshots || {}) }
    const accountLc = String(account).toLowerCase()
    let anyOk = false

    const mk = (vaultAddr, type, message, severity, actionable) => ({
      id: `custody:${vaultAddr}:${type}:${nowMs}`,
      domain: 'custody',
      refId: vaultAddr,
      type,
      message,
      severity,
      actionable,
      link: { to: '/wallet', state: { tab: 'custody', vault: vaultAddr } },
      createdAt: nowMs,
      read: false,
    })

    for (const ref of refs) {
      const vaultAddr = ref.address
      const sid = `custody:${vaultAddr}`
      currentIds.push(sid)
      let state
      try {
        state = await readVaultProposalState({ safeAddress: vaultAddr, hubAddress, chainId, provider, fromBlock })
        anyOk = true
      } catch {
        // Can't read this vault — keep its prior snapshot so we don't lose the baseline.
        if (prior.snapshots?.[sid]) nextSnapshots[sid] = prior.snapshots[sid]
        continue
      }

      const isOwner = state.owners.some((o) => o.toLowerCase() === accountLc)
      // Pending proposals that still need THIS member's approval.
      const needMe = state.proposals
        .filter((p) => p.status === STATUS.PENDING && isOwner && !p.approvers.some((a) => a.toLowerCase() === accountLc))
        .map((p) => String(p.safeTxHash).toLowerCase())
        .sort()
      const executedCount = state.proposals.filter((p) => p.status === STATUS.EXECUTED).length
      const label = ref.label || 'vault'
      const govKey = `${state.owners.length}:${state.threshold}`

      const prev = prior.snapshots?.[sid]

      // Spec 049 (FR-016) — count the guard's rule events for this vault; on failure keep the
      // prior count so the baseline survives a flaky read (no false "changed" later).
      let policyEventCount = prev?.policyEventCount
      if (policyEnabled) {
        try {
          policyEventCount = await readPolicyEventCount({
            guardAddress,
            safeAddress: vaultAddr,
            provider,
            fromBlock: guardFromBlock,
          })
        } catch {
          // keep prior count
        }
      }

      nextSnapshots[sid] = { needMe, executedCount, govKey, policyEventCount, snappedAt: nowMs }

      if (needMe.length > 0) actionNeededById[sid] = 'approve'

      if (prev) {
        const prevNeed = new Set(prev.needMe || [])
        if (needMe.some((h) => !prevNeed.has(h))) {
          entries.push(mk(vaultAddr, 'approval-needed', `A transaction on “${label}” needs your approval`, 'warning', true))
        }
        if (executedCount > (prev.executedCount || 0)) {
          entries.push(mk(vaultAddr, 'executed', `A transaction on “${label}” was executed`, 'success', false))
        }
        if (prev.govKey && prev.govKey !== govKey) {
          entries.push(mk(vaultAddr, 'governance-changed', `The owners or threshold on “${label}” changed`, 'info', false))
        }
        if (
          policyEventCount != null &&
          prev.policyEventCount != null &&
          policyEventCount > prev.policyEventCount
        ) {
          entries.push(mk(vaultAddr, 'policy-changed', `The policy rules on “${label}” changed`, 'info', false))
        }
      }
    }

    // If every vault read failed, report not-ok so the engine retains the prior slice.
    if (!anyOk && refs.length > 0) return { ok: false }
    return { ok: true, entries, nextSnapshots, currentIds, actionNeededById }
  },
}

export default custodySource
