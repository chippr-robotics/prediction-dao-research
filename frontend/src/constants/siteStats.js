/**
 * Live site stats — display metadata for the landing page stats band.
 *
 * The band surfaces real on-chain metrics only (see `useSiteStats`). There is
 * intentionally no baseline floor: on a fresh deployment the numbers are
 * trivially small (or zero), and showing fabricated figures to users of a
 * real-money product would be misleading.
 *
 * The canonical list of metric keys lives in `useSiteStats.emptyStats()`.
 */

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
