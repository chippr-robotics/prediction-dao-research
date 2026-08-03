#!/usr/bin/env node
/**
 * Regenerate the committed mini-app package fixture (spec 073, task T014).
 *
 *     node frontend/src/test/miniapps/fixtures/regenerate.mjs
 *
 * WHY THIS EXISTS. Every other mini-app test synthesizes its package inline —
 * hand-written entry text, a hand-built manifest object, a hash taken over
 * whatever the test itself serialized. Those tests prove the loader is
 * self-consistent; none of them can notice the day `tools/miniapp-build/` starts
 * emitting something the loader would refuse (a renamed manifest field, a
 * different digest encoding, a second chunk, a stylesheet under another name).
 * This script produces bytes from the REAL preset and commits them, so
 * `packageFixture.test.jsx` runs the REAL loader over REAL build output. That
 * pair is the only permanent guard that the two halves still agree.
 *
 * WHAT IT WRITES (all committed, all read by the tests):
 *
 *   package/manifest.json  ┐ verbatim `vite build` output of `source/`, produced
 *   package/entry.js       │ by `createMiniAppConfig()` with preset defaults —
 *   package/style.css      ┘ exactly what `scripts/miniapps/publish.js` would pin
 *   onchain.json             the approved tuple a vendor would submit: cid +
 *                            `keccak256(manifest.json bytes)`, computed here on
 *                            the BUILD side so the test can check the HOST's
 *                            hashing against it rather than against itself
 *   tampered/entry.js        the real entry with one extra statement appended
 *   tampered/manifest.json   a manifest that honestly describes that entry
 *
 * The tampered pair is deliberately SELF-CONSISTENT: its digests are correct for
 * its own bytes, so the only thing that refuses it is `keccak256(manifest) !=
 * the approved hash`. That is the supply-chain case worth committing — a gateway
 * serving a competently rebuilt package, not a corrupted one — and a fixture of
 * random bit-rot would never exercise it.
 *
 * DETERMINISM. Nothing here records a timestamp, a path or a hostname, and the
 * build is run with preset defaults, so re-running this script on an unchanged
 * tree must leave `git diff` empty. A diff after regeneration means the build
 * tool changed what it emits — which is exactly the event the fixture exists to
 * make visible, so read the diff before committing it.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { keccak256 } from 'ethers'

import { MANIFEST_FILENAME, sha256Hex, verifyPackageDigests } from '@fairwins/miniapp-build/index.js'

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_DIR = path.join(FIXTURES_DIR, 'source')
// `dist` anywhere is already ignored by `frontend/.gitignore`, so the raw build
// output can never be committed by accident — only the curated copy below is.
const BUILD_DIR = path.join(SOURCE_DIR, 'dist')
const PACKAGE_DIR = path.join(FIXTURES_DIR, 'package')
const TAMPERED_DIR = path.join(FIXTURES_DIR, 'tampered')
const ONCHAIN_FILE = path.join(FIXTURES_DIR, 'onchain.json')
// Under npm workspaces every bin hoists to the repo-root node_modules/.bin and a child package
// gets none — so check the root first, then the legacy frontend/ location for a non-workspace
// checkout. This harness is what the spec-075 byte-reproducibility gate runs, so a stale path here
// silently disables that gate.
const VITE_BIN = [
  path.resolve(FIXTURES_DIR, '..', '..', '..', '..', '..', 'node_modules', '.bin', 'vite'),
  path.resolve(FIXTURES_DIR, '..', '..', '..', '..', 'node_modules', '.bin', 'vite'),
].find((p) => fs.existsSync(p)) || path.resolve(FIXTURES_DIR, '..', '..', '..', '..', '..', 'node_modules', '.bin', 'vite')

/**
 * The content identifier the fixture pretends to be pinned under.
 *
 * A literal rather than a real CID: nothing about the launch path depends on a
 * CID being a valid multihash (the registry bounds the string, the loader bounds
 * its SHAPE, and integrity comes from the hashes — never from the address). It
 * only has to satisfy `loader.js#CID_PATTERN`, and being obviously synthetic
 * keeps anyone from mistaking it for something pinned.
 */
const FIXTURE_CID = 'bafybeifixtureminiapppackage073t014exampleaaaaaaaaaaaaaaaa'

/**
 * What is appended to the tampered entry.
 *
 * A statement with an OBSERVABLE effect, not a flipped bit: the test asserts the
 * marker is still unset after the refusal, which is a direct measurement of "not
 * one line of this package executed". A corrupted byte could only ever be
 * checked indirectly, by trusting that the loader did not import.
 */
