/**
 * Open-challenge deep links (feature 024). A four-word claim code is encoded into an app URL so it can be
 * shared as a QR or link; scanning/opening it lands the taker on the Open Challenge modal (Taker tab) with
 * the code pre-filled. The code is the sharable secret by design — whoever holds it can take the challenge.
 */

/** Build the take-a-challenge deep link for a code: `<origin>/app?oc=take&code=<encoded words>`. */
export function buildTakeChallengeUrl(code) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''
  return `${origin}/app?oc=take&code=${encodeURIComponent(code)}`
}

/** Parse a take-a-challenge deep link's query string → the code, or null if it isn't one. */
export function parseTakeChallengeParams(search) {
  const params = new URLSearchParams(search || '')
  if (params.get('oc') === 'take' && params.get('code')) return params.get('code')
  return null
}

/**
 * The same query string with ONLY the take-a-challenge params removed, ready to navigate to.
 *
 * Consuming a code has to clear it from the URL — otherwise it re-fires on re-render and gets
 * bookmarked with the secret in it. The obvious way to do that is to navigate to `location.pathname`
 * and drop the query wholesale, which is what the wager surface did while it owned a whole route
 * (`/wagers`) where nothing else lived in the query. It now renders inside `/wallet`, where the
 * query is what selects the section and the view — so dropping it would land the member on the
 * Account tab in the middle of accepting a challenge. Strip the two params, keep everything else.
 *
 * @returns {string} `''` when nothing is left, otherwise a leading-`?` query string
 */
export function stripTakeChallengeParams(search) {
  const params = new URLSearchParams(search || '')
  params.delete('oc')
  params.delete('code')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}
