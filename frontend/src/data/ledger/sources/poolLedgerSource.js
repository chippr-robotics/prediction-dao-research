/**
 * Pool ledger source (spec 051, research.md D2) — the member's group-pool
 * value events from the spec-034 subgraph entities:
 *   PoolMember  → pool_join   (buy-in escrowed; out)
 *   PoolClaim   → pool_claim  (winning share paid; in)
 *   PoolRefund  → pool_refund (buy-in returned; in)
 * All three carry real txHash + block timestamp. On chains without a
 * subgraph the source returns [] — pool history there is a disclosed gap
 * until pools ship an RPC enumeration path (FR-013 disclosure).
 */
import { querySubgraph } from './subgraphClient'
import { onchainEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, PROVENANCE, TS_PROVENANCE } from '../constants'

const POOL_ACTIVITY_QUERY = `
  query LedgerPoolActivity($member: Bytes!) {
    poolMembers(where: { member: $member }, first: 1000) {
      id
      buyIn
      joinedAt
      joinTxHash
      pool { id poolId token }
    }
    poolClaims(where: { winner: $member }, first: 1000) {
      id
      amount
      timestamp
      txHash
      pool { id poolId token }
    }
    poolRefunds(where: { member: $member }, first: 1000) {
      id
      amount
      timestamp
      txHash
      pool { id poolId token }
    }
  }
`

function base(row, { chainId, account, kind, direction, txHash, timestamp, amount }) {
  const sec = Number(timestamp)
  return {
    entryId: onchainEntryId({ chainId, txHash, logIndex: `${kind}:${row.pool?.id}` }),
    chainId,
    account,
    class: LEDGER_CLASS.POOL,
    kind,
    direction,
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.ONCHAIN,
    tokenAddress: row.pool?.token || null,
    amountRaw: String(amount ?? 0),
    counterparty: row.pool?.id || null,
    txHash,
    timestamp: sec > 0 ? sec * 1000 : null,
    timestampProvenance: sec > 0 ? TS_PROVENANCE.CHAIN : TS_PROVENANCE.UNAVAILABLE,
    refs: { poolId: row.pool?.poolId != null ? String(row.pool.poolId) : null, poolAddress: row.pool?.id || null },
  }
}

export function createPoolLedgerSource(deps = {}) {
  const query = deps.querySubgraph || querySubgraph
  return {
    class: LEDGER_CLASS.POOL,
    async list({ account, chainId }) {
      const data = await query(chainId, POOL_ACTIVITY_QUERY, { member: account })
      if (!data) return [] // no subgraph on this chain — disclosed gap
      const entries = []
      for (const m of data.poolMembers || []) {
        entries.push(
          base(m, {
            chainId,
            account,
            kind: 'pool_join',
            direction: 'out',
            txHash: m.joinTxHash,
            timestamp: m.joinedAt,
            amount: m.buyIn,
          }),
        )
      }
      for (const c of data.poolClaims || []) {
        entries.push(
          base(c, {
            chainId,
            account,
            kind: 'pool_claim',
            direction: 'in',
            txHash: c.txHash,
            timestamp: c.timestamp,
            amount: c.amount,
          }),
        )
      }
      for (const r of data.poolRefunds || []) {
        entries.push(
          base(r, {
            chainId,
            account,
            kind: 'pool_refund',
            direction: 'in',
            txHash: r.txHash,
            timestamp: r.timestamp,
            amount: r.amount,
          }),
        )
      }
      return entries
    },
  }
}
