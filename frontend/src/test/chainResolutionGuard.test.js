import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regression guard for spec 008 (FR-011): user-facing code MUST resolve contract
 * addresses and providers for the wallet's CONNECTED chain
 * (`getContractAddressForChain(name, chainId)` / `getProvider(chainId)`), never
 * the build-time default (`getContractAddress(name)` / argless `getProvider()`).
 *
 * This scans the source and fails when a user-facing file contains MORE
 * build-time-bound calls than its documented allowlist baseline. The allowlist
 * captures the only acceptable uses:
 *   - "fallback"  — used solely in a catch / `chainId == null` branch when the
 *                   provider/wallet can't report a chain (disconnected state)
 *   - "resolver"  — the chain-aware resolver's own build-time fallback
 *   - "legacy"    — targets a v1 contract not deployed on v2; migration deferred
 *
 * A NEW build-bound call (count above baseline) or any such call in a
 * not-listed file FAILS this test. When a legacy file is later migrated, its
 * count drops below baseline and the test fails too — forcing the baseline to be
 * tightened (kept honest). Update ALLOW with a justification when intentional.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['hooks', 'components', 'pages', 'utils', 'data', 'contexts']

// getContractAddress( but NOT getContractAddressForChain( (different token), and
// not a `.getContractAddress(` method call.
const RE_ADDR = /(?<![\w.])getContractAddress\(/g
// bare argless getProvider() — not `x.getProvider()` and not getProvider(chainId)
const RE_PROV = /(?<![\w.])getProvider\(\s*\)/g

// file (relative to src/) -> { addr, prov } baseline of accepted occurrences
const ALLOW = {
  // resolver fallbacks (hasRoleOnChain / getUserTierOnChain / fetchFriendMarketsForUser),
  // the generic getContract() helper, and legacy v1 reads (tierRegistry /
  // roleManager / paymentProcessor / registerZKKey) not deployed on v2.
  'utils/blockchainService.js': { addr: 11, prov: 2 },
  // catch-branch fallbacks in getKeyRegistryContract + registerEncryptionKey
  'utils/keyRegistryService.js': { addr: 4, prov: 0 },
  // catch-branch fallback in screenAddress
  'utils/sanctionsScreen.js': { addr: 1, prov: 0 },
  // expireStaleWagers catch + createFriendMarket resolve() fallback
  'hooks/useFriendMarketCreation.js': { addr: 2, prov: 0 },
  // legacy: treasuryVault not deployed on v2 (module-scope address)
  'hooks/useTreasuryVault.js': { addr: 1, prov: 0 },
  // legacy: nullifierRegistry not deployed on v2 (module-scope address)
  'hooks/useNullifierContracts.js': { addr: 1, prov: 0 },
  // legacy: v1 friendGroupMarketFactory event source (not deployed on v2)
  'data/wagers/EventsSource.js': { addr: 1, prov: 5 },
}

function walk(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'test') continue
      out.push(...walk(full))
    } else if (/\.(jsx?|tsx?)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

describe('chain resolution guard (spec 008, FR-011)', () => {
  it('no build-time-bound contract/provider resolution beyond the documented allowlist', () => {
    const offenders = []
    for (const d of SCAN_DIRS) {
      for (const file of walk(join(SRC, d))) {
        const rel = file.slice(SRC.length + 1).split('\\').join('/')
        const code = readFileSync(file, 'utf8')
        const addr = (code.match(RE_ADDR) || []).length
        const prov = (code.match(RE_PROV) || []).length
        const allowed = ALLOW[rel] || { addr: 0, prov: 0 }
        if (addr !== allowed.addr || prov !== allowed.prov) {
          offenders.push(
            `${rel}: getContractAddress(=${addr} (allowed ${allowed.addr}), ` +
              `getProvider()=${prov} (allowed ${allowed.prov})`
          )
        }
      }
    }
    expect(
      offenders,
      'Build-time-bound resolution drift detected. Use getContractAddressForChain(name, chainId) ' +
        'or getProvider(chainId); if the change is intentional (a justified fallback or a migration), ' +
        'update the ALLOW baseline in this file:\n  ' + offenders.join('\n  ')
    ).toEqual([])
  })
})
