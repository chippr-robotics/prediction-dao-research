/**
 * Mini-app manifest validation (spec 073, T016 · data-model.md §2, FR-017).
 *
 * A curator approves a hash, not a schema review — so an authentic manifest can
 * still be one this host must refuse. Each case below is a refusal the launch
 * path depends on: unknown schema, a host contract from the future, a package
 * path that could escape the CID, and an entry whose bytes nothing could
 * authenticate.
 */

import { describe, it, expect } from 'vitest'

import {
  APP_ID_PATTERN,
  HostApiError,
  HOST_PERMISSIONS,
  HOST_SHARED_MODULES,
  MANIFEST_REFUSAL,
  MANIFEST_SCHEMA,
  MAX_PACKAGE_FILES,
  ManifestError,
  SUPPORTED_HOST_API,
  isSafePackagePath,
  manifestFileDigest,
  parseManifest,
  validateManifest,
} from '../../lib/miniapps/manifest'

const DIGEST = 'a'.repeat(64)
const STYLE_DIGEST = 'b'.repeat(64)

/** A manifest exactly as `tools/miniapp-build/` emits one. */
function goodManifest(overrides = {}) {
  return {
    schema: MANIFEST_SCHEMA,
    id: 'token-mint',
    name: 'Token Mint',
    version: '3.1.0',
    entry: 'entry.js',
    styles: ['style.css'],
    hostApi: SUPPORTED_HOST_API,
    sharedDeps: ['react', 'react/jsx-runtime'],
    permissions: ['wallet:submit', 'toast'],
    storeKeys: ['drafts'],
    files: {
      'entry.js': { sha256: DIGEST },
      'style.css': { sha256: STYLE_DIGEST },
    },
    ...overrides,
  }
}

const encode = (value) =>
  new TextEncoder().encode(typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)

/** Assert a typed refusal with a given reason, and that it is never a bare string. */
function expectRefusal(fn, reason, ErrorClass = ManifestError) {
  let caught
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught, `expected a refusal with reason "${reason}"`).toBeInstanceOf(ErrorClass)
  expect(caught.reason).toBe(reason)
  expect(typeof caught.userMessage).toBe('string')
  expect(caught.userMessage.length).toBeGreaterThan(0)
  return caught
}

describe('parseManifest', () => {
  it('accepts a well-formed package manifest and freezes it', () => {
    const manifest = parseManifest(encode(goodManifest()))
    expect(manifest.id).toBe('token-mint')
    expect(manifest.entry).toBe('entry.js')
    expect(manifest.styles).toEqual(['style.css'])
    expect(manifest.files['entry.js'].sha256).toBe(DIGEST)
    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.files)).toBe(true)
  })

  it('normalizes declared digests so encoding can never masquerade as a mismatch', () => {
    const manifest = parseManifest(
      encode(
        goodManifest({
          files: {
            'entry.js': { sha256: `0x${DIGEST.toUpperCase()}` },
            'style.css': { sha256: STYLE_DIGEST },
          },
        })
      )
    )
    expect(manifest.files['entry.js'].sha256).toBe(DIGEST)
  })

  it('treats the files map as data, not as a prototype chain', () => {
    // JSON.parse creates a real own `__proto__` property; a plain-object map
    // would let an ordinary lookup find Object.prototype members instead.
    const manifest = parseManifest(encode(goodManifest()))
    expect(Object.getPrototypeOf(manifest.files)).toBeNull()
    expect(manifest.files.constructor).toBeUndefined()
  })

  it('REFUSES decoded text — verification only ever sees the fetched bytes', () => {
    expectRefusal(() => parseManifest(JSON.stringify(goodManifest())), MANIFEST_REFUSAL.NOT_BYTES)
  })

  it('REFUSES bytes that are not valid UTF-8', () => {
    expectRefusal(() => parseManifest(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])), MANIFEST_REFUSAL.NOT_UTF8)
  })

  it('REFUSES bytes that are not JSON', () => {
    expectRefusal(() => parseManifest(encode('not json at all')), MANIFEST_REFUSAL.NOT_JSON)
  })

  it('REFUSES a non-object top level', () => {
    expectRefusal(() => parseManifest(encode('[]')), MANIFEST_REFUSAL.NOT_OBJECT)
    expectRefusal(() => parseManifest(encode('"a string"')), MANIFEST_REFUSAL.NOT_OBJECT)
    expectRefusal(() => parseManifest(encode('null')), MANIFEST_REFUSAL.NOT_OBJECT)
  })
})

