/**
 * Activity source registry (spec 031). The engine runs these in order each cycle. Adding a domain = add its
 * module + one entry here — no engine/store/feed/bell edits (see README.md + contracts/activity-source.md).
 *
 * Each entry implements the ActivitySource contract: `{ key, label, detect({account,chainId,nowMs,prior}) }`
 * returning `{ entries, nextSnapshots, currentIds, actionNeededById, ok, partial? }`.
 */
import { wagerSource } from './wagerSource'
import { daoSource } from './daoSource'
import { tokenSource } from './tokenSource'
import { membershipSource } from './membershipSource'
import { poolsSource } from './poolsSource'
import { custodySource } from './custodySource'
import { earnSource } from './earnSource'
import { stakingSource } from './stakingSource'
// Spec 067 (T111/T112): cross-chain bridging and pool liquidity. Two SEPARATE sources, each with
// its own key/domain, so neither is ever filed under `pools` — that key belongs to wager pools and
// nothing else (FR-039).
import { bridgeSource } from './bridgeSource'
import { liquiditySource } from './liquiditySource'
// Spec 082: read-only snapshot-diff of the member's open perp positions per venue.
import { perpsSource } from './perpsSource'
// Spec 095: API keys minted/withdrawn and the assistant switch. Purely local — no network read, so
// it can never contribute to the "couldn't refresh" notice.
import { accessSource } from './accessSource'

export const activitySources = [
  wagerSource,
  daoSource,
  tokenSource,
  membershipSource,
  poolsSource,
  custodySource,
  earnSource,
  stakingSource,
  bridgeSource,
  liquiditySource,
  perpsSource,
  accessSource,
]

export default activitySources
