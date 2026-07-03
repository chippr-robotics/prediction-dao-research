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

/** Format a unix-ms instant as a value for <input type="datetime-local"> (local time, minute precision). */
export const toDatetimeLocal = (ms) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

/** Parse a <input type="datetime-local"> string back to unix ms, or NaN if empty/invalid. */
export const fromDatetimeLocal = (value) => (value ? new Date(value).getTime() : NaN)

// ── Shared timeline interaction math (spec 038) ──────────────────────
// Used by both the DeadlineTimeline drag/keyboard handlers and SetTimeModal
// so every entry point enforces identical bounds (FR-004/FR-006).

export const HOUR_MS = 3600 * 1000
export const DAY_MS = 24 * HOUR_MS

/** Clamp a unix-ms instant to an inclusive [min, max] range. */
export const clampToRange = (ms, min, max) => Math.min(max, Math.max(min, ms))

/** Step a unix-ms instant by a number of minutes (negative to step backward). */
export const stepByMinutes = (ms, minutes) => ms + minutes * 60000

/**
 * Push `laterMs` forward so it stays at least `minGapMs` after `earlierMs`.
 * Used to keep adjacent milestone dots individually grabbable instead of
 * collapsing onto each other.
 */
export const enforceMinGap = (earlierMs, laterMs, minGapMs) =>
  laterMs - earlierMs < minGapMs ? earlierMs + minGapMs : laterMs
