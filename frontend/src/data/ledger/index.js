/**
 * Unified activity ledger (spec 051) — public module surface.
 * `getDefaultLedgerRepository()` wires every domain source; tests and the
 * report builder can compose their own via createLedgerRepository.
 *
 * A source that is not registered here is UNREACHABLE: the repository only
 * collects from the sources it was given, so an unregistered domain's records
 * sit in the client store while the Account tab and the tax report both show
 * nothing. Every new domain source belongs in the list below.
 */
import { createLedgerRepository } from './ledgerRepository'
import { createWagerLedgerSource } from './sources/wagerLedgerSource'
import { createTransferLedgerSource } from './sources/transferLedgerSource'
import { createEarnLedgerSource } from './sources/earnLedgerSource'
import { createStakingLedgerSource } from './sources/stakingLedgerSource'
import { createPoolLedgerSource } from './sources/poolLedgerSource'
import { createMembershipLedgerSource } from './sources/membershipLedgerSource'
import { createBridgeLedgerSource } from './sources/bridgeLedgerSource'
import { createLiquidityLedgerSource } from './sources/liquidityLedgerSource'
import { createMiniAppLedgerSource } from './sources/miniAppSource'
import { getPrunedBefore } from './ledgerClientStore'
import { migrateLegacyActivity } from './migrate'

export { createLedgerRepository, defaultEnrich } from './ledgerRepository'
export { createWagerLedgerSource } from './sources/wagerLedgerSource'
export { createTransferLedgerSource, transferRecordToEntry } from './sources/transferLedgerSource'
export { createEarnLedgerSource, captureEarnAction } from './sources/earnLedgerSource'
export { createStakingLedgerSource, captureStakingAction } from './sources/stakingLedgerSource'
export { createPoolLedgerSource } from './sources/poolLedgerSource'
export { createMembershipLedgerSource } from './sources/membershipLedgerSource'
// Spec 067 — cross-chain bridging (one entry per bridge, FR-035) and Earn →
// Supply liquidity positions (class `liquidity`, never `pool`, FR-039).
export {
  createBridgeLedgerSource,
  captureBridgeSubmission,
  captureBridgeState,
  listBridgeEntries,
  readBridgeEntry,
  bridgeEntryId,
  BRIDGE_STATE,
} from './sources/bridgeLedgerSource'
export {
  createLiquidityLedgerSource,
  captureLiquidityAction,
  listLiquidityEntries,
  readLiquidityEntry,
  liquidityEntryId,
  LIQUIDITY_ACTION,
} from './sources/liquidityLedgerSource'
// Spec 073 — mini-app audit records (launch, app-requested transaction,
// integrity refusal, state change, app-contextual log). Attribution only: the
// entries carry no value, so a mini-app transaction is still reported once, by
// the domain source that can substantiate the amount.
export {
  createMiniAppLedgerSource,
  captureMiniAppLaunch,
  captureMiniAppTxSubmitted,
  captureMiniAppIntegrityFailure,
  captureMiniAppStateChange,
  captureMiniAppLog,
  listMiniAppEntries,
  listAllMiniAppRecords,
  readMiniAppEntry,
  miniAppEntryId,
  MINIAPP_KIND,
} from './sources/miniAppSource'
export * from './constants'
export * from './identity'
export { normalizeEntry, collapseBridgeEntries, bridgeLogicalKey } from './normalize'
export {
  appendClientRecord,
  listClientRecords,
  listAllClientRecords,
  mergeClientRecords,
  getPrunedBefore,
  pruneClientRecords,
} from './ledgerClientStore'
export { migrateLegacyActivity } from './migrate'

/** The app's standard ledger for a chain — every domain source wired. */
export function getDefaultLedgerRepository() {
  const repository = createLedgerRepository({
    sources: [
      createWagerLedgerSource(),
      createTransferLedgerSource(),
      createEarnLedgerSource(),
      createStakingLedgerSource(),
      createPoolLedgerSource(),
      createMembershipLedgerSource(),
      createBridgeLedgerSource(),
      createLiquidityLedgerSource(),
      createMiniAppLedgerSource(),
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
