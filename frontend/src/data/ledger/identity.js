/**
 * Ledger entry identity + merge precedence (spec 051, data-model.md "Identity").
 *
 * Every entry carries a stable `entryId` in a provenance namespace:
 *   oc:  on-chain    — re-derivable, carries a txHash
 *   dv:  derived     — synthesized from on-chain state, deterministic so
 *                      re-derivation is idempotent (FR-009/011)
 *   cl:  client-only — exists only on this device; travels in the backup
 *
 * Merge precedence: `oc:` beats `dv:` for the same underlying event
 * (via refs.dedupKey), and a `cl:` record whose txHash matches an `oc:` entry
 * is linked into it (context annotation) rather than shown twice. Pure module.
 */

const NS = new Set(['oc', 'dv', 'cl'])

export function onchainEntryId({ chainId, txHash, logIndex }) {
  return `oc:${Number(chainId)}:${txHash}:${logIndex ?? 'x'}`
}

/** On-chain id from a subgraph entity that already encodes tx+log uniqueness. */
export function subgraphEntryId({ chainId, entityId }) {
  return `oc:${Number(chainId)}:wt:${entityId}`
}

export function derivedWagerEntryId({ chainId, wagerId, kind, party }) {
  return `dv:${Number(chainId)}:wager:${String(wagerId)}:${kind}:${String(party || '').toLowerCase()}`
}

export function clientEntryId(uuid) {
  return `cl:${uuid}`
}

/** 'oc' | 'dv' | 'cl' | null */
export function namespaceOf(entryId) {
  const ns = String(entryId || '').split(':', 1)[0]
  return NS.has(ns) ? ns : null
}

/**
 * Dedup key for a wager value event — the underlying-event identity shared by
 * the subgraph row and the derived fallback row (account + chain are implied:
 * merge always runs within one (account, chainId) query).
 */
export function wagerDedupKey({ wagerId, kind }) {
  return `wager:${String(wagerId)}:${kind}`
}

/**
 * Merge normalized entries from all sources into the deduplicated ledger view.
 * Precedence per data-model.md: union by entryId → drop `dv:` covered by an
 * `oc:` with the same refs.dedupKey → fold `cl:` records into the `oc:` entry
 * that shares their txHash. Never mutates inputs; returns new objects only
 * where annotation is needed.
 *
 * @param {Array} entries - normalized LedgerEntry objects
 * @returns {Array} merged entries
 */
export function mergeEntries(entries = []) {
  // 1. Union by entryId — first occurrence wins (append-only records with the
  //    same id are identical by design).
  const byId = new Map()
  for (const e of entries) {
    if (!e || byId.has(e.entryId)) continue
    byId.set(e.entryId, e)
  }
  let merged = [...byId.values()]

  // 2. oc: beats dv: for the same underlying event.
  const onchainDedupKeys = new Set()
  for (const e of merged) {
    if (namespaceOf(e.entryId) === 'oc' && e.refs?.dedupKey) onchainDedupKeys.add(e.refs.dedupKey)
  }
  merged = merged.filter(
    (e) => !(namespaceOf(e.entryId) === 'dv' && e.refs?.dedupKey && onchainDedupKeys.has(e.refs.dedupKey)),
  )

  // 3. Link cl: records into the oc: entry sharing their txHash (context, not
  //    duplication): the on-chain entry wins financial fields and gains the
  //    client record's route/id as annotations.
  const ocByTx = new Map()
  for (const e of merged) {
    if (namespaceOf(e.entryId) === 'oc' && e.txHash) ocByTx.set(e.txHash.toLowerCase(), e)
  }
  const out = []
  const annotations = new Map() // oc entryId → { linkedClientEntryId, route }
  for (const e of merged) {
    if (namespaceOf(e.entryId) === 'cl' && e.txHash && ocByTx.has(e.txHash.toLowerCase())) {
      const oc = ocByTx.get(e.txHash.toLowerCase())
      annotations.set(oc.entryId, {
        linkedClientEntryId: e.entryId,
        ...(e.refs?.route ? { route: e.refs.route } : {}),
      })
      continue // folded into the on-chain entry
    }
    out.push(e)
  }
  if (annotations.size === 0) return out
  return out.map((e) =>
    annotations.has(e.entryId) ? { ...e, refs: { ...(e.refs || {}), ...annotations.get(e.entryId) } } : e,
  )
}
