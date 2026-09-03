// Spec 102 (D5, US3) — a vault's proposal queue on EVERY network it lives on. `useVaultProposals`
// reads one instance, and only while the wallet is on that instance's chain; this hook reads each
// instance of a VaultGroup through a provider for ITS chain, so the member's pending work is not a
// function of which network their wallet happens to be on.
//
// Every chain resolves to exactly one state — `read` / `unreadable` / `not-configured` /
// `not-supported` (plus `loading` in flight) — and rows exist ONLY for `read`. Constitution III:
// a chain that could not be read is named, never rendered as "none pending". Failures are
// isolated per chain (one dead RPC degrades one entry) and each chain carries its own request-id
// guard, so a slow read on Base can never overwrite a fresh one on Polygon, or leak into another
// vault after the sheet moved on.
//
// The enrichment (owners / threshold / nonce / approvedHashes → deriveProposalStatus) mirrors
// `useVaultProposals.refresh` exactly; the two must stay in step or the same proposal would show
// two statuses depending on which surface the member opened.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Contract, getAddress } from 'ethers'
import { useWallet } from '.'
import { SAFE_ABI } from '../abis/Safe'
import { NETWORKS } from '../config/networks'
import { getContractAddressForChain, getDeploymentBlockForChain } from '../config/contracts'
import { getProvider } from '../utils/blockchainService'
import { readVerifiedProposals } from '../lib/custody/proposalHub'
import { readExecutionOutcomes } from '../lib/custody/vaultProposalReads'

/** Ceiling on one chain's read. Exported for tests; a member-facing surface waits this long at most. */
export const QUEUE_READ_TIMEOUT_MS = 20_000

