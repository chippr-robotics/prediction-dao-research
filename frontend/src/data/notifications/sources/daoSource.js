/**
 * ClearPath DAO governance activity source (spec 031, FR-027). For every DAO registered in the
 * ExternalDAORegistry on the active network, it discovers proposals via the bounded subgraph-less indexer and turns OZ
 * Governor state changes into feed entries: voting-open / ready-to-queue / ready-to-execute / finalized. Pure
 * snapshot-diff (first-sight = baseline). Action-needed is recomputed live and degrades honestly when a
 * Governor omits the eligibility views. No hooks — runs in the engine; reads via a read-only provider.
 */
import { ethers } from 'ethers'
import { getProvider } from '../../../utils/blockchainService'
import { getContractAddressForChain } from '../../../config/contracts'
import { EXTERNAL_DAO_REGISTRY_ABI, GOVERNOR_READ_ABI } from '../../../abis/externalDAORegistry'
import { fetchGovernorProposals } from '../../../components/clearpath/governorConnector'
import { pruneSnapshotMap } from '../activityStore'

const STATE = { Pending: 0, Active: 1, Canceled: 2, Defeated: 3, Succeeded: 4, Queued: 5, Expired: 6, Executed: 7 }
const TERMINAL = new Set([STATE.Canceled, STATE.Defeated, STATE.Expired, STATE.Executed])

function eventFor(state) {
  if (state === STATE.Active) return { type: 'voting-open', severity: 'info', actionable: true }
  if (state === STATE.Succeeded) return { type: 'ready-to-queue', severity: 'info', actionable: true }
  // Queued: OZ keeps state==Queued for the whole timelock delay, so the ENTRY only notes it was queued; the
  // ETA-gated "execute" action (deriveAction) is what truthfully signals executability.
  if (state === STATE.Queued) return { type: 'queued', severity: 'info', actionable: false }
  if (state === STATE.Executed) return { type: 'finalized', severity: 'success', actionable: false }
  if (TERMINAL.has(state)) return { type: 'finalized', severity: 'info', actionable: false }
  return null // Pending — not yet notify-worthy
}

function title(p) {
  const d = (p.description || '').split('\n')[0].replace(/^#\s*/, '').trim()
  return d ? d.slice(0, 60) : `Proposal ${String(p.id).slice(0, 10)}`
}

function makeEntry(refId, dao, p, ev, nowMs) {
  const t = title(p)
  const msg =
    ev.type === 'voting-open' ? `DAO proposal open for voting: ${t}`
    : ev.type === 'ready-to-queue' ? `DAO proposal ready to queue: ${t}`
    : ev.type === 'queued' ? `DAO proposal queued (executable after its timelock): ${t}`
    : `DAO proposal finalized: ${t}`
  return {
    id: `dao:${refId}:${ev.type}`,
    domain: 'dao',
    refId,
    type: ev.type,
    message: msg,
    severity: ev.severity,
    actionable: ev.actionable,
    link: { to: '/wallet', state: { tab: 'clearpath', dao } },
    createdAt: nowMs,
    read: false,
  }
}

/** Live action-needed for a proposal — honest degrade (null) when eligibility can't be confirmed. */
async function deriveAction(gov, p, state, account, nowMs) {
  if (state === STATE.Succeeded) return 'queue'
  if (state === STATE.Queued) {
    // Only claim executable when the timelock ETA is read AND has elapsed — never assert executability we
    // cannot confirm (a missing/reverting proposalEta degrades to no action, like the Active branch).
    try {
      const eta = Number(await gov.proposalEta(p.id))
      return eta > 0 && eta * 1000 <= nowMs ? 'execute' : null
    } catch {
      return null
    }
  }
  if (state === STATE.Active) {
    try {
      if (await gov.hasVoted(p.id, account)) return null
      const snap = await gov.proposalSnapshot(p.id)
      const votes = await gov.getVotes(account, snap)
      return BigInt(votes) > 0n ? 'vote' : null
    } catch {
      return null // Governor omits hasVoted/getVotes — do not fake eligibility
    }
  }
  return null
}

export const daoSource = {
  key: 'dao',
  label: 'DAO',
  async detect({ account, chainId, nowMs, prior }) {
    const registryAddr = getContractAddressForChain('externalDAORegistry', chainId)
    if (!registryAddr || !ethers.isAddress(registryAddr)) {
      // ClearPath not deployed on this network — nothing to track (not a failure).
      return { ok: true, entries: [], nextSnapshots: {}, currentIds: [], actionNeededById: {} }
    }
    let provider
    try {
      provider = getProvider(chainId)
    } catch {
      return { ok: false }
    }

    let daoAddrs = []
    try {
      const reg = new ethers.Contract(registryAddr, EXTERNAL_DAO_REGISTRY_ABI, provider)
      const n = Number(await reg.externalCount())
      for (let id = n; id >= 1; id -= 1) {
        const info = await reg.getExternalDAO(id)
        daoAddrs.push(info[0] || info.dao)
      }
    } catch {
      return { ok: false } // can't read the registry — retain prior slice
    }

    const acct = String(account).toLowerCase()
    const entries = []
    const nextSnapshots = { ...(prior.snapshots || {}) }
    const currentIds = []
    const actionNeededById = {}
    let partial = false

    for (const dao of daoAddrs) {
      let res
      try {
        res = await fetchGovernorProposals(provider, dao)
      } catch {
        res = { ok: false, proposals: [] }
      }
      if (!res.ok) { partial = true; continue } // keep prior proposals for this DAO (carry-forward)
      if (res.partial) partial = true
      const gov = new ethers.Contract(dao, GOVERNOR_READ_ABI, provider)
      for (const p of res.proposals || []) {
        const refId = `${String(dao).toLowerCase()}#${p.id}`
        // The indexer sets state:null when the per-proposal state() read reverts. NEVER coerce that to 0
        // (Pending) — it would store a wrong baseline and emit a spurious transition on recovery. Skip this
        // proposal this cycle (its prior snapshot carries forward via {...prior.snapshots}) and mark partial.
        if (p.state == null) { partial = true; continue }
        currentIds.push(refId)
        const state = Number(p.state)
        const prev = prior.snapshots?.[refId]
        nextSnapshots[refId] = { dao, proposalId: String(p.id), state, snappedAt: nowMs }
        const ev = eventFor(state)
        if (prev && prev.state !== state && ev) entries.push(makeEntry(refId, dao, p, ev, nowMs))
        actionNeededById[refId] = await deriveAction(gov, p, state, acct, nowMs)
      }
    }

    const pruned = pruneSnapshotMap(nextSnapshots, currentIds, nowMs, (s) => TERMINAL.has(s?.state))
    return { ok: true, entries, nextSnapshots: pruned, currentIds, actionNeededById, partial }
  },
}

export default daoSource
