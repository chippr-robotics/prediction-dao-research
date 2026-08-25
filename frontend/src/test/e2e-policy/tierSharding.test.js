/**
 * The shard splits must COVER every spec, exactly once (#1249).
 *
 * Both Cypress tiers are now sharded — the on-chain tier 4 ways, the no-chain tier 6 ways per
 * viewport profile — which means 16 CI legs whose union is supposed to be "the suite". A spec that
 * falls out of every leg does not fail anything: each leg reports its own green, the run total looks
 * normal, and the merge gate quietly stops covering that file. That is the same "looks green, ran
 * nothing" failure the tiering policy exists to prevent, arriving through the scheduler instead of
 * through an assertion.
 *
 * The workflow's own guard only catches a leg that is ENTIRELY empty. It cannot see one spec
 * missing from an otherwise healthy split.
 *
 * These tests drive the real entry points as a subprocess rather than importing the packing
 * function. The thing that has to be right is what the workflow actually invokes — the arguments,
 * the profile-to-directory mapping and the CSV shape included — and an import would test none of
 * that.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..', '..')
const E2E = path.join(ROOT, 'frontend', 'cypress', 'e2e')
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'test.yml')

/** Shard counts are read from the workflow, so the test cannot drift from what CI runs. */
function shardCountFor(script) {
  const yml = fs.readFileSync(WORKFLOW, 'utf8')
  const m = yml.match(new RegExp(`${script}[^\\n]*\\n?[^\\n]*--shards (\\d+)`))
  if (!m) throw new Error(`could not find a --shards count for ${script} in test.yml`)
  return Number(m[1])
}

function specsOnDisk(dirs) {
  return dirs
    .flatMap((dir) =>
      fs
        .readdirSync(path.join(E2E, dir))
        .filter((f) => f.endsWith('.cy.js'))
        .map((f) => `cypress/e2e/${dir}/${f}`),
    )
    .sort()
}

function leg(script, args) {
  const out = execFileSync('node', [path.join(ROOT, 'scripts', 'e2e', script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    // The unmeasured-spec ::warning:: goes to stderr by design, so it never contaminates the list.
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return out.trim() ? out.trim().split(',') : []
}

function assertPartitions(script, extraArgs, dirs) {
  const shards = shardCountFor(script)
  const legs = Array.from({ length: shards }, (_, i) =>
    leg(script, [...extraArgs, '--shards', String(shards), '--index', String(i), '--csv']),
  )
  const all = legs.flat()
  const expected = specsOnDisk(dirs)

  // Sorted union equals the directory listing: nothing dropped, nothing invented.
  expect([...all].sort(), `${script} ${extraArgs.join(' ')} covers exactly the specs on disk`).toEqual(expected)
  // And nothing runs twice — a duplicate is wasted wall clock on a tier that is sharded to save it.
  expect(new Set(all).size, `${script} ${extraArgs.join(' ')} assigns each spec once`).toBe(all.length)
  // No leg may be empty: the workflow fails on one, and a split that produces one is a bug here.
  legs.forEach((l, i) => expect(l.length, `${script} leg ${i} is non-empty`).toBeGreaterThan(0))
}

describe('tier sharding — every spec lands on exactly one leg', () => {
  it('the on-chain tier partitions cypress/e2e/full', () => {
    assertPartitions('split-full-tier.js', [], ['full'])
  })

  it('the no-chain desktop profile partitions fast + passkey', () => {
    // Desktop is the only leg that runs the account-native specs: they drive a WebAuthn harness,
    // which is not a viewport question, and running them twice would contradict the policy.
    assertPartitions('split-fast-tier.js', ['--profile', 'desktop'], ['fast', 'passkey'])
  })

  it('the no-chain phone profile partitions fast only', () => {
    assertPartitions('split-fast-tier.js', ['--profile', 'phone'], ['fast'])
  })

  it('refuses an unknown profile rather than defaulting to one', () => {
    // A typo'd profile silently packing the desktop set would schedule passkey specs onto a leg
    // that never sets PASSKEY_ENABLED, where they report as pending rather than as a mistake.
    expect(() => leg('split-fast-tier.js', ['--profile', 'tablet', '--shards', '2', '--index', '0', '--csv']))
      .toThrow()
  })
})
