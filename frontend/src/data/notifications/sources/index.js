/**
 * Activity source registry (spec 031). The engine runs these in order each cycle. Adding a domain = add its
 * module + one entry here — no engine/store/feed/bell edits (see README.md + contracts/activity-source.md).
 *
 * Phase 2 (foundational) ships the wager source only — wagers now run on the generalized engine with no
 * regression. US1 adds daoSource, tokenSource, membershipSource.
 */
import { wagerSource } from './wagerSource'

export const activitySources = [wagerSource]

export default activitySources
