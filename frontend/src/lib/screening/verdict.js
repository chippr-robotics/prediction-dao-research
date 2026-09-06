/**
 * From a set of source readings to ONE word a member can act on — and the rule that makes the
 * green one honest.
 *
 * A reading is one source's answer about one address on one chain:
 *
 *   { status: 'read', flagged: boolean }   the list answered
 *   { status: 'unreadable', reason }       it could not be asked — NOT an answer
 *
 * The verdict over a set of them:
 *
 *   flagged     ANY source answered "yes, listed". One is enough: the lists are independent
 *               and a member who is clear on four and frozen on the fifth still loses the funds.
 *   screened    EVERY configured source answered, and every answer was clear. This is the only
 *               state that renders green, and it requires `unreadable === 0`: a source that did
 *               not answer is not a source that said no.
 *   partial     nothing flagged, at least one answer, at least one source unanswered. Not green.
 *   unscreened  no source answered at all — none configured for these chains, or all unreadable.
 *
 * The asymmetry is deliberate and is the whole feature: a flag is a positive fact from a named
 * list and stands on its own; "clear" is the absence of a flag from EVERY list, so one missing
 * list means the absence was never established.
 */

export const VERDICTS = Object.freeze({
  SCREENED: 'screened',
  FLAGGED: 'flagged',
  PARTIAL: 'partial',
  UNSCREENED: 'unscreened',
})

export const READ = 'read'
export const UNREADABLE = 'unreadable'

/** @param {Array<{status: string, flagged?: boolean}>} readings */
export function countReadings(readings = []) {
  let read = 0
  let flagged = 0
  let unreadable = 0
  for (const r of readings) {
    if (!r) continue
    if (r.status === READ) {
      read += 1
      if (r.flagged) flagged += 1
    } else if (r.status === UNREADABLE) {
      unreadable += 1
    }
  }
  return { read, flagged, unreadable, total: read + unreadable }
}

/** @param {Array<{status: string, flagged?: boolean}>} readings */
export function deriveVerdict(readings = []) {
  const c = countReadings(readings)
  if (c.flagged > 0) return VERDICTS.FLAGGED
  if (c.read === 0) return VERDICTS.UNSCREENED
  if (c.unreadable > 0) return VERDICTS.PARTIAL
  return VERDICTS.SCREENED
}

/** Short pill labels. Words, never colour alone (WCAG 1.4.1). */
export const VERDICT_LABELS = Object.freeze({
  [VERDICTS.SCREENED]: 'Screened clear',
  [VERDICTS.FLAGGED]: 'Flagged',
  [VERDICTS.PARTIAL]: 'Partly screened',
  [VERDICTS.UNSCREENED]: 'Unscreened',
})

function joinNames(names) {
  const uniq = [...new Set(names.filter(Boolean))]
  if (uniq.length <= 1) return uniq.join('')
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`
  return `${uniq.slice(0, -1).join(', ')} and ${uniq[uniq.length - 1]}`
}

/**
 * One sentence for the verdict, naming what it rests on. `nameForChain` turns a chainId into
 * the network's display name; the default is honest rather than pretty.
 *
 * @param {{ verdict: string, readings: any[], uncovered?: number[] }} result
 * @param {(chainId:number) => string} [nameForChain]
 */
export function describeVerdict(result, nameForChain = (id) => `chain ${id}`) {
  const readings = result?.readings || []
  const c = countReadings(readings)
  const networks = new Set(readings.filter((r) => r.status === READ).map((r) => r.chainId))
  switch (result?.verdict) {
    case VERDICTS.FLAGGED: {
      const hits = readings.filter((r) => r.status === READ && r.flagged)
      const where = joinNames(hits.map((r) => `${r.label} on ${nameForChain(r.chainId)}`))
      return `This address is flagged by sanctions screening: ${where}. Value sent to it may be refused on-chain or frozen.`
    }
    case VERDICTS.SCREENED:
      return `Screened clear by ${c.read} ${c.read === 1 ? 'source' : 'sources'} on ${networks.size} ${networks.size === 1 ? 'network' : 'networks'}.`
    case VERDICTS.PARTIAL: {
      const missing = readings.filter((r) => r.status === UNREADABLE)
      const names = joinNames(missing.map((r) => `${r.label} on ${nameForChain(r.chainId)}`))
      return `Partly screened: ${c.read} of ${c.total} sources answered clear; ${names} could not be read. Not a clean bill.`
    }
    case VERDICTS.UNSCREENED:
    default:
      if (c.total === 0) {
        const un = (result?.uncovered || []).map(nameForChain)
        return un.length
          ? `No screening source covers ${joinNames(un)}. This address could not be checked.`
          : 'This address could not be screened.'
      }
      return 'This address could not be screened: no source answered. Proceed with caution.'
  }
}