describe('schema and host contract version', () => {
  it('REFUSES an unknown schema rather than guessing what the fields mean', () => {
    const caught = expectRefusal(
      () => validateManifest(goodManifest({ schema: 'fairwins-miniapp-manifest/2' })),
      MANIFEST_REFUSAL.UNKNOWN_SCHEMA
    )
    expect(caught.userMessage).toMatch(/does not recognize/i)
  })

  it('REFUSES a missing schema', () => {
    const { schema: _schema, ...withoutSchema } = goodManifest()
    expectRefusal(() => validateManifest(withoutSchema), MANIFEST_REFUSAL.UNKNOWN_SCHEMA)
  })

  it('REFUSES a hostApi newer than this host supports, with a version message', () => {
    const caught = expectRefusal(
      () => validateManifest(goodManifest({ hostApi: SUPPORTED_HOST_API + 1 })),
      MANIFEST_REFUSAL.HOST_API_TOO_NEW,
      HostApiError
    )
    expect(caught.required).toBe(SUPPORTED_HOST_API + 1)
    expect(caught.supported).toBe(SUPPORTED_HOST_API)
    expect(caught.userMessage).toContain(`v${SUPPORTED_HOST_API + 1}`)
    expect(caught.userMessage).toMatch(/newer version of the platform/i)
  })

  it('accepts an older hostApi — old packages keep working', () => {
    const manifest = validateManifest(goodManifest({ hostApi: 1 }), { supportedHostApi: 4 })
    expect(manifest.hostApi).toBe(1)
  })

  it('REFUSES a non-integer or zero hostApi', () => {
    for (const hostApi of [0, -1, 1.5, '1', null, undefined]) {
      expectRefusal(() => validateManifest(goodManifest({ hostApi })), MANIFEST_REFUSAL.BAD_HOST_API)
    }
  })
})

describe('identity fields', () => {
  it('REFUSES an id that is not a usable slug', () => {
    // The id becomes a route segment, a storage namespace and a ledger entry id.
    for (const id of ['Token-Mint', 'token mint', '1token', '../evil', 'a', '', null, 'x'.repeat(40)]) {
      expectRefusal(() => validateManifest(goodManifest({ id })), MANIFEST_REFUSAL.BAD_ID)
    }
    expect(APP_ID_PATTERN.test('token-mint')).toBe(true)
  })

  it('REFUSES an empty or oversized name', () => {
    for (const name of ['', '   ', 'n'.repeat(200), 42, undefined]) {
      expectRefusal(() => validateManifest(goodManifest({ name })), MANIFEST_REFUSAL.BAD_NAME)
    }
  })

  it('REFUSES a version that is not semantic', () => {
    for (const version of ['3.1', 'v3.1.0', 'latest', 3, null]) {
      expectRefusal(() => validateManifest(goodManifest({ version })), MANIFEST_REFUSAL.BAD_VERSION)
    }
    expect(validateManifest(goodManifest({ version: '0.1.0-rc.1' })).version).toBe('0.1.0-rc.1')
  })
})

