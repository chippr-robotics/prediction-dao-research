import { useEffect, useMemo, useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { useWeb3 } from './useWeb3'

// IOracleAdapter event signature — all 3 adapters inherit it.
const CONDITION_REGISTERED_EVENT =
  'event ConditionRegistered(bytes32 indexed conditionId, string description, uint256 expectedResolutionTime)'

// Per-adapter read fragments. The hook reads the right subset based on `kind`
// so the picker can show meaningful metadata for each oracle type without
// pulling the full ABI.
const READ_FRAGMENTS = {
  datafeed: [
    'function isConditionResolved(bytes32) view returns (bool)',
    'function getConditionMetadata(bytes32) view returns (string description, uint256 expectedResolutionTime)',
    'function conditions(bytes32) view returns (address feed, int256 threshold, uint8 op, uint64 deadline, bool registered)',
  ],
  functions: [
    'function isConditionResolved(bytes32) view returns (bool)',
    'function getConditionMetadata(bytes32) view returns (string description, uint256 expectedResolutionTime)',
  ],
  uma: [
    'function isConditionResolved(bytes32) view returns (bool)',
    'function getConditionMetadata(bytes32) view returns (string description, uint256 expectedResolutionTime)',
  ],
}

// Chainlink Data Feed comparison-op labels (mirror of the contract enum).
const COMPARISON_LABELS = ['>', '>=', '<', '<=', '==']

/**
 * useOracleConditions
 *
 * Subscribes to ConditionRegistered events on an oracle adapter and enriches
 * each row with whatever per-condition state the adapter exposes (resolved
 * status, deadline, claim text, etc). Used by OracleConditionPicker so users
 * can pick a pre-registered conditionId instead of pasting a raw bytes32.
 *
 * @param {string} adapterAddress  Adapter contract address (0x...). Hook
 *                                  returns empty + idle when this is falsy.
 * @param {'datafeed'|'functions'|'uma'} kind  Selects the extra fields read
 *                                              for each condition. Falls back
 *                                              to the IOracleAdapter view-only
 *                                              surface when the kind is unknown.
 * @param {object} options
 * @param {number} [options.fromBlock=0]  Block to start the log scan at.
 *                                         Public Amoy RPC handles full-range
 *                                         queries for sparse events, but
 *                                         callers can pin it tighter via
 *                                         DEPLOYMENT_BLOCKS for big chains.
 *
 * Returns { conditions, loading, error, refresh }:
 *   conditions: [{
 *     conditionId:           '0x…',  // bytes32 hex
 *     description:           string, // from getConditionMetadata (UMA only)
 *     expectedResolutionTime:number, // unix seconds (DataFeed=deadline, UMA=liveness, Functions=0)
 *     isResolved:            boolean,
 *     // DataFeed extras (undefined for the other kinds):
 *     feed?:      '0x…',
 *     threshold?: bigint,
 *     opLabel?:   '>' | '>=' | '<' | '<=' | '==' ,
 *     deadline?:  number,
 *   }, ...]
 */
export function useOracleConditions(adapterAddress, kind, { fromBlock = 0 } = {}) {
  const { provider } = useWeb3()
  const [conditions, setConditions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const adapterValid = useMemo(
    () => Boolean(adapterAddress && ethers.isAddress(adapterAddress)),
    [adapterAddress],
  )

  // `READ_FRAGMENTS[kind]` is keyed only by `kind`, but reading it inline
  // would create a fresh array every render (object literal identity) and
  // make the `fetchAll` useCallback identity churn → infinite useEffect loop.
  // Memoize on `kind`.
  const fragments = useMemo(
    () => READ_FRAGMENTS[kind] || READ_FRAGMENTS.functions,
    [kind],
  )

  const fetchAll = useCallback(async () => {
    if (!adapterValid || !provider) {
      setConditions([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const iface = new ethers.Interface([CONDITION_REGISTERED_EVENT])
      const contract = new ethers.Contract(adapterAddress, [CONDITION_REGISTERED_EVENT, ...fragments], provider)

      // 1. Pull every ConditionRegistered log emitted by this adapter.
      const logs = await contract.queryFilter(contract.filters.ConditionRegistered(), fromBlock, 'latest')

      // 2. Dedupe in case the admin re-emitted (shouldn't happen on the live
      //    adapters but cheap insurance against future changes).
      const seen = new Set()
      const ordered = []
      for (const log of logs) {
        const parsed = iface.parseLog(log)
        const id = parsed.args.conditionId
        if (seen.has(id)) continue
        seen.add(id)
        ordered.push({ log, conditionId: id, fromEventDescription: parsed.args.description, fromEventExpected: Number(parsed.args.expectedResolutionTime) })
      }

      // 3. Per-condition enrichment in parallel. We tolerate individual
      //    failures (e.g. condition was deleted by a future contract change)
      //    so a single broken row doesn't blank the whole list.
      const enriched = await Promise.all(ordered.map(async (row) => {
        const out = {
          conditionId: row.conditionId,
          description: row.fromEventDescription || '',
          expectedResolutionTime: row.fromEventExpected,
          isResolved: false,
        }
        try {
          out.isResolved = await contract.isConditionResolved(row.conditionId)
        } catch { /* tolerate */ }
        try {
          const meta = await contract.getConditionMetadata(row.conditionId)
          // UMA stores claim text in `description`; DataFeed/Functions return '' here.
          if (meta?.description) out.description = meta.description
          // Replace event-emitted expected time with the canonical view (UMA reports liveness; DataFeed reports deadline).
          if (meta?.expectedResolutionTime) out.expectedResolutionTime = Number(meta.expectedResolutionTime)
        } catch { /* tolerate */ }

        // DataFeed-specific enrichment.
        if (kind === 'datafeed') {
          try {
            const cfg = await contract.conditions(row.conditionId)
            out.feed = cfg.feed
            out.threshold = cfg.threshold
            out.opLabel = COMPARISON_LABELS[Number(cfg.op)] || '?'
            out.deadline = Number(cfg.deadline)
          } catch { /* tolerate */ }
        }

        return out
      }))

      // 4. Stable sort: unresolved first (so users see actionable rows up top),
      //    then by expected resolution time ascending.
      enriched.sort((a, b) => {
        if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1
        return (a.expectedResolutionTime || 0) - (b.expectedResolutionTime || 0)
      })

      setConditions(enriched)
    } catch (e) {
      setError(e?.shortMessage || e?.message || String(e))
      setConditions([])
    } finally {
      setLoading(false)
    }
  }, [adapterAddress, adapterValid, provider, fragments, kind, fromBlock])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // Live updates: re-fetch when a new ConditionRegistered fires while the
  // picker is open. Cheap — adapters are owner-write-only and emit sparsely.
  useEffect(() => {
    if (!adapterValid || !provider) return undefined
    const contract = new ethers.Contract(adapterAddress, [CONDITION_REGISTERED_EVENT], provider)
    const onRegistered = () => fetchAll()
    contract.on('ConditionRegistered', onRegistered)
    return () => contract.off('ConditionRegistered', onRegistered)
  }, [adapterAddress, adapterValid, provider, fetchAll])

  return { conditions, loading, error, refresh: fetchAll }
}

export default useOracleConditions
