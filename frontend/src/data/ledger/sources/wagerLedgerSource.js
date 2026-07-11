/**
 * Wager ledger source (spec 051, research.md D2).
 *
 * Primary path: the subgraph `WagerTransfer` entity via the report data
 * source — real txHash, block timestamp, from/to (the fidelity FR-004 needs).
 * Fallback path (subgraph-less networks): derive value events from the same
 * wager records that power "My Wagers" (`deriveTransfersFromWagers`) —
 * provenance `dv:`, deterministic ids so re-derivation is idempotent, and
 * timestamps hydrated from chain block times where the budget allows
 * (timestamps.js); a time that cannot be established is `null`, never 0.
 *
 * Both paths stamp the same refs.dedupKey so the repository merge drops the
 * derived row whenever the indexed row for the same underlying event exists.
 */
import { createReportDataSource } from '../../reports/reportDataSource'
import { getDefaultWagerRepository } from '../../wagers/WagerRepository'
import { deriveTransfersFromWagers } from '../../../lib/account/deriveTransfers'
import { hydrateWagerTimestamps } from '../timestamps'
import { subgraphEntryId, derivedWagerEntryId, wagerDedupKey } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, PROVENANCE, TS_PROVENANCE } from '../constants'

/** deposit leaves the account; payout/refund return to it. */
const DIRECTION_BY_KIND = { deposit: 'out', payout: 'in', refund: 'in' }

/** Map one subgraph WagerTransfer pre-item to a ledger pre-item. */
export function wagerTransferToEntry(row, { chainId, account }) {
  const kind = row.direction
  return {
    entryId: subgraphEntryId({ chainId, entityId: `${row.txHash}-${row.wagerId}-${kind}` }),
    chainId,
    account,
    class: LEDGER_CLASS.WAGER,
    kind,
    direction: DIRECTION_BY_KIND[kind] || 'none',
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.ONCHAIN,
    tokenAddress: row.tokenAddress,
    amountRaw: row.amountRaw,
    counterparty: kind === 'deposit' ? row.toAddress || null : row.fromAddress || null,
    txHash: row.txHash,
    timestamp: row.timestamp, // already epoch ms from the report source
    timestampProvenance: TS_PROVENANCE.CHAIN,
    refs: { wagerId: String(row.wagerId), dedupKey: wagerDedupKey({ wagerId: row.wagerId, kind }) },
  }
}

/** Map one derived pre-item (deriveTransfersFromWagers) to a ledger pre-item. */
export function derivedTransferToEntry(row, { chainId, account }) {
  const kind = row.direction
  const ts = Number(row.timestamp)
  return {
    entryId: derivedWagerEntryId({ chainId, wagerId: row.wagerId, kind, party: account }),
    chainId,
    account,
    class: LEDGER_CLASS.WAGER,
    kind,
    direction: DIRECTION_BY_KIND[kind] || 'none',
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.DERIVED,
    tokenAddress: row.tokenAddress,
    amountRaw: row.amountRaw,
    counterparty: null,
    txHash: null,
    // Derived rows have no single log; a real block time is hydrated upstream
    // when available, otherwise the honest answer is "unavailable" (FR-006).
    timestamp: Number.isFinite(ts) && ts > 0 ? ts : null,
    timestampProvenance: Number.isFinite(ts) && ts > 0 ? TS_PROVENANCE.CHAIN : TS_PROVENANCE.UNAVAILABLE,
    refs: { wagerId: String(row.wagerId), dedupKey: wagerDedupKey({ wagerId: row.wagerId, kind }) },
  }
}

async function loadAllWagers(repository, account) {
  const all = []
  let cursor = null
  for (let page = 0; page < 200; page++) {
    const res = await repository.listMyWagers({
      userAddress: account,
      cursor,
      pageSize: 100,
      filter: { includeExpired: true },
    })
    all.push(...(res.items || []))
    if (!res.hasMore || !res.nextCursor) break
    cursor = res.nextCursor
  }
  return all
}

/**
 * @param {object} [deps] - injectable for tests
 * @param {(q:{account:string})=>Promise<Array|null>} [deps.listTransfers] - subgraph rows or null when unindexed
 * @param {(q:{account:string,chainId:number})=>Promise<Array>} [deps.listWagers] - rich wager records
 * @param {(wagers:Array, chainId:number)=>Promise<Array>} [deps.hydrateWagerTimestamps] - fills createdAt/resolvedAt (ms) from chain
 */
export function createWagerLedgerSource(deps = {}) {
  return {
    class: LEDGER_CLASS.WAGER,
    async list({ account, chainId, provider }) {
      const listTransfers =
        deps.listTransfers ||
        ((q) => createReportDataSource({ chainId, provider }).listTransfers(q))

      const indexed = await listTransfers({ account })
      if (indexed !== null && indexed !== undefined) {
        return indexed.map((row) => wagerTransferToEntry(row, { chainId, account }))
      }

      // Subgraph-less network — derive from wager state (the My Wagers truth).
      const listWagers =
        deps.listWagers ||
        (async (q) => loadAllWagers(getDefaultWagerRepository(q.chainId), q.account))
      let wagers = await listWagers({ account, chainId })
      // Real block times for the derived rows (US4/FR-005): bounded chain
      // scan + cache; anything unhydrated stays null → "date unavailable".
      const hydrate = deps.hydrateWagerTimestamps || ((ws, cid) => hydrateWagerTimestamps(ws, cid, { provider }))
      wagers = await hydrate(wagers, chainId)
      const derived = deriveTransfersFromWagers({ wagers, address: account })
      return derived.map((row) => derivedTransferToEntry(row, { chainId, account }))
    },
  }
}