describe('package paths cannot escape the package', () => {
  const ESCAPES = [
    '../entry.js',
    'a/../../entry.js',
    '/etc/passwd',
    '//evil.example/entry.js',
    'https://evil.example/entry.js',
    'http://evil.example/entry.js',
    'javascript:alert(1)',
    'data:text/javascript,alert(1)',
    'C:/windows/system32',
    'dir\\entry.js',
    './entry.js',
    'entry.js?x=1',
    'entry.js#frag',
    '%2e%2e/entry.js',
    'entry .js',
    'entry\u0000.js',
    '',
  ]

  it.each(ESCAPES)('isSafePackagePath refuses %j', (path) => {
    expect(isSafePackagePath(path)).toBe(false)
  })

  it('accepts ordinary package-relative paths', () => {
    for (const path of ['entry.js', 'style.css', 'assets/logo-DEADBEEF.svg', '_shared/x.js']) {
      expect(isSafePackagePath(path)).toBe(true)
    }
  })

  it('REFUSES an entry that tries to escape the CID', () => {
    expectRefusal(
      () =>
        validateManifest(
          goodManifest({
            entry: '../../../evil.js',
            files: { '../../../evil.js': { sha256: DIGEST }, 'style.css': { sha256: STYLE_DIGEST } },
          })
        ),
      MANIFEST_REFUSAL.UNSAFE_PATH
    )
  })

  it('REFUSES an absolute-URL entry even when it is listed with a digest', () => {
    expectRefusal(
      () =>
        validateManifest(
          goodManifest({
            entry: 'https://evil.example/entry.js',
            files: { 'https://evil.example/entry.js': { sha256: DIGEST } },
            styles: [],
          })
        ),
      MANIFEST_REFUSAL.UNSAFE_PATH
    )
  })

  it('REFUSES an unsafe key anywhere in the files map', () => {
    expectRefusal(
      () =>
        validateManifest(
          goodManifest({
            files: {
              'entry.js': { sha256: DIGEST },
              'style.css': { sha256: STYLE_DIGEST },
              '../secrets.json': { sha256: DIGEST },
            },
          })
        ),
      MANIFEST_REFUSAL.UNSAFE_PATH
    )
  })

  it('REFUSES an unsafe style path', () => {
    expectRefusal(
      () => validateManifest(goodManifest({ styles: ['../../host.css'] })),
      MANIFEST_REFUSAL.UNSAFE_PATH
    )
  })
})

describe('the files map is the only thing that authenticates bytes', () => {
  it('REFUSES a manifest whose files map omits the entry', () => {
    expectRefusal(
      () => validateManifest(goodManifest({ files: { 'style.css': { sha256: STYLE_DIGEST } } })),
      MANIFEST_REFUSAL.ENTRY_NOT_LISTED
    )
  })

  it('REFUSES a style that is not listed', () => {
    expectRefusal(
      () =>
        validateManifest(
          goodManifest({ styles: ['extra.css'], files: { 'entry.js': { sha256: DIGEST } } })
        ),
      MANIFEST_REFUSAL.STYLE_NOT_LISTED
    )
  })

  it('REFUSES a missing, empty or non-object files map', () => {
    for (const files of [undefined, null, {}, [], 'entry.js']) {
      expectRefusal(() => validateManifest(goodManifest({ files })), MANIFEST_REFUSAL.BAD_FILES)
    }
  })

  it('REFUSES a files map larger than the bound', () => {
    const files = { 'entry.js': { sha256: DIGEST } }
    for (let i = 0; i <= MAX_PACKAGE_FILES; i += 1) files[`asset-${i}.js`] = { sha256: DIGEST }
    expectRefusal(() => validateManifest(goodManifest({ files, styles: [] })), MANIFEST_REFUSAL.BAD_FILES)
  })

  it('REFUSES a declared digest that is not a sha-256 digest', () => {
    for (const sha256 of ['', 'deadbeef', 'z'.repeat(64), 42, undefined]) {
      expectRefusal(
        () =>
          validateManifest(
            goodManifest({ files: { 'entry.js': { sha256 }, 'style.css': { sha256: STYLE_DIGEST } } })
          ),
        MANIFEST_REFUSAL.BAD_DIGEST
      )
    }
  })

  it('manifestFileDigest refuses anything the manifest does not list', () => {
    const manifest = validateManifest(goodManifest())
    expect(manifestFileDigest(manifest, 'entry.js')).toBe(DIGEST)
    expectRefusal(() => manifestFileDigest(manifest, 'other.js'), MANIFEST_REFUSAL.FILE_NOT_LISTED)
    expectRefusal(() => manifestFileDigest(manifest, '../secrets'), MANIFEST_REFUSAL.UNSAFE_PATH)
    // A lookup that resolves through the prototype chain would return a
    // function here instead of refusing.
    expectRefusal(() => manifestFileDigest(manifest, 'toString'), MANIFEST_REFUSAL.FILE_NOT_LISTED)
  })
})

