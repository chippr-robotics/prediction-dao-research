/**
 * FX rates for USD roll-ups (spec 089, FR-013).
 *
 * Reads a Chainlink price feed rather than calling a price API. Three reasons, in order:
 *
 *   1. No credential. One fewer secret to store, rotate and leak.
 *   2. It is already reachable over the RPC the exporter has.
 *   3. `latestRoundData` carries `updatedAt`, so the rate's AGE is a fact we publish rather than an
 *      assumption we make. A stale rate quietly applied is exactly the dishonesty FR-013 forbids.
 *
 * When no rate is available, NO USD figure is produced anywhere. The per-unit native subtotals are
 * still exact and still shown; a guessed dollar figure would be neither.
 */
import { ethers } from 'ethers'
import { redact } from '../reading.js'

const FEED_IFACE = new ethers.Interface([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
])

export function createFxReader({ config, providers, log = console.warn, now = () => Date.now() }) {
  /** @type {{price: number|null, at: number, updatedAt: number|null, stale: boolean}} */
  let cached = { price: null, at: 0, updatedAt: null, stale: true }

  async function refresh() {
    const feed = config.fx.polUsdFeed
    const provider = providers[config.fx.feedChain]
    if (!feed || !provider) {
      cached = { price: null, at: now(), updatedAt: null, stale: true }
      return cached
    }

    try {
      const [rawRound, rawDecimals] = await Promise.all([
        provider.call({ to: feed, data: FEED_IFACE.encodeFunctionData('latestRoundData') }),
        provider.call({ to: feed, data: FEED_IFACE.encodeFunctionData('decimals') }),
      ])
      const round = FEED_IFACE.decodeFunctionResult('latestRoundData', rawRound)
      const [decimals] = FEED_IFACE.decodeFunctionResult('decimals', rawDecimals)

      const answer = round[1]
      const updatedAt = Number(round[3]) * 1000

      // A non-positive answer is a broken feed, not a price of zero. Treating it as zero would make
      // every USD cost figure collapse to nothing, which reads as excellent news.
      if (answer <= 0n) {
        cached = { price: null, at: now(), updatedAt, stale: true }
        return cached
      }

      const price = Number(ethers.formatUnits(answer, Number(decimals)))
      const ageSec = (now() - updatedAt) / 1000
      cached = { price, at: now(), updatedAt, stale: ageSec > config.fx.maxAgeSec }
    } catch (err) {
      log(`[finops] fx: price feed unreadable — ${redact(String(err?.message ?? err))}`)
      cached = { price: null, at: now(), updatedAt: null, stale: true }
    }
    return cached
  }

  return {
    refresh,

    /**
     * USD per unit, or `null` when unknown.
     *
     * A STALE rate returns null too. Publishing a converted figure from a rate we know is old is
     * indistinguishable, on the panel, from one converted at a current rate.
     */
    rateFor(unit) {
      if (unit === 'USD' || unit === 'USDC') return 1
      // Mordor is a testnet: its gas has no market price, and 0 is the honest answer rather than an
      // absence. It is why relayer-gas-mordor's meaning says only the native drawdown matters.
      if (unit === 'ETC') return 0
      if (unit === 'POL') return cached.stale ? null : cached.price
      return null
    },

    /** Publish the rate and its age so a conversion can be audited from the dashboard (FR-013). */
    emit(registry) {
      if (cached.price != null) {
        registry.emit(
          'fx_rate',
          'gauge',
          'USD price used for cost conversions, read from a Chainlink feed.',
          { unit: 'POL', source: 'chainlink', stale: String(cached.stale) },
          cached.price,
        )
      }
      if (cached.updatedAt != null) {
        registry.emit(
          'fx_age_seconds',
          'gauge',
          'Age of the FX rate at last read. A conversion made from a stale rate must be visibly stale, never silently applied.',
          { unit: 'POL', source: 'chainlink' },
          Math.max(0, (now() - cached.updatedAt) / 1000),
        )
      }
    },

    _cached: () => cached,
  }
}
