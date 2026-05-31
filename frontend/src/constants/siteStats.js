/**
 * Live site stats — baseline figures and display metadata for the landing
 * page stats band.
 *
 * The landing page surfaces real on-chain metrics when they're available,
 * but on a fresh testnet deployment the numbers are trivially small. To keep
 * the band feeling alive we floor each metric at a tasteful baseline — see
 * `useSiteStats`, where the displayed value is `max(live, baseline)`. Bump
 * these as the platform grows so the floor never trails reality.
 */

export const STATS_BASELINE = {
  activeAccounts: 1280,
  valueWageredUsd: 248_000,
  wagersResolved: 940,
  totalWagers: 1620,
  activeWagers: 210,
}

/**
 * The featured metrics, in display order. `format` selects the formatter in
 * LiveStats (`'usd'` → $1.2M style, `'compact'` → 1.2K style). Adding or
 * reordering a stat is a single edit here.
 */
export const STAT_CARDS = [
  { key: 'activeAccounts', label: 'Active Accounts', format: 'compact' },
  { key: 'valueWageredUsd', label: 'Value Wagered', format: 'usd' },
  { key: 'wagersResolved', label: 'Wagers Resolved', format: 'compact' },
  { key: 'totalWagers', label: 'Total Wagers', format: 'compact' },
  { key: 'activeWagers', label: 'Active Now', format: 'compact' },
]
