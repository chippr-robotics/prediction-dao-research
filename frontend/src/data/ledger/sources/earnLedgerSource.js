/**
 * Earn/lending ledger source (spec 051, research.md D2 — adjusted).
 *
 * Earn vaults are discovered dynamically from the Morpho API (spec 050);
 * there is no fixed on-chain vault registry to scan events from, so an
 * exhaustive ERC-4626 event sweep is not viable on public RPCs. Instead,
 * earn activity is captured at ACTION TIME — the deposit/withdraw/claim
 * flows call `captureEarnAction` with the receipt tx hash — into the
 * append-only client ledger store, exactly like wallet transfers. The
 * records carry the real txHash (chain-verifiable) and travel in the
 * encrypted backup. Positions changed outside this app are a DISCLOSED gap
 * (the notification feed's snapshot-diff backstop still surfaces them as
 * they happen; FR-013 disclosure covers the ledger).
 */
import { listClientRecords, appendClientRecord } from '../ledgerClientStore'
import { clientEntryId } from '../identity'
import { LEDGER_CLASS, LEDGER_STATUS, PROVENANCE, TS_PROVENANCE } from '../constants'

const KIND_BY_ACTION = {
  'earn-deposit': { kind: 'vault_deposit', direction: 'out' },
  'earn-withdraw': { kind: 'vault_withdraw', direction: 'in' },
  'earn-rewards-claimed': { kind: 'reward_claim', direction: 'in' },
}

/**
 * Record an earn action into the ledger. Called by the earn flows right where
 * they queue the notification entry (VaultSheet deposit/withdraw,
 * useEarnRewards claim). Never throws — capture must not break the action.
 *
 * @param {string} account
 * @param {number} chainId
 * @param {object} a - { type, txHash, at, vaultAddress?, amountRaw?, tokenAddress?, tokenSymbol?, tokenDecimals?, description? }
 */
export function captureEarnAction(account, chainId, a) {
  if (!account || !a?.type || !a?.txHash) return
  const mapping = KIND_BY_ACTION[a.type]
  if (!mapping) return
  appendClientRecord(account, {
    entryId: clientEntryId(`earn:${chainId}:${a.type}:${a.txHash}`),
    chainId: Number(chainId),
    account: String(account).toLowerCase(),
    class: LEDGER_CLASS.EARN,
    kind: mapping.kind,
    direction: mapping.direction,
    status: LEDGER_STATUS.SETTLED,
    provenance: PROVENANCE.CLIENT,
    tokenAddress: a.tokenAddress ? String(a.tokenAddress).toLowerCase() : null,
    tokenSymbol: a.tokenSymbol || null,
    tokenDecimals: a.tokenDecimals ?? null,
    amountRaw: a.amountRaw != null ? String(a.amountRaw) : null,
    counterparty: a.vaultAddress ? String(a.vaultAddress).toLowerCase() : null,
    txHash: a.txHash,
    timestamp: Number(a.at) > 0 ? Number(a.at) : Date.now(),
    timestampProvenance: TS_PROVENANCE.DEVICE,
    refs: { vaultAddress: a.vaultAddress || null, description: a.description || null },
  })
}

export function createEarnLedgerSource(deps = {}) {
  const readClientRecords = deps.listClientRecords || listClientRecords
  return {
    class: LEDGER_CLASS.EARN,
    async list({ account, chainId }) {
      return readClientRecords(account, chainId).filter((r) => r.class === LEDGER_CLASS.EARN)
    },
  }
}
