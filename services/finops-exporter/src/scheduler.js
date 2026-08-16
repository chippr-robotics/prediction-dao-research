/**
 * Per-source collection scheduling with failure isolation (spec 089, FR-007, FR-009).
 *
 * Two properties, both of which are the point:
 *
 *   1. INTERVALS ARE PER SOURCE. An on-chain balance changes every block; the BigQuery billing
 *      export lags hours and is billable to query. One global interval would either make the runway
 *      alerts useless or make the exporter a cost center of its own (FR-029 would then be measuring
 *      the wrong thing about us).
 *
 *   2. ONE FAILING SOURCE FAILS ALONE. A collector that throws, hangs, or returns nonsense yields
 *      `unreadable` for its own source and touches nothing else. A scrape NEVER fails because a
 *      vendor is down — a 500 on /metrics would blank every panel including the ones that are fine.
 *
 * The scheduler holds the last Reading per source and serves it to the scrape. Scrapes are therefore
 * cheap and constant-time, and a slow vendor cannot stall Prometheus.
 */
import { attempt, notConfigured, unreadable } from './reading.js'

/** How much older than its own interval a reading may get before it counts as stale. */
const STALE_FACTOR = 3

export function createScheduler({ sources, collectors, now = () => Date.now(), log = console.warn }) {
  /** @type {Map<string, {reading: object, collectedAt: number, durationMs: number}>} */
  const state = new Map()
  const timers = []
  let running = false

  function collectorFor(source) {
    const c = collectors[source.collector]
    if (!c) {
      // A catalogue entry naming a collector that does not exist is a build-time mistake, but it
      // must not take the process down at runtime: the other twenty-four sources are still useful.
      return async () => unreadable(`no collector named '${source.collector}' is registered`)
    }
    return c
  }

  async function collectOne(source) {
    const started = now()
    const fn = collectorFor(source)
    const reading = await attempt(() => fn(source))
    const durationMs = now() - started

    state.set(source.id, { reading, collectedAt: now(), durationMs })

    if (reading.state === 'unreadable') {
      // Reasons are already redacted by the Reading constructor (FR-025).
      log(`[finops] ${source.id}: unreadable — ${reading.reason}`)
    }
    return reading
  }

  return {
    /** Collect everything once. Used at boot so the first scrape is not empty, and by tests. */
    async collectAll() {
      await Promise.all(sources.map((s) => collectOne(s)))
    },

    start() {
      if (running) return
      running = true
      for (const source of sources) {
        // A `planned` source has nothing to collect — it declares no metric by construction.
        if (source.status === 'planned') {
          state.set(source.id, { reading: notConfigured('not yet live'), collectedAt: now(), durationMs: 0 })
          continue
        }
        const t = setInterval(() => {
          collectOne(source).catch((err) => log(`[finops] scheduler: ${source.id} ${err?.message ?? err}`))
        }, source.interval * 1000)
        // Never hold the event loop open for a timer; the HTTP server owns the process lifetime.
        t.unref?.()
        timers.push(t)
      }
    },

    stop() {
      for (const t of timers) clearInterval(t)
      timers.length = 0
      running = false
    },

    /**
     * The latest Reading per source.
     *
     * A source that has never been collected reports `unreadable`, not a missing entry — "we have
     * not managed to read this yet" is genuinely unreadable, and silently omitting it would drop it
     * off the partial-total check that is supposed to name it (FR-011).
     */
    readings() {
      return sources.map((source) => {
        const entry = state.get(source.id)
        if (!entry) {
          return { source, reading: unreadable('not collected yet'), durationMs: null, stale: true }
        }
        const age = (now() - entry.collectedAt) / 1000
        return {
          source,
          reading: entry.reading,
          durationMs: entry.durationMs,
          stale: age > source.interval * STALE_FACTOR,
        }
      })
    },
  }
}
