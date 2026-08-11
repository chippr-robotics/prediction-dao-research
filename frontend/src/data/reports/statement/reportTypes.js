/**
 * Statement types and sections — what a member chooses before generating
 * (issue #1026: "select a type of report such as wagers, or earning reports").
 *
 * A statement type is a SCOPE, not a style: it narrows which activity classes
 * are reported. That makes honesty the load-bearing rule of this module. A
 * scoped statement shows smaller totals than the member's real activity, so
 * every scope carries a `scopeNote` that the document prints beside its totals;
 * a reader must never be able to mistake "your wagers" for "your account".
 *
 * Sections are subtractive in the same way: hiding the transaction register
 * does not change a single total, but it does change what the reader can
 * verify, so a suppressed section is DISCLOSED rather than silently missing.
 */

import { LEDGER_CLASS } from '../../ledger/constants'
import { classLabel } from '../activityClassification'

/** Every class a statement can cover, in the order they read on the page. */
export const STATEMENT_CLASSES = Object.freeze([
  LEDGER_CLASS.WAGER,
  LEDGER_CLASS.POOL,
  LEDGER_CLASS.TRANSFER,
  LEDGER_CLASS.BRIDGE,
  LEDGER_CLASS.EARN,
  LEDGER_CLASS.STAKING,
  LEDGER_CLASS.LIQUIDITY,
  LEDGER_CLASS.MEMBERSHIP,
  LEDGER_CLASS.MINIAPP,
])

/**
 * Built-in scopes. `classes: null` means "every class" — which is NOT the same
 * as listing them all: a class added by a future spec must land in the account
 * statement automatically, or the default statement would quietly stop being
 * complete the day it shipped.
 */
export const STATEMENT_TYPES = Object.freeze({
  FULL: 'full',
  WAGERS: 'wagers',
  EARNINGS: 'earnings',
  TRANSFERS: 'transfers',
  CUSTOM: 'custom',
})

const TYPE_DEFS = Object.freeze({
  [STATEMENT_TYPES.FULL]: {
    id: STATEMENT_TYPES.FULL,
    title: 'Account Statement',
    blurb: 'Every activity type on this network for the period.',
    classes: null,
  },
  [STATEMENT_TYPES.WAGERS]: {
    id: STATEMENT_TYPES.WAGERS,
    title: 'Wagering Statement',
    blurb: 'Wagers and wager pools only.',
    classes: [LEDGER_CLASS.WAGER, LEDGER_CLASS.POOL],
  },
  [STATEMENT_TYPES.EARNINGS]: {
    id: STATEMENT_TYPES.EARNINGS,
    title: 'Earnings Statement',
    blurb: 'Earn, staking and supplied liquidity only.',
    classes: [LEDGER_CLASS.EARN, LEDGER_CLASS.STAKING, LEDGER_CLASS.LIQUIDITY],
  },
  [STATEMENT_TYPES.TRANSFERS]: {
    id: STATEMENT_TYPES.TRANSFERS,
    title: 'Transfers Statement',
    blurb: 'Payments, receipts and cross-network bridges only.',
    classes: [LEDGER_CLASS.TRANSFER, LEDGER_CLASS.BRIDGE],
  },
  [STATEMENT_TYPES.CUSTOM]: {
    id: STATEMENT_TYPES.CUSTOM,
    title: 'Activity Statement',
    blurb: 'The activity types you selected.',
    classes: [],
  },
})

/** Ordered list for a picker. */
export function statementTypeOptions() {
  return Object.values(TYPE_DEFS)
}

export function statementTypeDef(id) {
  return TYPE_DEFS[id] || TYPE_DEFS[STATEMENT_TYPES.FULL]
}

/** Sections a member can include or leave out. */
export const STATEMENT_SECTIONS = Object.freeze({
  SUMMARY: 'summary',
  CHARTS: 'charts',
  BY_TOKEN: 'byToken',
  BY_ACTIVITY: 'byActivity',
  REGISTER: 'register',
  FEES: 'fees',
  FAILED: 'failed',
})

export const SECTION_DEFS = Object.freeze([
  {
    id: STATEMENT_SECTIONS.SUMMARY,
    label: 'Statement summary',
    blurb: 'Money in, money out, net change and entry count.',
  },
  {
    id: STATEMENT_SECTIONS.CHARTS,
    label: 'Charts',
    blurb: 'Flow over the period and a breakdown by activity type.',
  },
  { id: STATEMENT_SECTIONS.BY_TOKEN, label: 'Movement by asset', blurb: 'Per-asset in, out and net across the period.' },
  { id: STATEMENT_SECTIONS.BY_ACTIVITY, label: 'Activity breakdown', blurb: 'Per-activity-type totals in and out.' },
  { id: STATEMENT_SECTIONS.REGISTER, label: 'Transaction register', blurb: 'Every settled entry, with full transaction hashes.' },
  { id: STATEMENT_SECTIONS.FEES, label: 'Fees', blurb: 'Network fees you paid and platform fees charged.' },
  {
    id: STATEMENT_SECTIONS.FAILED,
    label: 'Failed operations',
    blurb: 'Listed separately and excluded from every total.',
  },
])

/** Everything on — the default a member gets without touching a control. */
export function defaultSections() {
  return Object.fromEntries(SECTION_DEFS.map((s) => [s.id, true]))
}

/**
 * Normalize a caller's options into the shape the model and renderer consume.
 * Unknown sections are ignored rather than trusted, and an explicitly empty
 * custom class list falls back to the full scope: a statement of nothing is
 * never what a member meant, and silently producing one would read as "you had
 * no activity".
 */
export function resolveStatementOptions(options = {}) {
  const def = statementTypeDef(options.type)
  const custom = Array.isArray(options.classes)
    ? options.classes.filter((c) => STATEMENT_CLASSES.includes(c))
    : null

  let classes = def.classes
  if (def.id === STATEMENT_TYPES.CUSTOM) classes = custom && custom.length ? custom : null
  else if (custom && custom.length) classes = custom

  const sections = { ...defaultSections() }
  for (const [key, value] of Object.entries(options.sections || {})) {
    if (key in sections) sections[key] = Boolean(value)
  }

  return {
    type: def.id,
    title: options.title || def.title,
    classes: classes && classes.length ? [...classes] : null,
    sections,
  }
}

/**
 * The line a scoped statement prints beside its totals. Null for a full
 * account statement — there is nothing to disclose when nothing was excluded.
 */
export function scopeNote(classes) {
  if (!classes || !classes.length) return null
  const names = classes.map((c) => classLabel(c)).join(', ')
  return (
    `Scope: ${names}. This statement covers only the activity types listed above — other activity ` +
    'on this account in this period is not included in any figure on this document.'
  )
}
