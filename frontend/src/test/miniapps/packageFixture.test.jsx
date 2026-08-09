/**
 * The committed package fixture, end to end (spec 073, T014 · FR-011/FR-017).
 *
 * Every other mini-app test builds its package inline — the test writes the
 * entry text, the test builds the manifest object, the test hashes what it just
 * serialized. That proves the loader agrees with ITSELF. It cannot notice the day
 * `tools/miniapp-build/` starts emitting something the loader would refuse: a
 * renamed manifest field, a different digest encoding, a second chunk, a
 * stylesheet under another name. The result would be packages that build
 * cleanly, submit cleanly, and refuse to launch on every member's machine.
 *
 * This file closes that gap. `fixtures/package/` holds bytes the REAL preset
 * emitted (`fixtures/regenerate.mjs`), `fixtures/onchain.json` holds the
 * `keccak256` the BUILD side computed over them, and everything below runs the
 * REAL loader, integrity and manifest modules over those bytes — read off disk
 * through an injected `fetchImpl`, because a gateway is the only thing the loader
 * knows how to talk to.
 *
 * Two properties are checked that no synthesized package can check:
 *
 * 1. **The host's hash of the build's bytes equals the build's own hash.** Two
 *    independent implementations (ethers in a Node script, `@noble` + ethers in
 *    the browser host) over one artifact. A test that recomputed the expectation
 *    itself would pass even if both halves were wrong in the same way.
 * 2. **The built module actually runs inside the host.** The entry is evaluated
 *    for real and rendered inside `MiniAppHostProvider`, so the host-scope shims
 *    the preset generated must line up with the scope `hostScope.js` installs —
 *    including React being ONE copy, which is the whole of research R2.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { formatUnits, getAddress } from 'ethers'

import { keccak256Hex, sha256Hex } from '../../lib/miniapps/integrity'
import { HOST_PERMISSIONS, HOST_SHARED_MODULES, SUPPORTED_HOST_API, parseManifest } from '../../lib/miniapps/manifest'
import { loadMiniApp } from '../../lib/miniapps/loader'
import { installHostScope } from '../../lib/miniapps/hostScope'
import { MiniAppHostProvider } from '../../lib/miniapps/hostContext'
import { __resetMiniAppStores } from '../../lib/miniapps/store'
import {
  ENTRY_PATH,
  ETHERS_FIXTURE_APP_ID,
  ETHERS_FIXTURE_CID,
  ETHERS_FIXTURE_MANIFEST_HASH,
  ETHERS_ONCHAIN,
  FIXTURE_APP_ID,
  FIXTURE_CID,
  FIXTURE_GATEWAY,
  FIXTURE_MANIFEST_HASH,
  FIXTURE_VERSION,
  MANIFEST_PATH,
  ONCHAIN,
  STYLE_PATH,
  approvedPackageFiles,
  createGatewayFetch,
  ethersFixtureBytes,
  ethersFixtureRecord,
  ethersPackageFiles,
  fixtureBytes,
  fixtureRecord,
  tamperedBytes,
  tamperedPackageFiles,
} from './fixtures'

/**
 * The host's own seams, stubbed. The fixture app only reads `host.appId`, but
 * `MiniAppHostProvider` is the real provider and pulls the whole wallet/ledger
 * stack behind it; stubbing here keeps this file about the PACKAGE while still
 * mounting through the real host contract rather than a stand-in. `vi.hoisted`
 * so the mock factories — which run before this file's top-level statements —
 * can reach these values.
 */
const state = vi.hoisted(() => ({
  account: '0xAbCd000000000000000000000000000000000073',
  chainId: 137,
  navigate: null,
  showNotification: null,
}))

/**
 * `ethers`, restored to the SHAPE the browser actually has.
 *
 * `src/test/setup.js` mocks ethers globally with `{ ...actual, BrowserProvider,
 * JsonRpcProvider, Contract }` to keep tests off the network. Vitest wraps a
 * factory mock in a Proxy that THROWS for any key the factory did not return,
 * and real ethers is an ESM package with no default export — so the one thing
 * the spread cannot carry over is the absence of `default`.
 *
 * That matters here and nowhere else, because every host-scope shim ends with
 * `__fwModule.default !== undefined ? … : __fwModule` — the line that makes a
 * CJS package's default (React's) work and correctly finds none on an ESM one.
 * Under the global mock that read throws, so a package importing ethers could
 * not be EVALUATED in any test, for a reason that exists only in the test
 * environment. Restoring the key (as genuinely `undefined`) makes the mock
 * describe the module it stands in for. The provider stubs are not re-declared
 * because this file constructs no provider — `utils/rpcProvider` is stubbed
 * below.
 */
