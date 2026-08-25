/** Small display helpers (spec 095). Pure, and none of them invent a value for a missing one. */

/**
 * A Unix SECONDS timestamp as a readable local date, or an em dash when there is nothing to show.
 * The raw number is kept alongside by callers where it matters — a member comparing an expiry
 * against a signed grant needs the number, not only the prose.
 */
export function formatUnixSeconds(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—'
  try {
    return new Date(seconds * 1000).toLocaleString()
  } catch {
    return String(seconds)
  }
}

/** How long until a Unix-seconds instant, in whole days, or null when it has passed / is unknown. */
export function daysUntil(seconds, now = Date.now()) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  const remaining = seconds * 1000 - now
  if (remaining <= 0) return null
  return Math.floor(remaining / 86_400_000)
}

/** `0xabcd…1234` — for a 32-byte id in a table cell. Short values are returned unchanged. */
export function shortHex(value) {
  const text = String(value ?? '')
  if (text.length <= 16) return text
  return `${text.slice(0, 10)}…${text.slice(-6)}`
}

/** Stable pretty JSON for a response body. Never throws — a cyclic value falls back to String(). */
export function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
