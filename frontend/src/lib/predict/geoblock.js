/**
 * Polymarket regional gate (spec 057). Polymarket blocks order placement in restricted regions
 * (e.g. US persons) as a matter of THEIR policy — FairWins respects that and never tries to bypass it.
 *
 * We check Polymarket's own public geoblock endpoint up front so a restricted member sees an honest
 * "not available in your region" state with a deep link OUT to the actual Polymarket site for that
 * market (they can trade there under Polymarket's own rules), rather than a dead Buy/Sell button or a
 * confusing failed submit. Allowed-region members trade in-app.
 *
 * The endpoint serves `Access-Control-Allow-Origin: *`, so this is a direct browser call. Fail OPEN on a
 * network error (return not-blocked) — the CLOB still enforces the block server-side (403) as a backstop,
 * so a transient geoblock-check failure never silently strands a legitimate member; the submit path
 * surfaces any real block honestly.
 */
const GEOBLOCK_URL = 'https://polymarket.com/api/geoblock'
const TIMEOUT_MS = 8_000

/**
 * @returns {Promise<{ blocked: boolean, country?: string, region?: string, ok: boolean }>}
 *   `ok:false` means the check itself failed (treated as not-blocked; the CLOB is the real gate).
 */
export async function checkGeoblock({ fetchImpl = fetch, url = GEOBLOCK_URL } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetchImpl(url, { signal: controller.signal })
    if (!res.ok) return { blocked: false, ok: false }
    const body = await res.json()
    return { blocked: Boolean(body?.blocked), country: body?.country, region: body?.region, ok: true }
  } catch {
    return { blocked: false, ok: false }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The canonical Polymarket URL for a market — the deep link we hand a restricted-region member so they
 * can trade on Polymarket directly. Prefers the normalized `polymarketUrl`; falls back to the slug.
 */
export function polymarketMarketUrl(market) {
  if (market?.polymarketUrl) return market.polymarketUrl
  if (market?.slug) return `https://polymarket.com/event/${market.slug}`
  return 'https://polymarket.com'
}
