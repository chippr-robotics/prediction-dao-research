/**
 * Staking ledger source (spec 065, T033). Mirrors earnLedgerSource.
 *
 * Staking options are config/API-discovered (no fixed on-chain registry to
 * sweep), so staking activity is captured at ACTION TIME — the
 * stake/unstake/withdraw/claim flows call `captureStakingAction` with the
 * receipt tx hash — into the append-only client ledger store. Records carry the
 * real txHash (chain-verifiable) and travel in the encrypted backup.
 */
import { listClientRecords, appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, PROVENANCE, TS_PROVENANCE } from '../constants'

const KIND_BY_ACTION = {
  stake: { kind: 'stake', direction: 'out' },
  'unstake-requested': { kind: 'unstake_request', direction: 'none' },
  withdraw: { kind: 'unstake_withdraw', direction: 'in' },
  'rewards-claimed': { kind: 'reward_claim', direction: 'in' },
}

/**
 * Record a staking action into the ledger. Called by the staking flows right
 * where they queue the notification entry (StakeSheet). Never throws — capture
 * must not break the action.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {object} a - { type, txHash, at, optionId?, model?, amountRaw?, tokenSymbol?, tokenDecimals?, counterparty?, description? }
 */
export function captureStakingAction(account, chainId, a) {
  if (!account || !a?.type || !a?.txHash) return
  const mapping = KIND_BY_ACTION[a.type]
  if (!mapping) return
  appendClientRecord(account, {
    entryId: clientEntryId(`staking:${chainId}:${a.type}:${a.txHash}`),
    chainId: Number(chainId),
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.STAKING,
    kind: mapping.kind,
    direction: mapping.direction,
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.CLIENT,
    tokenAddress: null,
    tokenSymbol: a.tokenSymbol || null,
    tokenDecimals: a.tokenDecimals ?? null,
    amountRaw: a.amountRaw != null ? String(a.amountRaw) : null,
    counterparty: a.counterparty ? String(a.counterparty).toLowerCase() : null,
    txHash: a.txHash,
    timestamp: Number(a.at) > 0 ? Number(a.at) : Date.now(),
    timestampProvenance: TS_PROVENANCE.DEVICE,
    refs: { optionId: a.optionId || null, model: a.model || null, description: a.description || null },
  })
}

export function createStakingLedgerSource(deps = {}) {
  const readClientRecords = deps.listClientRecords || listClientRecords
  return {
    class: LEDGER_CLASS.STAKING,
    async list({ account, chainId }) {
      return readClientRecords(account, chainId).filter((r) => r.class === LEDGER_CLASS.STAKING)
    },
  }
}
