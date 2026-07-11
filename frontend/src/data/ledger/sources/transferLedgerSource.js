/**
 * Wallet-transfer ledger source (spec 051, research.md D2/D4).
 *
 * Reads the append-only client ledger store (the durable, backed-up home of
 * client-captured activity) plus, until migration has run, the legacy
 * `transferStore` (`fairwins.transfers.v1`) rows mapped to the same `cl:` ids
 * — so pre-migration history is visible and post-migration the union is a
 * no-op. When both stores describe the same transfer, the client-ledger
 * chain (which carries append-only status history) wins.
 *
 * Failed gasless/sponsored operations are first-class entries here: status
 * `failed` + the verbatim bundler/paymaster reason (FR-003).
 */
import { getNetwork } from '../../../config/networks'
import { listTransfers } from '../../../lib/transfer/transferStore'
import { listClientRecords } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, PROVENANCE, TS_PROVENANCE } from '../constants'

const STATUS_MAP = {
  in_process: LEDGER_STATUS.PENDING,
  complete: LEDGER_STATUS.SETTLED,
  failed: LEDGER_STATUS.FAILED,
}

/**
 * Map a transferStore record to a client ledger entry. Pure; reused by the
 * useTransfer mirror and the one-time migration so all three paths produce
 * byte-identical entries (identical entryIds ⇒ union dedup).
 */
export function transferRecordToEntry(record, { account } = {}) {
  const chainId = Number(record.chainId)
  const net = getNetwork(chainId)
  const isStable = record.kind === 'stable'
  const stable = net?.stablecoin
  const amount = Number(record.amount)
  return {
    entryId: clientEntryId(record.id),
    chainId,
    account: String(account || record.from || '').toLowerCase(),
    class: LEDGER_CLASS.TRANSFER,
    kind: 'send',
    direction: 'out',
    status: STATUS_MAP[record.status] || LEDGER_STATUS.PENDING,
    failureReason: record.error || null,
    tokenAddress: isStable ? stable?.address || null : null,
    tokenSymbol: record.symbol || null,
    tokenDecimals: record.decimals ?? null,
    amount: Number.isFinite(amount) ? amount : null,
    // Stablecoin sends value at par (the spec-016 policy); everything else is
    // honestly unvalued until a price source exists (FR-016).
    valueUsd: isStable && Number.isFinite(amount) ? amount : null,
    counterparty: record.to || null,
    txHash: record.txHash || null,
    timestamp: Number(record.createdAt) > 0 ? Number(record.createdAt) : null,
    timestampProvenance: Number(record.createdAt) > 0 ? TS_PROVENANCE.DEVICE : TS_PROVENANCE.UNAVAILABLE,
    provenance: PROVENANCE.CLIENT,
    recordedAt: Number(record.updatedAt) || Number(record.createdAt) || null,
    refs: { route: record.route || null, transferId: record.id },
  }
}

export function createTransferLedgerSource(deps = {}) {
  const readClientRecords = deps.listClientRecords || listClientRecords
  const readLegacyTransfers = deps.listTransfers || listTransfers

  return {
    class: LEDGER_CLASS.TRANSFER,
    async list({ account, chainId }) {
      const clientRecords = readClientRecords(account, chainId).filter(
        (r) => r.class === LEDGER_CLASS.TRANSFER,
      )
      const mirroredTransferIds = new Set(
        clientRecords.map((r) => r.refs?.transferId).filter(Boolean),
      )
      const legacy = readLegacyTransfers(account, chainId)
        .filter((r) => !mirroredTransferIds.has(r.id))
        .map((r) => transferRecordToEntry(r, { account }))
      return [...clientRecords, ...legacy]
    },
  }
}