function withReadTimeout(promise, chainId, ms = QUEUE_READ_TIMEOUT_MS) {
  let timer
  const ceiling = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Chain ${chainId} did not answer within ${Math.round(ms / 1000)}s`)), ms)
  })
  return Promise.race([promise, ceiling]).finally(() => clearTimeout(timer))
}
import { deriveProposalStatus, isQueued } from '../lib/custody/proposalStatus'

const EMPTY = Object.freeze({})

/**
 * @param {object|null} group a VaultGroup from `useCustodyVaults().groups` (or anything with `key` + `instances`)
 * @returns {{ byChain: object, rows: object[], pending: number, missing: number[], partial: boolean, loading: boolean, refresh: (chainId?: number) => Promise<void> }}
 */
export function useVaultQueueAcrossChains(group) {
  const { address, chainId: walletChainId, provider: walletProvider } = useWallet()
  const [byChain, setByChain] = useState(EMPTY)
  // Per-(vault, chain) request ids: `${key}:${chainId}` → latest request number.
  const reqIds = useRef({})
  // The group the reads belong to. A commit for another vault's chain is dropped, not merged.
  const groupKeyRef = useRef(null)
  // Latest instances, so `refresh(chainId)` from a callback reads the CURRENT instance.
  const instancesRef = useRef([])

  const key = group?.key || null
  // Safe instances only: an EOA / unreachable instance has no queue to read and is reported by the
  // list (unreachable / unreadable), not here.
  const instances = useMemo(
    () => (group?.instances || []).filter((i) => i?.isSafe === true && i.chainId != null),
    [group],
  )
  // Declared BEFORE the read effect below: effects run in order, so it sees the current set.
  useEffect(() => {
    instancesRef.current = instances
  }, [instances])
  const chainKey = instances.map((i) => Number(i.chainId)).join(',')

  const readChain = useCallback(
    async (inst) => {
      const cid = Number(inst.chainId)
      const slot = `${key}:${cid}`
      const myReq = (reqIds.current[slot] = (reqIds.current[slot] || 0) + 1)
      const commit = (patch) => {
        if (reqIds.current[slot] !== myReq || groupKeyRef.current !== key) return
        setByChain((prev) => ({ ...prev, [cid]: { chainId: cid, proposals: [], partial: false, owner: false, ...patch } }))
      }

      // Strict lookup: a chain this build does not know is stated as such, never relabelled as the
      // default network by `getNetwork()`.
      if (!NETWORKS[cid]) return commit({ state: 'not-supported' })
      const hubAddress = getContractAddressForChain('safeProposalHub', cid)
      // Never scan from genesis (contracts.js guidance): a hub with no recorded deploy block means
      // proposal discovery is honestly "not configured", not "nothing pending".
      const fromBlock = getDeploymentBlockForChain('safeProposalHub', cid)
      if (!hubAddress || !fromBlock) return commit({ state: 'not-configured' })

      commit({ state: 'loading' })
      try {
        // The wallet's own provider when it is already on this chain; the chain's read provider otherwise.
        const reader = Number(walletChainId) === cid && walletProvider ? walletProvider : getProvider(cid)
        const safe = new Contract(inst.address, SAFE_ABI, reader)
        // A chain whose endpoint never answers must resolve to `unreadable`, not sit on
        // "reading…" for the life of the sheet: ethers keeps retrying network detection on a dead
        // endpoint, so without a ceiling the member never learns that this network was not read.
        const [ownersRaw, thresholdRaw, nonceRaw] = await withReadTimeout(
          Promise.all([safe.getOwners(), safe.getThreshold(), safe.nonce()]),
          cid,
        )
        const owners = ownersRaw.map((o) => getAddress(o))
        const threshold = Number(thresholdRaw)
        const currentNonce = Number(nonceRaw)

        const { proposals: verified, complete: hubComplete } = await withReadTimeout(
          readVerifiedProposals({
            hubAddress,
            safeAddress: inst.address,
            chainId: cid,
            provider: reader,
            fromBlock,
          }),
          cid,
        )
        const { executed, failed, complete: execComplete } = await withReadTimeout(
          readExecutionOutcomes({ safe, chainId: cid, fromBlock }),
          cid,
        )

        const proposals = await Promise.all(
          verified.map(async (p) => {
            const hashLc = String(p.safeTxHash).toLowerCase()
            const flags = await Promise.all(
              owners.map((o) => safe.approvedHashes(o, p.safeTxHash).then((n) => (n > 0n ? o : null))),
            )
            const approvers = flags.filter(Boolean)
            const status = deriveProposalStatus({
              approvals: approvers.length,
              threshold,
              currentNonce,
              proposalNonce: Number(p.nonce),
              executed: executed.has(hashLc),
              failed: failed.has(hashLc),
              cancelled: p.cancelled,
            })
            // Tagged with its chain: the network is a property of the transaction (spec 102).
            return { ...p, chainId: cid, approvers, approvals: approvers.length, threshold, status }
          }),
        )

        const me = address ? String(address).toLowerCase() : null
        commit({
          state: 'read',
          proposals,
          // An unfinished backfill is disclosed, never presented as the whole queue.
          partial: !(hubComplete && execComplete),
          owner: me != null && owners.some((o) => o.toLowerCase() === me),
          owners,
          threshold,
          nonce: currentNonce,
        })
      } catch (e) {
        commit({ state: 'unreadable', error: e?.message || 'Failed to read proposals' })
      }
    },
    [key, address, walletChainId, walletProvider],
  )

  /** Re-read one chain (after an action there) or every chain. */
  const refresh = useCallback(
    async (chainId) => {
      const targets =
        chainId == null
          ? instancesRef.current
          : instancesRef.current.filter((i) => Number(i.chainId) === Number(chainId))
      await Promise.all(targets.map((i) => readChain(i)))
    },
    [readChain],
  )

  // A new vault (or a changed instance set / wallet) starts the reads over. Entries for chains the
  // group no longer has are dropped rather than left as stale facts about another vault.
  useEffect(() => {
    groupKeyRef.current = key
    setByChain(EMPTY)
    if (!key || instancesRef.current.length === 0) return
    refresh()
    // chainKey stands in for the instance set: instance objects change identity on every list refresh.
  }, [key, chainKey, refresh])

  const rows = useMemo(() => {
    const out = []
    for (const entry of Object.values(byChain)) {
      if (entry.state !== 'read') continue
      for (const p of entry.proposals) if (isQueued(p.status)) out.push(p)
    }
    return out.sort((a, b) => Number(b.blockNumber ?? 0) - Number(a.blockNumber ?? 0))
  }, [byChain])

  const entries = Object.values(byChain)
  const missing = entries.filter((e) => e.state !== 'read' && e.state !== 'loading').map((e) => e.chainId)
  const loading = entries.some((e) => e.state === 'loading')
  const partial = missing.length > 0 || entries.some((e) => e.state === 'read' && e.partial)

  return { byChain, rows, pending: rows.length, missing, partial, loading, refresh }
}

export default useVaultQueueAcrossChains
