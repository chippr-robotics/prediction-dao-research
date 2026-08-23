#!/usr/bin/env node
/**
 * Split the NO-CHAIN tier's specs across shard legs (#1249).
 *
 * The tier that starts no chain had become the merge gate's critical path: 34:29 of Cypress on the
 * desktop leg, against 09:53–17:09 for the on-chain shards that compile contracts, boot hardhat,
 * run a full deploy and send real transactions. Nothing about what this tier DOES explains that —
 * the on-chain tier was sharded four ways and this one was a single leg per viewport profile.
 *
 * Splitting needs no justification about isolation here, unlike the on-chain tier: these specs
 * share no chain, so there is no state for run order to carry.
 *
 * PROFILES. The two legs do not run the same specs, and the split has to know which set it is
 * packing or the shard lists would name specs the leg never runs:
 *   desktop — cypress/e2e/fast/** AND cypress/e2e/passkey/**  (the account-native tier rides this
 *             leg for its runner; its specs were authored at 1280px and it is a WebAuthn question,
 *             not a viewport one — running it twice would contradict the policy spec 094 wrote)
 *   phone   — cypress/e2e/fast/** only
 *
 * Usage:
 *   node scripts/e2e/split-fast-tier.js --profile desktop --shards 6 --index 0 --csv
 *   node scripts/e2e/split-fast-tier.js --profile phone --shards 6 --print-all
 */

const { parseArgs, run } = require('./lib/tier-split')

const PROFILE_DIRS = {
  desktop: ['fast', 'passkey'],
  phone: ['fast'],
}

function main() {
  const args = parseArgs(process.argv, { extra: { profile: 'desktop' } })
  const dirs = PROFILE_DIRS[args.profile]
  if (!dirs) {
    // Loud, not defaulted: a typo'd profile silently packing the desktop set would put the passkey
    // specs on a phone leg that never sets PASSKEY_ENABLED, and they would report as pending.
    console.error(
      `::error::split-fast-tier: unknown --profile '${args.profile}' (expected ${Object.keys(PROFILE_DIRS).join(' or ')})`
    )
    process.exit(1)
  }
  run({
    label: `split-fast-tier(${args.profile})`,
    dirs,
    weightsFile: 'fast-tier-weights.json',
    args,
  })
}

if (require.main === module) main()
