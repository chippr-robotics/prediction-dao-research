/**
 * Venue-paid referral revenue (spec 089, FR-004; research R7).
 *
 * THE CENTRAL FACT HERE: OpenSea's referral address and the Gains/GMX codes are deliberately UNSET
 * in production (`infra/vm/gateway/docker-compose.yml` says so explicitly — link-outs go
 * unattributed rather than carrying a code that earns nothing). Polymarket's builder code IS set.
 *
 * So three of these four sources report `not-configured`, and that is the correct answer. It says
 * "we have not wired this up", which somebody can act on. Reporting `$0` would say "we wired it up
 * and it earns nothing", which is false and would quietly close the question.
 *
 * Where a venue exposes an earnings API it is polled. Where it does not, no revenue figure is
 * invented — venue earnings are never presented as billed revenue (research R1's rule, applied to
 * the revenue side).
 */
import { read, notConfigured, unreadable } from '../reading.js'

export function createReferralCollector({ config, fetchImpl = fetch }) {
  return async function collectReferral(source) {
    const r = config.referral

    switch (source.id) {
      case 'referral-opensea':
        if (!r.openSeaAddress) {
          return notConfigured('OPENSEA_REFERRAL_ADDRESS is unset — no referral code is registered, so there is nothing to earn')
        }
        // The address is registered but OpenSea publishes no earnings API we hold a credential for.
        // Reporting the attributable volume would be a different number wearing this one's label.
        return notConfigured('referral address registered, but no OpenSea earnings API is configured')

      case 'referral-gains':
        if (!r.gainsReferrer) {
          return notConfigured('PERPS_GAINS_REFERRER is unset — Gains has not whitelisted a referrer')
        }
        return notConfigured('referrer set, but no Gains earnings API is configured')

      case 'referral-gmx':
        if (!r.gmxRefCode) {
          return notConfigured('PERPS_GMX_REF_CODE is unset — no GMX referral code is registered')
        }
        return notConfigured('ref code set, but no GMX earnings API is configured')

      case 'referral-polymarket-rewards': {
        if (!r.polymarketBuilderCode) return notConfigured('POLYMARKET_BUILDER_CODE is unset')
        if (!r.polymarketApiKey) {
          return notConfigured('POLYMARKET_API_KEY is not set — builder rewards cannot be read')
        }

        const res = await fetchImpl(`${r.polymarketApiUrl}/builder/rewards?builder=${encodeURIComponent(r.polymarketBuilderCode)}`, {
          headers: { accept: 'application/json', 'poly-api-key': r.polymarketApiKey },
        })
        if (!res.ok) return unreadable(`polymarket builder rewards HTTP ${res.status}`)

        const body = await res.json()
        const total = body?.totalRewards ?? body?.total ?? body?.data?.totalRewards
        if (typeof total !== 'number' || !Number.isFinite(total)) {
          // An unrecognised shape is unreadable, not zero. Zero would report "the builder programme
          // pays us nothing" for a code that is live and accruing.
          return unreadable('polymarket builder rewards response had no recognisable total')
        }
        return read(total, 'USD')
      }

      default:
        return unreadable(`referral collector has no case for source '${source.id}'`)
    }
  }
}
