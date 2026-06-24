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

export const activitySources = [wagerSource, daoSource, tokenSource, membershipSource]

export default activitySources