vi.mock('ethers', async (importOriginal) => ({ ...(await importOriginal()), default: undefined }))

vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }))
vi.mock('../../hooks/useWalletManagement', () => ({
  useWallet: () => ({ chainId: state.chainId, isConnected: true, openConnectModal: () => {} }),
}))
vi.mock('../../hooks/useEffectiveAccount', () => ({
  useEffectiveAccount: () => ({ address: state.account, connectedAddress: state.account, chainId: null }),
}))
vi.mock('../../hooks/useActiveAccount', () => ({
  useActiveAccount: () => ({
    isVault: false,
    isLegacy: false,
    canActAsVault: false,
    canActAsLegacy: false,
    submit: async () => ({ kind: 'sent', txHash: '0x0' }),
  }),
}))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: state.showNotification }) }))
vi.mock('../../utils/rpcProvider', () => ({ getReadProvider: () => null }))
vi.mock('../../data/ledger/sources/miniAppSource', () => ({
  captureMiniAppTxSubmitted: () => null,
  captureMiniAppLog: () => null,
  captureMiniAppStateChange: () => null,
}))

/** Decode committed bytes for the assertions that are about text, not digests. */
const decode = (bytes) => new TextDecoder('utf-8').decode(bytes)

/**
 * The bytes actually inside a Blob. jsdom's Blob implements neither
 * `arrayBuffer()` nor `text()`, so `FileReader` is the only way back out — and
 * reading them back is the point: `blob.size` would pass just as happily for a
 * same-length substitution.
 */
const readBlobBytes = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })

/** A module URL Node's loader will actually evaluate (it cannot resolve jsdom Blob URLs). */
const moduleUrl = (bytes) => `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`

/**
 * Loader plumbing that EVALUATES the verified bytes for real.
 *
 * The loader mints its Blob URL exactly once, from the bytes that passed every
 * check; this harness captures that Blob, reads it back, and imports precisely
 * those bytes. So the module that ends up mounted is provably the one the
 * integrity chain approved — not a copy the test re-read from disk afterwards.
 */
function evaluatingHarness() {
  let captured = null
  const createObjectURL = vi.fn((blob) => {
    captured = blob
    return 'blob:fixture/entry'
  })
  const revokeObjectURL = vi.fn()
  const importImpl = vi.fn(async () => import(/* @vite-ignore */ moduleUrl(await readBlobBytes(captured))))
  return { createObjectURL, revokeObjectURL, importImpl, blob: () => captured }
}

/** Plumbing for the refusal cases: if either of these is ever called, the test has failed. */
function inertHarness() {
  return {
    createObjectURL: vi.fn(() => 'blob:fixture/never'),
    revokeObjectURL: vi.fn(),
    importImpl: vi.fn(async () => ({ default: () => null })),
  }
}

const gatewayOptions = { gateways: [FIXTURE_GATEWAY] }

beforeAll(() => {
  // The real scope: the shims inside the committed entry read their React, their
  // jsx-runtime and their SDK binding from here. If this and
  // `tools/miniapp-build/constants.js` ever drift, the module below throws the
  // moment it is evaluated — which is the drift alarm this fixture exists to be.
  installHostScope()
})

beforeEach(() => {
  localStorage.clear()
  __resetMiniAppStores()
  state.navigate = vi.fn()
  state.showNotification = vi.fn()
  // Order-independence for the tamper assertions: whichever test ran before,
  // the marker starts unset.
  delete globalThis.__miniappFixtureTampered
})

