#!/usr/bin/env node
/**
 * Split the ON-CHAIN tier's specs across shard legs (spec 094, FR-028).
 *
 * Legal only because per-spec chain isolation (`chainCheckpoint`, #1222) made specs order-
 * independent. Before that, run order decided which specs passed, and splitting the list would
 * have changed the results rather than just the wall clock.
 *
 * The packing itself lives in `lib/tier-split.js`, shared with the no-chain tier's splitter
 * (#1249). This file is the on-chain tier's entry point and its name is load-bearing: the
 * workflow, the coverage README, CLAUDE.md and spec 094's own documents all reference it.
 *
 * Usage:
 *   node scripts/e2e/split-full-tier.js --shards 4 --index 0        # newline list for leg 0
 *   node scripts/e2e/split-full-tier.js --shards 4 --index 0 --csv  # comma list for `cypress --spec`
 *   node scripts/e2e/split-full-tier.js --shards 4 --print-all      # every leg, with predicted seconds
 */

const { parseArgs, run, split, weigh, specsOnDisk } = require('./lib/tier-split')

function main() {
  run({
    label: 'split-full-tier',
    dirs: ['full'],
    weightsFile: 'full-tier-weights.json',
    args: parseArgs(process.argv),
  })
}

if (require.main === module) main()

// Re-exported for the existing callers/tests that import from this path.
module.exports = { split, weigh, specsOnDisk: () => specsOnDisk(['full']) }
