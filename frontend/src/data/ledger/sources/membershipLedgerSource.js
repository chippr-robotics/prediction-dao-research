/**
 * Membership/voucher ledger source (spec 051, research.md D2) — voucher
 * lifecycle events for the account from the spec-026 subgraph `Voucher`
 * entity:
 *   minted by the account   → voucher_purchase (out; mint price is not
 *                             indexed, so the entry is honestly unvalued)
 *   redeemed by the account → voucher_redeem (no value movement)
 * Chains without a subgraph return [] — a disclosed gap.
 */
import { querySubgraph } from './subgraphClient'
import { onchainEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_DIRECTION, LEDGER_STATUS, PROVENANCE, TS_PROVENANCE, VALUATION_STATUS } from '../constants'

const VOUCHER_QUERY = `
  query LedgerVouchers($account: Bytes!) {
    minted: vouchers(where: { minter: $account }, first: 1000) {
      id
      tokenId
      tier
      mintedAt
      mintTxHash
    }
    redeemed: vouchers(where: { redeemedBy: $account }, first: 1000) {
      id
      tokenId
      tier
      redeemedAt
      redeemTxHash
    }
  }
`

function entry({ chainId, account, kind, direction, txHash, timestampSec, tokenId, tier }) {
  const sec = Number(timestampSec)
  return {
    entryId: onchainEntryId({ chainId, txHash, logIndex: `${kind}:${tokenId}` }),
    chainId,
    account,
    class: LEDGER_CLASS.MEMBERSHIP,
    kind,
    direction,
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.ONCHAIN,
    tokenAddress: null,
    amountRaw: null,
    // The voucher price is not indexed on the entity — flagged, never zeroed.
    valuationStatus: VALUATION_STATUS.UNVALUED,
    counterparty: null,
    txHash,
    timestamp: sec > 0 ? sec * 1000 : null,
    timestampProvenance: sec > 0 ? TS_PROVENANCE.CHAIN : TS_PROVENANCE.UNAVAILABLE,
    refs: { voucherId: String(tokenId), tier: tier != null ? Number(tier) : null },
  }
}

export function createMembershipLedgerSource(deps = {}) {
  const query = deps.querySubgraph || querySubgraph
  return {
    class: LEDGER_CLASS.MEMBERSHIP,
    async list({ account, chainId }) {
      const data = await query(chainId, VOUCHER_QUERY, { account })
      if (!data) return []
      const entries = []
      for (const v of data.minted || []) {
        if (!v.mintTxHash) continue
        entries.push(
          entry({
            chainId,
            account,
            kind: 'voucher_purchase',
            direction: LEDGER_DIRECTION.OUT,
            txHash: v.mintTxHash,
            timestampSec: v.mintedAt,
            tokenId: v.tokenId,
            tier: v.tier,
          }),
        )
      }
      for (const v of data.redeemed || []) {
        if (!v.redeemTxHash) continue
        entries.push(
          entry({
            chainId,
            account,
            kind: 'voucher_redeem',
            direction: LEDGER_DIRECTION.NONE,
            txHash: v.redeemTxHash,
            timestampSec: v.redeemedAt,
            tokenId: v.tokenId,
            tier: v.tier,
          }),
        )
      }
      return entries
    },
  }
}