describe('the committed bytes are what the build tool emitted', () => {
  it('hashes, on the host side, to the value the build side recorded', () => {
    // THE drift guard. `onchain.json`'s hash came from `ethers.keccak256` over
    // the file in a Node script; this one comes from the host's own integrity
    // module. Two implementations, one artifact, one number.
    expect(keccak256Hex(fixtureBytes(MANIFEST_PATH))).toBe(FIXTURE_MANIFEST_HASH)
    expect(FIXTURE_MANIFEST_HASH).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('carries per-file digests the host recomputes exactly', () => {
    for (const [relative, digest] of Object.entries(ONCHAIN.files)) {
      expect(sha256Hex(fixtureBytes(relative)), `${relative} digest`).toBe(digest)
    }
    expect(Object.keys(ONCHAIN.files).sort()).toEqual([ENTRY_PATH, STYLE_PATH])
  })

  it('parses under the host manifest validator, with the fields the preset promises', () => {
    const manifest = parseManifest(fixtureBytes(MANIFEST_PATH))

    expect(manifest.id).toBe(FIXTURE_APP_ID)
    expect(manifest.version).toBe(FIXTURE_VERSION)
    expect(manifest.hostApi).toBe(SUPPORTED_HOST_API)
    expect(manifest.entry).toBe(ENTRY_PATH)
    expect(manifest.styles).toEqual([STYLE_PATH])
    // The manifest's own digest map and the recorded one describe the same bytes.
    expect(manifest.files[ENTRY_PATH].sha256).toBe(ONCHAIN.files[ENTRY_PATH])
    expect(manifest.files[STYLE_PATH].sha256).toBe(ONCHAIN.files[STYLE_PATH])
    // Declared capabilities and shared modules exist on this host — a package
    // may never advertise something the host would silently not enforce.
    for (const permission of manifest.permissions) expect(HOST_PERMISSIONS).toContain(permission)
    for (const dep of manifest.sharedDeps) expect(HOST_SHARED_MODULES).toContain(dep)
    expect(manifest.sharedDeps).toContain('react')
    expect(manifest.sharedDeps).toContain('@fairwins/miniapp-sdk')
    // hostApi 2. The assertion above (hostApi === SUPPORTED_HOST_API) is what
    // keeps the PRESET and the HOST from drifting apart on the contract
    // version: this fixture is real preset output, so a preset still emitting
    // the old number fails here rather than at a member's launch. The
    // allowlist is emitted even when empty, so its absence is a preset bug and
    // not mistaken for "declared nothing".
    expect(manifest.contracts).toEqual([])
  })

  it('ships no copy of a host-owned dependency (research R2)', () => {
    const entry = decode(fixtureBytes(ENTRY_PATH))
    // One self-contained ES module: no bare import survives, because a Blob URL
    // has nothing to resolve one against.
    expect(entry).not.toMatch(/^\s*import[\s{("']/m)
    // What replaced them: reads from the host's frozen shared-module scope.
    expect(entry).toContain('Symbol.for("fairwins.miniapp.host")')
  })
})

describe('the real loader mounts the real package', () => {
  it('fetches, verifies and imports exactly the committed bytes', async () => {
    const harness = evaluatingHarness()
    const fetchImpl = vi.fn(createGatewayFetch(approvedPackageFiles()))

    const result = await loadMiniApp(fixtureRecord(), { ...gatewayOptions, fetchImpl, ...harness })

    expect(result.manifest.id).toBe(FIXTURE_APP_ID)
    expect(result.cid).toBe(FIXTURE_CID)
    expect(result.manifestHash).toBe(FIXTURE_MANIFEST_HASH)
    expect(typeof result.component).toBe('function')

    // The manifest is requested first (it anchors everything), then only the
    // files it declares — in the order the loader documents.
    const requested = fetchImpl.mock.calls.map(([url]) => url.split(`/ipfs/${FIXTURE_CID}/`)[1])
    expect(requested).toEqual([MANIFEST_PATH, ENTRY_PATH, STYLE_PATH])

    // Byte-for-byte: what was made executable is what was hashed.
    expect(Array.from(await readBlobBytes(harness.blob()))).toEqual(Array.from(fixtureBytes(ENTRY_PATH)))
    expect(harness.revokeObjectURL).toHaveBeenCalledWith('blob:fixture/entry')

    // The stylesheet the host would inject is the package's real one.
    expect(result.styles).toEqual([{ path: STYLE_PATH, css: decode(fixtureBytes(STYLE_PATH)) }])
  })

  it('renders inside the host, on the host’s own React', async () => {
    const harness = evaluatingHarness()
    const fetchImpl = createGatewayFetch(approvedPackageFiles())
    const { component: FixtureApp } = await loadMiniApp(fixtureRecord(), { ...gatewayOptions, fetchImpl, ...harness })

    render(
      <MiniAppHostProvider appId={FIXTURE_APP_ID}>
        <FixtureApp />
      </MiniAppHostProvider>,
    )

    // It received the host context (`useMiniAppHost` through the SDK shim)…
    expect(screen.getByText('Fixture mini-app')).toBeInTheDocument()
    expect(screen.getByText(FIXTURE_APP_ID)).toBeInTheDocument()

    // …and its hooks work, which is only true if the shim resolved to the HOST's
    // React. A bundled second copy would have its own, empty, hook dispatcher and
    // could not participate in this render at all (research R2).
    const button = screen.getByRole('button', { name: 'Greet' })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Greeted' })).toBeInTheDocument()
  })
})

describe('a tampered package is refused, and none of it runs', () => {
  it('REFUSES a self-consistent impostor whose manifest is not the approved one', async () => {
    // The impostor's digests are internally perfect — it is a competently
    // rebuilt package, which is what a hostile gateway would actually serve. The
    // only thing standing in front of it is the on-chain hash.
    const harness = inertHarness()
    const fetchImpl = vi.fn(createGatewayFetch(tamperedPackageFiles()))

    const error = await loadMiniApp(fixtureRecord(), { ...gatewayOptions, fetchImpl, ...harness }).catch((e) => e)

    expect(error.name).toBe('IntegrityError')
    expect(error.reason).toBe('manifest_hash_mismatch')
    expect(error.expected).toBe(FIXTURE_MANIFEST_HASH)
    expect(error.actual).toBe(ONCHAIN.tampered.manifestHash)

    // Nothing past the anchor was even requested, nothing was made executable,
    // and — measured directly, not inferred — the injected statement never ran.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(harness.createObjectURL).not.toHaveBeenCalled()
    expect(harness.importImpl).not.toHaveBeenCalled()
    expect(globalThis.__miniappFixtureTampered).toBeUndefined()
  })

  it('REFUSES a swapped entry served under the genuine manifest', async () => {
    // The subtler attack: the manifest is the approved one (so the keccak check
    // passes) and only the executable file is replaced. The per-file sha-256 is
    // what catches it.
    const harness = inertHarness()
    const files = { ...approvedPackageFiles(), [ENTRY_PATH]: tamperedBytes(ENTRY_PATH) }
    const fetchImpl = vi.fn(createGatewayFetch(files))

    const error = await loadMiniApp(fixtureRecord(), { ...gatewayOptions, fetchImpl, ...harness }).catch((e) => e)

    expect(error.name).toBe('IntegrityError')
    expect(error.reason).toBe('file_hash_mismatch')
    expect(error.path).toBe(ENTRY_PATH)
    expect(error.expected).toBe(ONCHAIN.files[ENTRY_PATH])
    expect(error.actual).toBe(ONCHAIN.tampered.entrySha256)

    expect(harness.createObjectURL).not.toHaveBeenCalled()
    expect(harness.importImpl).not.toHaveBeenCalled()
    expect(globalThis.__miniappFixtureTampered).toBeUndefined()
  })

  it('proves the tamper marker is not vacuous: these bytes DO set it when run', async () => {
    // A control, deliberately outside the loader. Without it, "the marker is
    // unset" would be satisfied just as well by a tampered file that does
    // nothing at all, and the two refusals above would be measuring nothing.
    expect(globalThis.__miniappFixtureTampered).toBeUndefined()
    await import(/* @vite-ignore */ moduleUrl(tamperedBytes(ENTRY_PATH)))
    expect(globalThis.__miniappFixtureTampered).toBe(true)
  })
})

/**
 * The ethers fixture (spec 075, T033) — the shim the real packages actually carry.
 *
 * Everything above runs against a package that imports React and the SDK and
 * NOTHING ELSE, by an explicit spec-073 decision ("`ethers` is intentionally not
 * imported: it would add a ~190-binding shim for no additional coverage"). That
 * decision left the continuously-enforced gate blind in the one place spec 075
 * cares about, because the whole hazard runs through ethers:
 *
 *   `hostScopePlugin.js#discoverExports` imports the file Vite RESOLVED and
 *   transcribes its export names into the shim -> those bytes are `entry.js` ->
 *   its sha256 is in `manifest.json` -> `keccak256(manifest bytes)` is the
 *   on-chain MiniAppRegistry commitment.
 *
 * So a change to installation layout — adopting workspaces, changing hoisting,
 * bumping a dependency — can rewrite thousands of bytes in every published
 * package with no error raised anywhere. `package-ethers/` is the committed
 * evidence: 192 ethers binding names, produced by the real preset from the real
 * on-disk install. Regenerating after such a change produces a git diff (the
 * spec-075 GATE 2), and the digests below re-check it on every frontend run.
 */
describe('the ethers fixture carries the shim the published packages carry', () => {
  it('hashes, on the host side, to the value the build side recorded', () => {
    expect(keccak256Hex(ethersFixtureBytes(MANIFEST_PATH))).toBe(ETHERS_FIXTURE_MANIFEST_HASH)
    expect(sha256Hex(ethersFixtureBytes(ENTRY_PATH))).toBe(ETHERS_ONCHAIN.files[ENTRY_PATH])
  })

  it('declares exactly the shared dependencies both real packages declare', () => {
    const manifest = parseManifest(ethersFixtureBytes(MANIFEST_PATH))

    expect(manifest.id).toBe(ETHERS_FIXTURE_APP_ID)
    expect(manifest.hostApi).toBe(SUPPORTED_HOST_API)
    // Token Mint's and ClearPath's own manifests carry this exact set. The
    // fixture is only a proxy for them if its shim surface is the same one.
    expect([...manifest.sharedDeps]).toEqual([
      '@fairwins/miniapp-sdk',
      'ethers',
      'react',
      'react/jsx-runtime',
    ])
    for (const dep of manifest.sharedDeps) expect(HOST_SHARED_MODULES).toContain(dep)
    // No stylesheet — a `styles: []` package shape the first fixture cannot produce.
    expect(manifest.styles).toEqual([])
    expect(Object.keys(manifest.files)).toEqual([ENTRY_PATH])
  })

  it('bakes the RESOLVED ethers binding list into the committed bytes', () => {
    const entry = decode(ethersFixtureBytes(ENTRY_PATH))

    // Still one self-contained module reading from the host scope…
    expect(entry).not.toMatch(/^\s*import[\s{("']/m)
    expect(entry).toContain('shared module ethers')

    // …and the shim is a transcript of what `discoverExports()` found on disk.
    // Sampled across the alphabet rather than counted exactly: an ethers minor
    // release may add a binding, and that SHOULD show up as a fixture diff to be
    // reviewed, not as a test that fails for having been written too precisely.
    for (const binding of ['AbiCoder', 'Contract', 'JsonRpcProvider', 'formatUnits', 'getAddress', 'keccak256', 'parseUnits', 'verifyTypedData']) {
      expect(entry, `ethers binding ${binding}`).toContain(`.${binding}`)
    }
    // Bulk, not just the handful the app uses: the ~190-name list is the thing
    // module resolution moves, so a shim that had shrunk to the used bindings
    // would no longer be sensitive to it.
    expect(entry.match(/\.[A-Za-z_$][\w$]*;/g).length).toBeGreaterThan(150)
  })

  it('renders on the HOST’s ethers, through the real loader', async () => {
    const harness = evaluatingHarness()
    const fetchImpl = vi.fn(createGatewayFetch(ethersPackageFiles(), { cid: ETHERS_FIXTURE_CID }))

    const result = await loadMiniApp(ethersFixtureRecord(), { ...gatewayOptions, fetchImpl, ...harness })
    expect(result.manifestHash).toBe(ETHERS_FIXTURE_MANIFEST_HASH)
    // The manifest declares no stylesheet, so the loader fetches only two files
    // and injects nothing — the shape a `styles: []` package produces.
    expect(fetchImpl.mock.calls.map(([url]) => url.split(`/ipfs/${ETHERS_FIXTURE_CID}/`)[1])).toEqual([
      MANIFEST_PATH,
      ENTRY_PATH,
    ])
    expect(result.styles).toEqual([])

    const EthersFixtureApp = result.component
    render(
      <MiniAppHostProvider appId={ETHERS_FIXTURE_APP_ID}>
        <EthersFixtureApp />
      </MiniAppHostProvider>,
    )

    // Rendered output that is a FUNCTION of ethers. Both expectations are
    // recomputed here with the host's own ethers rather than hardcoded, so this
    // measures "the shim reached the host's copy" rather than "someone typed the
    // right string into a test". A shim resolving to nothing throws on
    // evaluation; one resolving to a bundled second copy could not be the same
    // object these calls come from.
    expect(screen.getByText(formatUnits(1234567n, 6))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Checksum' }))
    const checksummed = getAddress('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    expect(screen.getByRole('button', { name: checksummed })).toBeInTheDocument()
    // And the SDK still reached it — the host object, not a stand-in.
    expect(screen.getByText(ETHERS_FIXTURE_APP_ID)).toBeInTheDocument()
  })
})
