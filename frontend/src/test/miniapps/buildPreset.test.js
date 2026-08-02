/**
 * Spec 073 — `tools/miniapp-build` option validation, with a bias toward the
 * hostApi-2 contract allowlist.
 *
 * `packageFixture.test.jsx` proves the preset's OUTPUT still parses under the
 * host validator. This file covers the other direction: what the preset REFUSES
 * to build. That matters more for `contracts` than for any other declared list,
 * because it is the only one the host enforces at runtime — a package built with
 * a bad allowlist would not merely under-document itself, it would be refused
 * mid-flight in front of a member, long after review.
 *
 * The rules are duplicated in two places by necessity (the preset is plain Node,
 * the validator is frontend ESM), so the last test asserts the two agree rather
 * than trusting that they were kept in step by hand.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  createMiniAppConfig,
  HOST_API_VERSION,
  HOST_PERMISSIONS as PRESET_PERMISSIONS,
  CONTRACT_NAME_PATTERN as PRESET_CONTRACT_PATTERN,
  MAX_DECLARED_CONTRACTS as PRESET_MAX_CONTRACTS,
} from '../../../../tools/miniapp-build/index.js'
import {
  SUPPORTED_HOST_API,
  HOST_PERMISSIONS,
  CONTRACT_NAME_PATTERN,
  MAX_DECLARED_CONTRACTS,
} from '../../lib/miniapps/manifest'

/**
 * The committed fixture package is used as the root because the preset also
 * checks that `entry` exists on disk — a real directory keeps these tests about
 * option validation rather than about a missing file.
 */
const FIXTURE_ROOT = path.resolve(__dirname, 'fixtures/source')

const base = (over = {}) => ({
  appId: 'token-mint',
  name: 'Token Mint',
  version: '1.0.0',
  root: FIXTURE_ROOT,
  entry: 'src/entry.jsx',
  ...over,
})

describe('contract allowlist validation (hostApi 2)', () => {
  it('accepts a declared allowlist alongside the permission', () => {
    expect(() =>
      createMiniAppConfig(base({ permissions: ['contracts'], contracts: ['tokenFactory'] })),
    ).not.toThrow()
  })

  it('REFUSES names without the permission that reads them', () => {
    expect(() =>
      createMiniAppConfig(base({ permissions: ['toast'], contracts: ['tokenFactory'] })),
    ).toThrow(/requires the "contracts" permission/)
  })

  it('REFUSES a malformed contract name at BUILD time, not at launch', () => {
    for (const bad of ['token factory', 'token-factory', '0factory', '']) {
      expect(() =>
        createMiniAppConfig(base({ permissions: ['contracts'], contracts: [bad] })),
      ).toThrow(/contract name/)
    }
  })

  it('bounds the allowlist', () => {
    expect(() =>
      createMiniAppConfig(
        base({
          permissions: ['contracts'],
          contracts: Array.from({ length: MAX_DECLARED_CONTRACTS + 1 }, (_, i) => `c${i}`),
        }),
      ),
    ).toThrow(/at most/)
  })

  it('defaults to no allowlist, so a package that says nothing resolves nothing', () => {
    expect(() => createMiniAppConfig(base())).not.toThrow()
  })

  it('still REFUSES an unknown permission', () => {
    expect(() => createMiniAppConfig(base({ permissions: ['filesystem'] }))).toThrow(/unknown permission/)
  })
})

describe('the preset and the host validator agree', () => {
  it('on the contract version', () => {
    // Two literals for one number is how a package gets built for a host that
    // does not exist. The fixture test catches drift in built output; this
    // catches it in the constants themselves.
    expect(HOST_API_VERSION).toBe(SUPPORTED_HOST_API)
  })

  it('on the capability list', () => {
    expect([...PRESET_PERMISSIONS].sort()).toEqual([...HOST_PERMISSIONS].sort())
    expect(PRESET_PERMISSIONS).toContain('contracts')
    expect(PRESET_PERMISSIONS).toContain('network')
  })

  it('on what a contract name may look like, and how many there may be', () => {
    expect(PRESET_CONTRACT_PATTERN.source).toBe(CONTRACT_NAME_PATTERN.source)
    expect(PRESET_MAX_CONTRACTS).toBe(MAX_DECLARED_CONTRACTS)
  })
})
