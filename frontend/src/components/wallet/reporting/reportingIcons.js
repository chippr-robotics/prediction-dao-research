/**
 * Icon vocabulary for the Reporting section (issue #1026 follow-up).
 *
 * One place decides which glyph stands for which statement type, section and
 * period, so the sheet, the landing cards and the saved-statement list can
 * never disagree about what a report *is*. Names resolve against the shared
 * NavIcon set — the section adds no icon system of its own.
 *
 * An icon is never the only label: every one of these is rendered beside its
 * text, because a picture of a sprout does not say "Earnings" to a member who
 * has not seen it before, and a screen reader gets nothing from it at all.
 */

import { STATEMENT_SECTIONS, STATEMENT_TYPES } from '../../../data/reports/statement/reportTypes'
import { PERIOD_KINDS } from '../../../utils/reportPeriods'

export const TYPE_ICONS = Object.freeze({
  [STATEMENT_TYPES.FULL]: 'bank',
  [STATEMENT_TYPES.WAGERS]: 'ticket',
  [STATEMENT_TYPES.EARNINGS]: 'sprout',
  [STATEMENT_TYPES.TRANSFERS]: 'transfer',
  [STATEMENT_TYPES.CUSTOM]: 'sliders',
})

/** Short labels for the tile grid — the long blurb becomes the caption below. */
export const TYPE_SHORT_LABELS = Object.freeze({
  [STATEMENT_TYPES.FULL]: 'Account',
  [STATEMENT_TYPES.WAGERS]: 'Wagering',
  [STATEMENT_TYPES.EARNINGS]: 'Earnings',
  [STATEMENT_TYPES.TRANSFERS]: 'Transfers',
  [STATEMENT_TYPES.CUSTOM]: 'Custom',
})

export const SECTION_ICONS = Object.freeze({
  [STATEMENT_SECTIONS.SUMMARY]: 'grid',
  [STATEMENT_SECTIONS.CHARTS]: 'trending',
  [STATEMENT_SECTIONS.BY_TOKEN]: 'coin',
  [STATEMENT_SECTIONS.BY_ACTIVITY]: 'layers',
  [STATEMENT_SECTIONS.REGISTER]: 'list',
  [STATEMENT_SECTIONS.FEES]: 'percent',
  [STATEMENT_SECTIONS.FAILED]: 'alert',
})

export const CLASS_ICONS = Object.freeze({
  wager: 'ticket',
  pool: 'users',
  transfer: 'transfer',
  bridge: 'globe',
  earn: 'sprout',
  staking: 'gem',
  liquidity: 'layers',
  membership: 'star',
  miniapp: 'grid',
})

/**
 * Period chips, shortest-first.
 *
 * `CURRENT_MONTH` leads and is the default: a member opening this sheet almost
 * always wants the period they are currently in, and every extra tap between
 * "I need a statement" and having one is the clutter this redesign removes.
 */
export const PERIOD_CHIPS = Object.freeze([
  { kind: PERIOD_KINDS.CURRENT_MONTH, label: 'This month' },
  { kind: PERIOD_KINDS.LAST_MONTH, label: 'Last month' },
  { kind: PERIOD_KINDS.LAST_QUARTER, label: 'Last quarter' },
  { kind: PERIOD_KINDS.LAST_YEAR, label: 'Last 12 months' },
  { kind: PERIOD_KINDS.LAST_CALENDAR_YEAR, label: 'Last tax year' },
  // Not just "Custom": the type tiles already offer a "Custom" radio, and two
  // controls with the same accessible name in one dialog are indistinguishable
  // to anyone navigating by name.
  { kind: PERIOD_KINDS.CUSTOM, label: 'Custom range' },
])
