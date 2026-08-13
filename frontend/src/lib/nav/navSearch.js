/**
 * Nav search matching — pure scoring over the indexed nav tree (config/navSearchIndex.js).
 *
 * The rule in one line: a query matches an entry when EVERY term the member typed is found
 * somewhere in that entry's label, summary, or keywords. Terms are ANDed because "earn stake"
 * should narrow, not widen; each term is matched as a TOKEN PREFIX, so "morph" finds "morpho" and
 * "multi" finds "multisig" without anyone hand-writing stems into the index. Labels are also
 * matched mid-token ("cover" → "Recovery"), which is what the label-only filter did before this
 * file existed and what members already rely on.
 *
 * Scores exist only to ORDER results, never to include or exclude one — a term either matched or
 * it did not. Higher is better: what you typed appearing in a name beats it appearing in a
 * keyword, which beats it appearing in a sentence.
 */

const LABEL_PREFIX = 100
const LABEL_TOKEN = 80
const LABEL_SUBSTRING = 60
const KEYWORD_EXACT = 55
const KEYWORD_TOKEN = 45
const SUMMARY_TOKEN = 20

/** Split a raw query into lowercase terms. Empty/whitespace-only yields an empty list. */
export function queryTerms(query) {
  return String(query ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

const tokens = (text) => String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

const someTokenStartsWith = (text, term) => tokens(text).some((token) => token.startsWith(term))

/** Best score for one term against one entry, or 0 when the term is absent from all of it. */
function scoreTerm(entry, term) {
  const label = String(entry?.label ?? '').toLowerCase()
  if (label.startsWith(term)) return LABEL_PREFIX
  if (someTokenStartsWith(label, term)) return LABEL_TOKEN
  // Mid-token label matching is deliberately kept ("cover" → "Recovery"): it is the behaviour the
  // menu filter shipped with, and narrowing it now would break muscle memory to fix nothing.
  if (label.includes(term)) return LABEL_SUBSTRING

  const keywords = Array.isArray(entry?.keywords) ? entry.keywords : []
  let best = 0
  for (const keyword of keywords) {
    const value = String(keyword).toLowerCase()
    if (value === term) return KEYWORD_EXACT
    if (someTokenStartsWith(value, term)) best = Math.max(best, KEYWORD_TOKEN)
  }
  if (best) return best

  if (someTokenStartsWith(entry?.summary, term)) return SUMMARY_TOKEN
  return 0
}

/**
 * Total score for `entry` against `terms`, or 0 if any term is missing.
 * @param {{label?: string, summary?: string, keywords?: string[]}} entry
 * @param {string[]} terms — from `queryTerms`
 */
export function scoreEntry(entry, terms) {
  if (!terms.length) return 0
  let total = 0
  for (const term of terms) {
    const score = scoreTerm(entry, term)
    if (!score) return 0
    total += score
  }
  return total
}

/** Convenience predicate for callers that only need yes/no. */
export function matchesQuery(entry, query) {
  return scoreEntry(entry, queryTerms(query)) > 0
}

/**
 * Rank `entries` against `terms`, dropping non-matches. Ties keep index order, so a section's own
 * ordering (Lend, Rewards, Stake, Supply) survives into the results rather than being reshuffled
 * by an implementation detail of the sort.
 */
export function rankEntries(entries, terms) {
  if (!terms.length) return []
  return entries
    .map((entry, index) => ({ entry, index, score: scoreEntry(entry, terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.entry)
}
