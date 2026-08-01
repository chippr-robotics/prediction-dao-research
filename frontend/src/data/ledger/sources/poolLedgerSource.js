/**
 * Pool ledger source (spec 051, research.md D2) — the member's group-pool
 * value events from the spec-034 subgraph entities:
 *   PoolMember  → pool_join   (buy-in escrowed; out)
 *   PoolClaim   → pool_claim  (winning share paid; in)
 *   PoolRefund  → pool_refund (buy-in returned; in)
 * All three carry real txHash + block timestamp.
 *
 * ON A CHAIN WITH NO SUBGRAPH THIS SOURCE REFUSES rather than returning [].
 * It used to return an empty array with the comment "disclosed gap" — but the
 * disclosure did not exist: `ledgerRepository` records a class in
 * `staleClasses` only when its promise REJECTS, and an empty array is a
 * fulfilled one. So on Mordor, which has a LIVE WagerPoolFactory and no
 * subgraph, every pool join, claim and refund was silently absent from the tax
 * report, and the report presented its total as complete. There is no RPC
 * enumeration path for pools, so this source is the only producer of
 * LEDGER_CLASS.POOL anywhere — its silence was the whole class going missing.
 *
 * The refusal is CONDITIONAL on the factory actually being deployed on that
 * chain. On Ethereum Classic there are no pools at all, so an empty result is
 * the truth and flagging a gap would be a false alarm.
 */
import { querySubgraph } from './subgraphClient'
import { getContractAddressForChain } from '../../../config/contracts'
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
      if (!data) {
        // No subgraph here. If pools exist on this chain, the member HAS pool
        // history we cannot read — say so, so the report discloses the gap
        // instead of totalling as if it were complete.
        if (getContractAddressForChain('wagerPoolFactory', chainId)) {
          throw new Error(`pool ledger: chain ${chainId} has pools but no subgraph to read them from`)
        }
        return [] // no pool factory on this chain — an empty result is the truth
      }
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
