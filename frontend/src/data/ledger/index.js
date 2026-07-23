/**
 * Unified activity ledger (spec 051) — public module surface.
 * `getDefaultLedgerRepository(chainId)` wires the five domain sources; tests
 * and the report builder can compose their own via createLedgerRepository.
 */
import { createLedgerRepository } from './ledgerRepository'
import { createWagerLedgerSource } from './sources/wagerLedgerSource'
import { createTransferLedgerSource } from './sources/transferLedgerSource'
import { createEarnLedgerSource } from './sources/earnLedgerSource'
import { createStakingLedgerSource } from './sources/stakingLedgerSource'
import { createPoolLedgerSource } from './sources/poolLedgerSource'
import { createMembershipLedgerSource } from './sources/membershipLedgerSource'
import { getPrunedBefore } from './ledgerClientStore'
import { migrateLegacyActivity } from './migrate'

export { createLedgerRepository, defaultEnrich } from './ledgerRepository'
export { createWagerLedgerSource } from './sources/wagerLedgerSource'
export { createTransferLedgerSource, transferRecordToEntry } from './sources/transferLedgerSource'
export { createEarnLedgerSource, captureEarnAction } from './sources/earnLedgerSource'
export { createStakingLedgerSource, captureStakingAction } from './sources/stakingLedgerSource'
export { createPoolLedgerSource } from './sources/poolLedgerSource'
export { createMembershipLedgerSource } from './sources/membershipLedgerSource'
export * from './constants'
export * from './identity'
export { normalizeEntry } from './normalize'
export {
  appendClientRecord,
  listClientRecords,
  listAllClientRecords,
  mergeClientRecords,
  getPrunedBefore,
  pruneClientRecords,
} from './ledgerClientStore'
export { migrateLegacyActivity } from './migrate'

/** The app's standard ledger for a chain — all five sources wired. */
export function getDefaultLedgerRepository() {
  const repository = createLedgerRepository({
    sources: [
      createWagerLedgerSource(),
      createTransferLedgerSource(),
      createEarnLedgerSource(),
      createStakingLedgerSource(),
      createPoolLedgerSource(),
      createMembershipLedgerSource(),
    ],
    getPrunedBefore: ({ account, chainId }) => getPrunedBefore(account, chainId),
  })
  return {
    // Every consumer triggers the one-time legacy import (FR-017) — the
    // per-account marker makes repeat calls a cheap no-op.
    listEntries: (q) => {
      migrateLegacyActivity(q?.account)
      return repository.listEntries(q)
    },
  }
}
