/**
 * Shared display formatters for the Earn section (spec 050). Null-safe:
 * missing protocol data renders as "—", never a fabricated zero
 * (constitution III).
 */

/** Net APY fraction (0.043) → "4.30%"; null → "—". */
export function formatApy(netApy) {
  if (netApy == null) return '—'
  return `${(netApy * 100).toFixed(2)}%`
}

/** Total deposits in USD → compact "$1.2M" / "$450K"; null → "—". */
export function formatTvl(totalAssetsUsd) {
  if (totalAssetsUsd == null) return '—'
  if (totalAssetsUsd >= 1_000_000) return `$${(totalAssetsUsd / 1_000_000).toFixed(1)}M`
  if (totalAssetsUsd >= 1_000) return `$${(totalAssetsUsd / 1_000).toFixed(0)}K`
  return `$${totalAssetsUsd.toFixed(0)}`
}
