/**
 * Prepaid gas pool collector (spec 089, FR-015; research R6).
 *
 * The paymaster deposit and the executor EOAs are prepaid pools. When one empties, sponsorship or
 * relaying stops and members see failures — and today the ONLY signal that has ever produced is
 * members reporting failures (it happened on 2026-07-12). This collector is the reason the feature
 * has a P1 alerting story.
 *
 * The collector reports the BALANCE. Burn rate and runway are derived by `burnRate.js` from the
 * balance history, and the runway is deliberately absent rather than infinite when it cannot be
 * known — an `+Inf` runway reads to an alert rule as the healthiest possible pool.
 */
import { ethers } from 'ethers'
import { read, notConfigured } from '../reading.js'

/** EntryPoint v0.6: the paymaster's sponsorship deposit is held here, not on the paymaster. */
const ENTRYPOINT_IFACE = new ethers.Interface(['function balanceOf(address account) view returns (uint256)'])

export function createPoolsCollector({ config, providers, burn }) {
  /**
   * @param {object} source catalogue entry carrying `pool`
   */
  return async function collectPool(source) {
    const poolId = source.pool
    const pool = config.pools[poolId]
    if (!pool) return notConfigured(`pool '${poolId}' is not configured`)

    const provider = providers[pool.chain]
    if (!provider) return notConfigured(`no provider for chain ${pool.chain}`)

    let balanceWei
    if (pool.kind === 'paymaster') {
      if (!config.contracts.paymaster) return notConfigured('PAYMASTER_ADDRESS_137 is not set')
      // Read the deposit from the EntryPoint. Reading the paymaster's own native balance would be a
      // different and misleading number: a paymaster holding 0 native can still be fully funded,
      // because the deposit lives at the EntryPoint.
      const data = ENTRYPOINT_IFACE.encodeFunctionData('balanceOf', [config.contracts.paymaster])
      const raw = await provider.call({ to: config.contracts.entryPoint, data })
      ;[balanceWei] = ENTRYPOINT_IFACE.decodeFunctionResult('balanceOf', raw)
    } else {
      if (!pool.address) return notConfigured(`no address configured for pool '${poolId}'`)
      balanceWei = await provider.getBalance(pool.address)
    }

    const balance = Number(ethers.formatEther(balanceWei))
    burn.observe(poolId, balance)

    return read(balance, pool.unit, { labels: { pool: poolId, chain: String(pool.chain) } })
  }
}

/**
 * Emit the derived pool series: balance, burn rate, runway, and the window's spend as cost.
 *
 * Called by the server after the scheduler's readings are in, because these are functions of the
 * balance history rather than independent reads.
 *
 * @param {object} registry
 * @param {Array<{source: object, reading: object}>} readings
 * @param {object} burn burn tracker
 * @param {(unit: string) => number|null} usdRate  price lookup; null when unknown
 */
export function emitPoolSeries(registry, readings, burn, usdRate) {
  for (const { source, reading } of readings) {
    if (!source.pool) continue

    const poolId = source.pool
    const chain = String(source.chains?.[0] ?? '')

    if (reading.state !== 'read') continue

    registry.emit(
      'pool_balance',
      'gauge',
      'Current balance of a prepaid gas pool, in its native unit.',
      { pool: poolId, unit: source.unit, chain },
      reading.value,
    )

    const rate = burn.burnRatePerSec(poolId)
    if (rate != null) {
      registry.emit(
        'pool_burn_rate',
        'gauge',
        'Trailing-window burn per second for a prepaid pool, counting only decreases so a top-up cannot read as negative burn.',
        { pool: poolId, unit: source.unit, chain },
        rate,
      )
    }

    // ABSENT, not infinite, when unknowable. This is the single most important line in the file:
    // an +Inf here would make every runway alert permanently green for a pool nobody can measure.
    const runway = burn.runwaySeconds(poolId, reading.value)
    if (runway != null) {
      registry.emit(
        'pool_runway_seconds',
        'gauge',
        'Seconds until a prepaid pool empties at the trailing burn rate. Absent when the burn rate is zero or not yet known.',
        { pool: poolId, chain },
        runway,
      )
    }

    // The pool's spend over the window, converted only if a price is actually available (FR-013).
    const spent = burn.spentInWindow(poolId)
    const price = usdRate(source.unit)
    if (spent != null && price != null) {
      registry.emit(
        'cost_usd_total',
        'counter',
        source.meaning,
        { source: source.id, basis: source.basis, unit: 'USD', chain },
        spent * price,
      )
    }
  }
}