describe('declared capabilities must be ones the host actually has', () => {
  it('REFUSES a permission the host does not expose', () => {
    expectRefusal(
      () => validateManifest(goodManifest({ permissions: ['wallet:submit', 'filesystem'] })),
      MANIFEST_REFUSAL.UNKNOWN_PERMISSION
    )
    expect(HOST_PERMISSIONS).toContain('wallet:submit')
  })

  it('REFUSES a shared dependency the host cannot supply', () => {
    expectRefusal(
      () => validateManifest(goodManifest({ sharedDeps: ['react', 'lodash'] })),
      MANIFEST_REFUSAL.UNKNOWN_SHARED_DEP
    )
    expect(HOST_SHARED_MODULES).toContain('react/jsx-runtime')
  })

  it('REFUSES a malformed store key and bounds the list', () => {
    expectRefusal(() => validateManifest(goodManifest({ storeKeys: ['ok', 'not ok'] })), MANIFEST_REFUSAL.BAD_STORE_KEYS)
    expectRefusal(() => validateManifest(goodManifest({ storeKeys: 'drafts' })), MANIFEST_REFUSAL.BAD_STORE_KEYS)
  })

  it('treats omitted optional lists as empty rather than as absent checks', () => {
    const manifest = validateManifest(
      goodManifest({ styles: undefined, sharedDeps: undefined, permissions: undefined, storeKeys: undefined })
    )
    expect(manifest.styles).toEqual([])
    expect(manifest.sharedDeps).toEqual([])
    expect(manifest.permissions).toEqual([])
    expect(manifest.storeKeys).toEqual([])
    // A hostApi-1 package predates the field entirely and must still validate —
    // with an EMPTY allowlist, so it can resolve nothing.
    expect(manifest.contracts).toEqual([])
  })
})

/*
 * hostApi 2. `contracts` is unlike every other declared list in this manifest:
 * `permissions`, `storeKeys` and `sharedDeps` describe the package, but this one
 * is an ACCESS GATE the host enforces at runtime. What a reviewer reads on this
 * line is exactly what the app can resolve.
 */
describe('declared contract allowlist (hostApi 2)', () => {
  const withContracts = (contracts, permissions = ['contracts']) =>
    goodManifest({ contracts, permissions })

  it('accepts a declared allowlist alongside the permission', () => {
    const manifest = validateManifest(withContracts(['tokenFactory', 'miniAppRegistry']))
    expect(manifest.contracts).toEqual(['tokenFactory', 'miniAppRegistry'])
    expect(Object.isFrozen(manifest.contracts)).toBe(true)
  })

  it('REFUSES names without the permission that reads them', () => {
    // Otherwise the manifest misdescribes itself: a reviewer sees an allowlist
    // and assumes the app resolves addresses, while the host refuses every call.
    expectRefusal(
      () => validateManifest(withContracts(['tokenFactory'], ['toast'])),
      MANIFEST_REFUSAL.BAD_CONTRACTS
    )
  })

  it('REFUSES a malformed name and bounds the list', () => {
    for (const bad of [['token factory'], ['token-factory'], ['0factory'], [''], [null], ['x'.repeat(65)]]) {
      expectRefusal(() => validateManifest(withContracts(bad)), MANIFEST_REFUSAL.BAD_CONTRACTS)
    }
    expectRefusal(() => validateManifest(withContracts('tokenFactory')), MANIFEST_REFUSAL.BAD_CONTRACTS)
    expectRefusal(
      () => validateManifest(withContracts(Array.from({ length: 17 }, (_, i) => `c${i}`))),
      MANIFEST_REFUSAL.BAD_CONTRACTS
    )
  })

  it('allows the permission with no names — a package may declare intent and resolve nothing', () => {
    expect(validateManifest(goodManifest({ permissions: ['contracts'], contracts: [] })).contracts).toEqual([])
  })

  it('exposes contracts and network as real host capabilities', () => {
    expect(HOST_PERMISSIONS).toContain('contracts')
    expect(HOST_PERMISSIONS).toContain('network')
  })
})
