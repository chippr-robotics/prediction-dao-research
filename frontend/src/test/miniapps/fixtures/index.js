/**
 * Test access to the committed mini-app package fixture (spec 073, task T014).
 *
 * The bytes under `package/` and `tampered/` are build output, not test data:
 * `regenerate.mjs` produces them with the real `tools/miniapp-build/` preset,
 * and `onchain.json` records the approved tuple a vendor would submit for them.
 * This module is only the seam that hands those bytes to a test — it computes
 * nothing, so a test asserting "the host's hash of these bytes equals the hash
 * the build recorded" is comparing two independent implementations rather than
 * one implementation against itself.
 *
 * Everything is read from disk on demand. Reading through `fs` is what lets a
 * test drive the REAL loader (which only knows how to fetch) over REAL committed
 * bytes: {@link createGatewayFetch} is a gateway whose storage is the repository.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AppStatus } from '../../../abis/miniAppRegistry'

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.join(FIXTURES_DIR, 'package')
const TAMPERED_DIR = path.join(FIXTURES_DIR, 'tampered')

/** The approved tuple `regenerate.mjs` recorded — the vendor's on-chain submission. */
export const ONCHAIN = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'onchain.json'), 'utf8'))

export const FIXTURE_APP_ID = ONCHAIN.appId
export const FIXTURE_VERSION = ONCHAIN.version
export const FIXTURE_CID = ONCHAIN.approved.cid
export const FIXTURE_MANIFEST_HASH = ONCHAIN.approved.manifestHash

export const MANIFEST_PATH = 'manifest.json'
export const ENTRY_PATH = 'entry.js'
export const STYLE_PATH = 'style.css'

/**
 * Read one committed file as bytes.
 *
 * `Uint8Array.from` re-homes the Buffer into this module's realm. Under jsdom,
 * Node's `Buffer` and the realm's `Uint8Array` are not the same class, and
 * ethers' `instanceof Uint8Array` check rejects the foreign view — a test-only
 * artifact (in a browser both are native and same-realm) that would otherwise
 * break hashing for a reason unrelated to what is under test. The same reason
 * `loader.test.js` wraps its TextEncoder output.
 */
function readBytes(dir, relative) {
  return Uint8Array.from(fs.readFileSync(path.join(dir, relative)))
}

/** Bytes of one file from the approved package. */
export function fixtureBytes(relative) {
  return readBytes(PACKAGE_DIR, relative)
}

/** Bytes of one file from the tampered package (`manifest.json` / `entry.js` only). */
export function tamperedBytes(relative) {
  return readBytes(TAMPERED_DIR, relative)
}

/** What a gateway serving the approved package would hold. */
export function approvedPackageFiles() {
  return {
    [MANIFEST_PATH]: fixtureBytes(MANIFEST_PATH),
    [ENTRY_PATH]: fixtureBytes(ENTRY_PATH),
    [STYLE_PATH]: fixtureBytes(STYLE_PATH),
  }
}

/**
 * What a gateway serving the TAMPERED package would hold: a manifest and entry
 * that agree with each other perfectly — and with nothing the curator approved.
 * The stylesheet is byte-identical in both packages, so the real one is served
 * (it is never reached anyway; the manifest is refused first).
 */
export function tamperedPackageFiles() {
  return {
    [MANIFEST_PATH]: tamperedBytes(MANIFEST_PATH),
    [ENTRY_PATH]: tamperedBytes(ENTRY_PATH),
    [STYLE_PATH]: fixtureBytes(STYLE_PATH),
  }
}

/**
 * A `fetchImpl` for the loader, backed by a table of package files.
 *
 * Speaks exactly the URL shape `loader.js#packageFileUrl` builds
 * (`<gateway>/ipfs/<cid>/<path>`) and refuses anything else loudly, so a loader
 * that started addressing packages differently fails here instead of quietly
 * 404-ing its way to a misleading availability error.
 *
 * @param {Record<string, Uint8Array>} files - package-relative path -> bytes
 * @param {{gateway?: string, cid?: string}} [options]
 * @returns {(url: string, init?: object) => Promise<object>} fetch-shaped function
 */
export function createGatewayFetch(files, options = {}) {
  const { gateway = 'https://fixtures.example', cid = FIXTURE_CID } = options
  const marker = `${gateway}/ipfs/${cid}/`

  return async (url, init) => {
    if (init?.signal?.aborted) {
      const aborted = new Error('aborted')
      aborted.name = 'AbortError'
      throw aborted
    }
    if (!url.startsWith(marker)) {
      throw new TypeError(`fixture gateway: unexpected URL ${url} (expected ${marker}…)`)
    }

    const served = files[decodeURIComponent(url.slice(marker.length))]
    const headers = { get: (name) => (name.toLowerCase() === 'content-length' ? String(served?.byteLength ?? 0) : null) }
    if (!served) return { ok: false, status: 404, headers, arrayBuffer: async () => new ArrayBuffer(0) }
    return { ok: true, status: 200, headers, arrayBuffer: async () => served.slice().buffer }
  }
}

/**
 * The registry record the launch path would receive for this package.
 *
 * `launchable: true` is the SERVING decision the chain reports (`isLaunchable`),
 * which is what the loader reads — `status` is only the review state and is
 * carried here for completeness. `proposed` is left empty: a fixture with a
 * proposed tuple would invite a test to accidentally assert against it.
 */
export function fixtureRecord(overrides = {}) {
  return {
    id: 1n,
    appId: FIXTURE_APP_ID,
    name: 'Fixture Mini-App',
    status: AppStatus.APPROVED,
    launchable: true,
    approved: { cid: FIXTURE_CID, manifestHash: FIXTURE_MANIFEST_HASH, version: 1n },
    proposed: { cid: '', manifestHash: `0x${'0'.repeat(64)}`, version: 0n },
    ...overrides,
  }
}

/** The gateway base {@link createGatewayFetch} answers on by default. */
export const FIXTURE_GATEWAY = 'https://fixtures.example'
