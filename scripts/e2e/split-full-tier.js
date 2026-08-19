#!/usr/bin/env node
/**
 * Split the on-chain tier's specs across shard legs (spec 094, FR-028).
 *
 * Legal only because per-spec chain isolation (`chainCheckpoint`, #1222) made specs order-
 * independent. Before that, run order decided which specs passed, and splitting the list would
 * have changed the results rather than just the wall clock.
 *
 * LONGEST-PROCESSING-TIME-FIRST, not round robin. The specs are nowhere near equal — one lifecycle
 * spec runs many minutes while others run one — so balancing spec COUNT leaves the critical path
 * barely shorter than a serial run, which would be an honest measurement of nothing.
 *
 * Usage:
 *   node scripts/e2e/split-full-tier.js --shards 4 --index 0        # newline list for leg 0
 *   node scripts/e2e/split-full-tier.js --shards 4 --index 0 --csv  # comma list for `cypress --spec`
 *   node scripts/e2e/split-full-tier.js --shards 4 --print-all      # every leg, with predicted seconds
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const SPEC_DIR = path.join(ROOT, 'frontend', 'cypress', 'e2e', 'full')
const WEIGHTS = path.join(ROOT, 'frontend', 'cypress', 'coverage', 'full-tier-weights.json')

function parseArgs(argv) {
  const args = { shards: 4, index: null, csv: false, printAll: false }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--shards') args.shards = Number(argv[++i])
    else if (arg === '--index') args.index = Number(argv[++i])
    else if (arg === '--csv') args.csv = true
    else if (arg === '--print-all') args.printAll = true
    else throw new Error(`split-full-tier: unknown argument ${arg}`)
  }
  if (!Number.isInteger(args.shards) || args.shards < 1) throw new Error('--shards must be a positive integer')
  if (args.index !== null && (args.index < 0 || args.index >= args.shards)) {
    throw new Error(`--index must be within 0..${args.shards - 1}`)
  }
  return args
}

/** Spec paths relative to the frontend workspace, which is where cypress runs. */
function specsOnDisk() {
  return fs
    .readdirSync(SPEC_DIR)
    .filter((f) => f.endsWith('.cy.js'))
    .sort()
    .map((f) => `cypress/e2e/full/${f}`)
}

function loadWeights() {
  if (!fs.existsSync(WEIGHTS)) return { specs: {}, measuredAt: null }
  return JSON.parse(fs.readFileSync(WEIGHTS, 'utf8'))
}

/**
 * A spec with no recorded duration gets the file mean and is REPORTED. Dropping it would remove it
 * from the merge gate silently, which is the exact failure this feature exists to prevent — so the
 * estimate is deliberately loud rather than convenient.
 */
function weigh(specs, weights) {
  const known = specs.map((s) => weights.specs[s]).filter((n) => typeof n === 'number')
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 60
  const estimated = []
  const weighed = specs.map((spec) => {
    const seconds = weights.specs[spec]
    if (typeof seconds === 'number') return { spec, seconds, estimated: false }
    estimated.push(spec)
    return { spec, seconds: mean, estimated: true }
  })
  return { weighed, estimated, mean }
}

/** Longest-first bin packing onto the currently lightest leg. */
function split(weighed, shards) {
  const legs = Array.from({ length: shards }, () => ({ specs: [], seconds: 0 }))
  for (const item of [...weighed].sort((a, b) => b.seconds - a.seconds || a.spec.localeCompare(b.spec))) {
    const lightest = legs.reduce((min, leg) => (leg.seconds < min.seconds ? leg : min), legs[0])
    lightest.specs.push(item.spec)
    lightest.seconds += item.seconds
  }
  // Keep each leg's spec list in file order so a run log reads predictably.
  for (const leg of legs) leg.specs.sort()
  return legs
}

function main() {
  const args = parseArgs(process.argv)
  const specs = specsOnDisk()
  if (!specs.length) {
    console.error('::error::split-full-tier found no specs under cypress/e2e/full — refusing to emit an empty shard.')
    process.exit(1)
  }

  const weights = loadWeights()
  const { weighed, estimated } = weigh(specs, weights)
  const legs = split(weighed, args.shards)

  if (estimated.length) {
    // stderr so it never contaminates the spec list on stdout.
    console.error(
      `::warning::split-full-tier estimated ${estimated.length} unmeasured spec(s) at the file mean: ${estimated.join(', ')}. ` +
        'Re-record frontend/cypress/coverage/full-tier-weights.json to rebalance.'
    )
  }

  if (args.printAll || args.index === null) {
    const total = legs.reduce((a, l) => a + l.seconds, 0)
    console.log(`${specs.length} specs across ${args.shards} legs (measured ${weights.measuredAt || 'never'})`)
    console.log(`serial total ≈ ${Math.round(total)}s; predicted critical path ≈ ${Math.round(Math.max(...legs.map((l) => l.seconds)))}s`)
    legs.forEach((leg, i) => {
      console.log(`\n  leg ${i} — ≈${Math.round(leg.seconds)}s`)
      for (const spec of leg.specs) console.log(`    ${spec}`)
    })
    return
  }

  const leg = legs[args.index]
  process.stdout.write(args.csv ? leg.specs.join(',') : leg.specs.join('\n') + '\n')
}

if (require.main === module) main()

module.exports = { split, weigh, specsOnDisk }
