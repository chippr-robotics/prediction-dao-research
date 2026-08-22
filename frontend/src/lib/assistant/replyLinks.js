/**
 * In-app links inside an assistant reply (spec 095).
 *
 * The gateway's system prompt tells the assistant to point members at plain in-app paths
 * (`/wallet?tab=earn`, `/apps`, `/privacy`) rather than inventing external URLs. This turns those
 * paths into shortcuts the member can press.
 *
 * IT IS AN ALLOW-LIST, NOT A PARSER. Only paths whose first segment is a route this app actually
 * serves become links; anything else stays as plain text in the bubble. A model can write any
 * string it likes, so the safe design is one where an unrecognised path is INERT — it is still
 * shown, because hiding what the assistant said would be its own kind of dishonesty, it simply is
 * not clickable. Nothing here ever produces an off-origin href.
 */

/** First path segments this app routes (see App.jsx). Everything else is left as text. */
const ROUTED_SEGMENTS = new Set([
  'app',
  'main',
  'fairwins',
  'wallet',
  'wagers',
  'apps',
  'pools',
  'vouchers',
  'admin',
  'terms',
  'risk',
  'privacy',
])

// A path starts at a boundary and runs to the first whitespace or closing punctuation. Trailing
// sentence punctuation is trimmed after the match, because "…open /wallet?tab=earn." is the normal
// way a sentence ends and `.` is not part of the route.
const PATH_RE = /(?:^|[\s("'`])(\/[A-Za-z0-9\-_/?&=#.%]*)/g

/** Sentence punctuation a path may collect on its way into a sentence. */
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}', "'", '"', '`'])

/**
 * Drop the trailing run of sentence punctuation.
 *
 * SCANNED, NOT MATCHED. The obvious `replace(/[.,;:!?)\]}'"`]+$/, '')` is quadratic on a rejecting
 * input — a long run of dots followed by anything else makes the engine restart the run at every
 * position — and this string comes out of a model's reply, which is the least controlled text this
 * app handles. Walking backwards from the end is one pass and produces the identical result.
 */
function stripTrailingPunctuation(value) {
  let end = value.length
  while (end > 0 && TRAILING_PUNCTUATION.has(value[end - 1])) end -= 1
  return value.slice(0, end)
}

/**
 * @param {string} text
 * @returns {Array<{path: string}>} unique in-app paths, in the order they appear
 */
export function extractInAppLinks(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const out = []
  const seen = new Set()
  for (const match of text.matchAll(PATH_RE)) {
    let path = stripTrailingPunctuation(match[1])
    if (path.length < 2) continue
    const segment = path.slice(1).split(/[/?#]/, 1)[0].toLowerCase()
    if (!ROUTED_SEGMENTS.has(segment)) continue
    if (seen.has(path)) continue
    seen.add(path)
    out.push({ path })
  }
  return out
}

export default extractInAppLinks