const TAMPER_STATEMENT = 'globalThis.__miniappFixtureTampered = true;\n'

function fail(message) {
  console.error(`[fixtures] ${message}`)
  process.exit(1)
}

/** Wipe and recreate a directory so a removed file can never linger as a fixture. */
function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
}

// ---------------------------------------------------------------- build

if (!fs.existsSync(VITE_BIN)) {
  fail(`vite not found at ${VITE_BIN} — run \`npm install\` at the repo root first`)
}

console.log('[fixtures] building the fixture package with tools/miniapp-build …')
const build = spawnSync(VITE_BIN, ['build'], {
  cwd: SOURCE_DIR,
  stdio: 'inherit',
  // Inherited env, minus anything that could be inlined into published bytes.
  // The preset's `envPrefix` already refuses to inline `VITE_*`, so this is belt
  // and braces for the same reason `scripts/miniapps/publish.js` strips them.
  env: Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_') && !key.startsWith('PINATA_'))
  )
})
if (build.status !== 0) fail('the fixture package failed to build')

// The preset's own re-verification, run before anything is copied: a package
// whose manifest does not describe its own bytes must never become a fixture
// that "proves" the loader accepts build output.
const { manifest, manifestBytes, files } = verifyPackageDigests(BUILD_DIR)

// ---------------------------------------------------------------- package/

resetDir(PACKAGE_DIR)
for (const relative of [MANIFEST_FILENAME, ...files]) {
  const target = path.join(PACKAGE_DIR, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(BUILD_DIR, relative), target)
}

// Hashed from the bytes on disk, never from a re-serialized object — the same
// rule `publish.js` follows, and for the same reason: the host hashes exactly
// what a gateway served it, so a hash taken over our own JSON encoding would be
// a number no host could ever reproduce.
const manifestHash = keccak256(fs.readFileSync(path.join(PACKAGE_DIR, MANIFEST_FILENAME)))

// ---------------------------------------------------------------- tampered/

resetDir(TAMPERED_DIR)

const tamperedEntry = Buffer.concat([
  fs.readFileSync(path.join(PACKAGE_DIR, manifest.entry)),
  Buffer.from(TAMPER_STATEMENT, 'utf8')
])
fs.writeFileSync(path.join(TAMPERED_DIR, manifest.entry), tamperedEntry)

// Re-emitted the way `manifestPlugin.js` emits it (2-space JSON + trailing
// newline, key order preserved by JSON.parse), so the tampered manifest differs
// from the real one in exactly one digest and nothing else. Anything else would
// let a test pass for the wrong reason.
const tamperedManifest = JSON.parse(manifestBytes.toString('utf8'))
tamperedManifest.files[manifest.entry] = { sha256: sha256Hex(tamperedEntry) }
const tamperedManifestBytes = Buffer.from(`${JSON.stringify(tamperedManifest, null, 2)}\n`, 'utf8')
fs.writeFileSync(path.join(TAMPERED_DIR, MANIFEST_FILENAME), tamperedManifestBytes)

const tamperedManifestHash = keccak256(tamperedManifestBytes)
if (tamperedManifestHash === manifestHash) {
  fail('the tampered manifest hashes to the approved value — the fixture would prove nothing')
}

// The stylesheet is byte-identical in both packages, so it is NOT duplicated
// here: the tampered launch never gets past the manifest, and the test that
// serves a tampered entry alongside the real manifest reads the real stylesheet.

// ---------------------------------------------------------------- onchain.json

/**
 * The vendor's on-chain submission, as `publish.js` would print it. Committed so
 * the test compares the HOST's hashing (`lib/miniapps/integrity.js`) against a
 * value produced by the BUILD side — comparing it against a hash the test
 * recomputes itself would pass even if both halves were wrong in the same way.
 */
const onchain = {
  appId: manifest.id,
  version: manifest.version,
  approved: { cid: FIXTURE_CID, manifestHash, version: 1 },
  files: Object.fromEntries(files.map((relative) => [relative, manifest.files[relative].sha256])),
  tampered: { manifestHash: tamperedManifestHash, entrySha256: sha256Hex(tamperedEntry) }
}
fs.writeFileSync(ONCHAIN_FILE, `${JSON.stringify(onchain, null, 2)}\n`, 'utf8')

console.log(`[fixtures] package/      ${[MANIFEST_FILENAME, ...files].join(', ')}`)
console.log(`[fixtures] manifestHash  ${manifestHash}`)
console.log(`[fixtures] tampered/     ${MANIFEST_FILENAME}, ${manifest.entry} (hash ${tamperedManifestHash})`)
console.log('[fixtures] done — review `git diff` before committing; a diff means the build tool changed.')
