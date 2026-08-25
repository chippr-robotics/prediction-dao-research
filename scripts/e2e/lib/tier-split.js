#!/usr/bin/env node
/**
 * Shared shard-splitting for the Cypress tiers (spec 094, FR-028).
 *
 * Extracted from `split-full-tier.js` when the NO-CHAIN tier needed the same treatment (#1249):
 * that tier had grown to 34:29 a leg — slower than the on-chain tier that compiles contracts,
 * boots a chain and sends real transactions — for the single structural reason that the on-chain
 * tier was sharded four ways and it was not. Two copies of this logic would have drifted, and the
 * half that drifted would have been the unmeasured-spec warning, which is the part that stops a
 * spec silently leaving the merge gate.
 *
 * LONGEST-PROCESSING-TIME-FIRST, not round robin. The specs are nowhere near equal — one spec runs
 * three minutes while another runs one second — so balancing spec COUNT leaves the critical path
 * barely shorter than a serial run, which would be an honest measurement of nothing.
 *
 * Splitting is only legal for a tier whose specs are ORDER-INDEPENDENT. The on-chain tier earned
 * that with per-spec chain isolation (`chainCheckpoint`, #1222); the no-chain tier has it by
 * construction, having no chain to carry state in.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..', '..')
const E2E_DIR = path.join(ROOT, 'frontend', 'cypress', 'e2e')
const COVERAGE_DIR = path.join(ROOT, 'frontend', 'cypress', 'coverage')

/**
 * Spec paths relative to the FRONTEND workspace, which is where cypress runs.
 * @param {string[]} dirs - directory names under cypress/e2e, e.g. ['fast', 'passkey']
 */
function specsOnDisk(dirs) {
  return dirs
    .flatMap((dir) => {
      const abs = path.join(E2E_DIR, dir)
      if (!fs.existsSync(abs)) return []
      return fs
        .readdirSync(abs)
        .filter((f) => f.endsWith('.cy.js'))
        .map((f) => `cypress/e2e/${dir}/${f}`)
    })
    .sort()
}

function loadWeights(fileName) {
  const file = path.join(COVERAGE_DIR, fileName)
  if (!fs.existsSync(file)) return { specs: {}, measuredAt: null }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
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

function parseArgs(argv, { extra = {} } = {}) {
  const args = { shards: 4, index: null, csv: false, printAll: false, ...extra }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--shards') args.shards = Number(argv[++i])
    else if (arg === '--index') args.index = Number(argv[++i])
    else if (arg === '--csv') args.csv = true
    else if (arg === '--print-all') args.printAll = true
    else if (arg.startsWith('--') && arg.slice(2) in extra) args[arg.slice(2)] = argv[++i]
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!Number.isInteger(args.shards) || args.shards < 1) throw new Error('--shards must be a positive integer')
  if (args.index !== null && (args.index < 0 || args.index >= args.shards)) {
    throw new Error(`--index must be within 0..${args.shards - 1}`)
  }
  return args
}

/**
 * Run one splitter end to end: resolve specs, weigh, pack, and print either the whole plan or one
 * leg's spec list. `label` names the tool in errors and warnings so a CI annotation says which
 * tier it came from.
 */
function run({ label, dirs, weightsFile, args }) {
  const specs = specsOnDisk(dirs)
  if (!specs.length) {
    console.error(`::error::${label} found no specs under ${dirs.join(', ')} — refusing to emit an empty shard.`)
    process.exit(1)
  }

  const weights = loadWeights(weightsFile)
  const { weighed, estimated } = weigh(specs, weights)
  const legs = split(weighed, args.shards)

  if (estimated.length) {
    // stderr so it never contaminates the spec list on stdout.
    console.error(
      `::warning::${label} estimated ${estimated.length} unmeasured spec(s) at the file mean: ${estimated.join(', ')}. ` +
        `Re-record frontend/cypress/coverage/${weightsFile} to rebalance.`
    )
  }

  if (args.printAll || args.index === null) {
    const total = legs.reduce((a, l) => a + l.seconds, 0)
    console.log(`${specs.length} specs across ${args.shards} legs (measured ${weights.measuredAt || 'never'})`)
    console.log(
      `serial total ≈ ${Math.round(total)}s; predicted critical path ≈ ${Math.round(Math.max(...legs.map((l) => l.seconds)))}s`
    )
    legs.forEach((leg, i) => {
      console.log(`\n  leg ${i} — ≈${Math.round(leg.seconds)}s`)
      for (const spec of leg.specs) console.log(`    ${spec}`)
    })
    return
  }

  const leg = legs[args.index]
  process.stdout.write(args.csv ? leg.specs.join(',') : leg.specs.join('\n') + '\n')
}

module.exports = { specsOnDisk, loadWeights, weigh, split, parseArgs, run }
