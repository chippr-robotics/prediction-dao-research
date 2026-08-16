/**
 * The metric registry: turns Readings into Prometheus text exposition (spec 089).
 *
 * Hand-rolled rather than pulling in a Prometheus client. The format is a handful of rules and this
 * file is the one place they live; the alternative was a dependency whose only job is string
 * concatenation, in a service whose whole point is watching what things cost.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE (contracts/metrics.md):
 *
 *   A value metric is emitted ONLY in state `read`. Never a zero placeholder.
 *
 * Every panel and every alert rule depends on "absent means unknown". If this file ever emits a 0
 * for an unreadable source, every dashboard downstream becomes confidently wrong and nothing about
 * it looks broken.
 */
import { READ, NOT_CONFIGURED } from './reading.js'

const PREFIX = 'fairwins_finops_'

/** Prometheus label values escape backslash, double-quote and newline. Nothing else. */
function escapeLabelValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function renderLabels(labels) {
  const entries = Object.entries(labels).filter(([, v]) => v != null && v !== '')
  if (!entries.length) return ''
  return `{${entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',')}}`
}

/** A Prometheus sample value. Integers stay integers; floats get enough precision to be exact. */
function renderValue(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(15)))
}

export function createRegistry() {
  /** @type {Map<string, {type: string, help: string, samples: Array<{labels: object, value: number}>}>} */
  const families = new Map()

  function family(name, type, help) {
    const key = name.startsWith(PREFIX) ? name : PREFIX + name
    if (!families.has(key)) families.set(key, { type, help, samples: [] })
    return families.get(key)
  }

  return {
    /** Emit a sample unconditionally. Use only for metrics that are facts about the exporter itself. */
    emit(name, type, help, labels, value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return
      family(name, type, help).samples.push({ labels, value })
    },

    /**
     * Record one source's Reading.
     *
     * Always emits the honesty triplet. Emits the VALUE metric only on `read` — which is the whole
     * contract, and is why this is the only function collectors' results flow through.
     *
     * @param {object} source   catalogue entry
     * @param {object} reading  a Reading
     * @param {object} [labels] extra labels for the value sample (e.g. chain, gcp_service)
     */
    record(source, reading, labels = {}) {
      const configured = reading.state === NOT_CONFIGURED ? 0 : 1
      const up = reading.state === READ ? 1 : 0

      this.emit(
        'source_configured',
        'gauge',
        '1 when a source has the configuration and credentials it needs, 0 when it is simply not wired up.',
        { source: source.id, kind: source.kind, status: source.status },
        configured,
      )

      // A `planned` source is not-configured by construction and has no `up` to report: it has
      // nothing to read yet. Emitting up=0 would make it indistinguishable from a live source that
      // is broken, and it would light up every staleness alert forever (FR-014).
      if (source.status !== 'planned') {
        this.emit(
          'source_up',
          'gauge',
          '1 when the last collection succeeded, 0 when it failed. Read with source_configured to get the three states.',
          { source: source.id, kind: source.kind },
          up,
        )
      }

      if (reading.state !== READ) return

      this.emit(
        'source_last_success_timestamp_seconds',
        'gauge',
        'Unix seconds of the last successful read. Absent if this source has never been read.',
        { source: source.id },
        Math.floor(reading.at / 1000),
      )

      this.emit(
        source.metric,
        source.metric.endsWith('_total') ? 'counter' : 'gauge',
        source.meaning,
        { source: source.id, unit: reading.unit ?? source.unit, ...source.extraLabels, ...reading.labels, ...labels },
        reading.value,
      )
    },

    /** Prometheus text exposition format 0.0.4. */
    render() {
      const out = []
      for (const [name, { type, help, samples }] of families) {
        if (!samples.length) continue
        // HELP is single-line; catalogue `meaning` prose is deliberately long, so it is collapsed.
        out.push(`# HELP ${name} ${help.replace(/\s+/g, ' ').trim()}`)
        out.push(`# TYPE ${name} ${type}`)
        for (const { labels, value } of samples) {
          out.push(`${name}${renderLabels(labels)} ${renderValue(value)}`)
        }
      }
      return out.join('\n') + '\n'
    },

    /** For tests and the /v1/finops/summary endpoint. */
    snapshot() {
      return Object.fromEntries(
        [...families].map(([name, f]) => [name, f.samples.map((s) => ({ ...s.labels, value: s.value }))]),
      )
    },
  }
}
