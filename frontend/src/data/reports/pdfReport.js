/**
 * PDF entry point for the activity report (spec 016-wager-tax-report,
 * FR-006/FR-007/FR-008/FR-009; contracts/report-line-item.md).
 *
 * The document itself is the branded account statement in ./statement/ (issue
 * #1026). This module stays the stable seam the app and the report history call
 * through: it resolves the ACTIVE TENANT's identity and palette and hands them
 * to the pure renderer, so nothing downstream of here knows a tenant exists.
 *
 * Callers may pass a statement type, an explicit class scope, and section
 * toggles; the defaults reproduce a complete account statement.
 */

import { renderStatement, statementFileName } from './statement/statementPdf'
import { statementBrand, statementThemeForTenant } from './statement/brand'

/** Tenant identity + palette, unless the caller injected their own (tests, preview). */
function withTenant(options) {
  return {
    ...options,
    brand: options.brand || statementBrand(),
    theme: options.theme || statementThemeForTenant(),
  }
}

/**
 * @param {object} report - ActivityReport from buildReport
 * @param {object} [options] - { type, classes, sections, title, brand, theme }
 * @returns {Blob} application/pdf
 */
export function render(report, options = {}) {
  return renderStatement(report, withTenant(options))
}

/**
 * Suggested download file name (FR-007).
 *
 * The legacy wager-only path keeps its historical name byte-for-byte so
 * existing tooling and saved-report history stay stable; a ledger-built
 * statement is named for the tenant, the scope, the network and the period —
 * a member downloading a wagering and an earnings statement for the same month
 * must not end up with two files of the same name.
 */
export function fileName(report, options = {}) {
  if (report?.source === 'ledger') return statementFileName(report, withTenant(options))
  const from = new Date(report.period.from).toISOString().slice(0, 10)
  const to = new Date(report.period.to).toISOString().slice(0, 10)
  const net = report.networkName.replace(/\s+/g, '-')
  return `wager-report_${net}_${from}_${to}.pdf`
}
