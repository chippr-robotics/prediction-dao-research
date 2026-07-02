// ── Wager timeline formatters (compact-chips redesign) ──────────────
// Shared by the 1v1 create-wager end-date timeline (FriendMarketsModal) and the
// open-challenge deadline timeline (OpenChallengeModal). Each stat tile shows a
// short clock + day so the timeline reads at a glance without a tall stack of
// labelled read-only rows.

/** "2:05 PM" — short local clock for a stat tile. */
export const formatTileClock = (date) =>
  date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "Jun 17" — short local month + day for a stat tile. */
export const formatTileDay = (date) =>
  date.toLocaleDateString([], { month: 'short', day: 'numeric' })

/**
 * Human duration between two dates as "1 day 0h" / "3h" — used for the
 * "lasts …" summary so the wager length is legible before committing.
 */
export const formatTimelineSpan = (from, to) => {
  let minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000))
  const days = Math.floor(minutes / 1440)
  minutes -= days * 1440
  const hours = Math.floor(minutes / 60)
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ${hours}h`
  return `${hours}h`
}
