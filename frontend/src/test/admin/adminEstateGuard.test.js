/**
 * Spec 071 T070 — a source-level guard for the two rules that no single component test can see.
 *
 * Behavioural tests prove a converted view behaves. They cannot prove that the NEXT view added
 * to the console follows the same rules, and both of these fail silently rather than loudly:
 *
 *   1. An admin view that resolves its contract from the WALLET's chain looks fine until an
 *      operator scopes elsewhere, then reads one chain's contract at another chain's address.
 *   2. A cross-unit sum produces a number, just the wrong one. Nothing throws.
 *
 * This scans the admin surface and fails on a NEW occurrence, with an allowlist that documents
 * every accepted one. When a listed file is later converted its count drops below baseline and
 * this fails too — so the baseline stays honest rather than drifting upward.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ADMIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../components/admin')

/** `getContractAddressForChain(..., chainId)` — the WALLET's chain, in an operator view. */
const RE_WALLET_CHAIN = /getContractAddressForChain\(\s*'[^']+'\s*,\s*chainId\s*\)/g

/**
 * Views still resolving against the wallet's chain, with the reason each is still listed.
 * Spec 071 converts these in order (research R8); the number is what that file has TODAY.
 */
// Counts are MEASURED, not estimated — the first run of this guard corrected two of them, which
// is the point: a baseline nobody verified is just a comment.
const UNCONVERTED = {
  // Infrastructure card: the paymaster deposit is per chain and follows the wallet today. The
  // last remaining entry — Fees, Staking and Callsigns were converted and removed from this list,
  // which the guard's second assertion forced rather than left to memory.
  'PaymasterOpsCard.jsx': 1,
}

function adminFiles() {
  return readdirSync(ADMIN_DIR).filter((f) => f.endsWith('.jsx') || f.endsWith('.js'))
}

describe('admin views resolve contracts against an explicit chain, not the wallet by habit', () => {
  it('adds no NEW wallet-chain resolution beyond the documented baseline', () => {
    const offenders = []
    for (const file of adminFiles()) {
      const src = readFileSync(join(ADMIN_DIR, file), 'utf8')
      const count = (src.match(RE_WALLET_CHAIN) || []).length
      const allowed = UNCONVERTED[file] ?? 0
      if (count > allowed) {
        offenders.push(`${file}: ${count} wallet-chain resolutions (baseline ${allowed})`)
      }
    }
    expect(offenders, `Resolve against the SCOPED chain instead:\n${offenders.join('\n')}`).toEqual([])
  })

  it('keeps the baseline honest — a converted file must be removed from the allowlist', () => {
    const stale = []
    for (const [file, allowed] of Object.entries(UNCONVERTED)) {
      if (allowed === 0) continue
      const src = readFileSync(join(ADMIN_DIR, file), 'utf8')
      const count = (src.match(RE_WALLET_CHAIN) || []).length
      if (count < allowed) stale.push(`${file}: now ${count}, baseline still ${allowed}`)
    }
    expect(stale, `Lower these baselines — they have been converted:\n${stale.join('\n')}`).toEqual([])
  })
})

describe('no admin view sums balances across chains (FR-022)', () => {
  it('never reduces a per-chain result list into a single running total', () => {
    // `aggregate()` is the only sanctioned path, and it returns per-unit subtotals. A hand-rolled
    // reduce over chain results is how a cross-unit figure gets invented.
    const offenders = []
    for (const file of adminFiles()) {
      const src = readFileSync(join(ADMIN_DIR, file), 'utf8')
      if (/\.reduce\(\([^)]*\)\s*=>\s*[a-z]+\s*\+\s*[a-z]+\.value/i.test(src)) {
        offenders.push(file)
      }
    }
    expect(offenders, `Use aggregate() from chainReadResult.js:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the sanctioned aggregate still refuses to expose one grand total', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../lib/chains/chainReadResult.js'),
      'utf8',
    )
    // `subtotals` keyed by unit is the whole contract; a `total` export would break it.
    expect(src).toMatch(/subtotals/)
    expect(src).not.toMatch(/export function (grandTotal|totalAcrossChains)/)
  })
})
