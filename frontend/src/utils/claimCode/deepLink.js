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
