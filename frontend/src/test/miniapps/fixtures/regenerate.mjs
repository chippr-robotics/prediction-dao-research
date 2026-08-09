#!/usr/bin/env node
/**
 * Regenerate the committed mini-app package fixtures (spec 073 T014, spec 075 T033).
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
 * TWO FIXTURES, AND WHY (spec 075, T033).
 *
 *   `source/`         React + `react/jsx-runtime` + the SDK. The original
 *                     (spec 073 T014): the smallest package that still
 *                     exercises the whole runtime contract, plus the tampered
 *                     twin that proves the integrity refusals.
 *   `source-ethers/`  the same, plus `ethers`. `hostScopePlugin.js` enumerates
 *                     a shared module's bindings by importing the file Vite
 *                     resolved, so the emitted shim is a literal transcript of
 *                     what the installer put on disk — and ethers contributes
 *                     ~190 names, by far the largest, to both real packages.
 *                     Without this fixture the continuously-enforced gate is
 *                     structurally blind to the exact chain spec 075 exists to
 *                     bound: hoisting -> resolution -> shim text -> entry.js ->
 *                     manifest digest -> the on-chain commitment.
 *
 * WHAT IT WRITES (all committed, all read by the tests):
 *
 *   package/manifest.json         ┐ verbatim `vite build` output of `source/`,
 *   package/entry.js              │ produced by `createMiniAppConfig()` with
 *   package/style.css             ┘ preset defaults — exactly what
 *                                   `scripts/miniapps/publish.js` would pin
 *   onchain.json                    the approved tuple a vendor would submit:
 *                                   cid + `keccak256(manifest.json bytes)`,
 *                                   computed here on the BUILD side so the test
 *                                   can check the HOST's hashing against it
 *                                   rather than against itself
 *   tampered/entry.js               the real entry with one extra statement
 *   tampered/manifest.json          a manifest that honestly describes it
 *   package-ethers/manifest.json  ┐ the same, for `source-ethers/`. No
 *   package-ethers/entry.js       ┘ stylesheet (that app ships none, which is a
 *                                   `styles: []` package shape the first
 *                                   fixture cannot produce) and no tampered
 *                                   twin — the refusal paths are already proven
 *                                   once, and proving them twice would only
 *                                   double the committed bytes
 *   onchain-ethers.json             its approved tuple
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
 * tool changed what it emits — or that a shared dependency now resolves to
 * something else — which is exactly the event the fixtures exist to make
 * visible, so read the diff before committing it.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { keccak256 } from 'ethers'

import { MANIFEST_FILENAME, sha256Hex, verifyPackageDigests } from '@fairwins/miniapp-build/index.js'

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url))
// Under npm workspaces every bin hoists to the repo-root node_modules/.bin and a child package
// gets none — so check the root first, then the legacy frontend/ location for a non-workspace
// checkout. This harness is what the spec-075 byte-reproducibility gate runs, so a stale path here
// silently disables that gate.
const VITE_BIN = [
  path.resolve(FIXTURES_DIR, '..', '..', '..', '..', '..', 'node_modules', '.bin', 'vite'),
  path.resolve(FIXTURES_DIR, '..', '..', '..', '..', 'node_modules', '.bin', 'vite'),
].find((p) => fs.existsSync(p)) || path.resolve(FIXTURES_DIR, '..', '..', '..', '..', '..', 'node_modules', '.bin', 'vite')

/**
 * What is appended to the tampered entry.
 *
 * A statement with an OBSERVABLE effect, not a flipped bit: the test asserts the
 * marker is still unset after the refusal, which is a direct measurement of "not
 * one line of this package executed". A corrupted byte could only ever be
 * checked indirectly, by trusting that the loader did not import.
 */
const TAMPER_STATEMENT = 'globalThis.__miniappFixtureTampered = true;\n'

/**
 * The two fixture packages.
 *
 * `cid` is a literal rather than a real CID: nothing about the launch path
 * depends on a CID being a valid multihash (the registry bounds the string, the
 * loader bounds its SHAPE, and integrity comes from the hashes — never from the
 * address). It only has to satisfy `loader.js#CID_PATTERN`, and being obviously
 * synthetic keeps anyone from mistaking it for something pinned.
 */
const FIXTURES = [
  {
    label: 'react',
    source: 'source',
    package: 'package',
    onchain: 'onchain.json',
    tampered: 'tampered',
    cid: 'bafybeifixtureminiapppackage073t014exampleaaaaaaaaaaaaaaaa'
  },
  {
    label: 'ethers',
    source: 'source-ethers',
    package: 'package-ethers',
    onchain: 'onchain-ethers.json',
    tampered: null,
    cid: 'bafybeifixtureethersminiapppackage075t033exampleaaaaaaaa'
  }
]

function fail(message) {
  console.error(`[fixtures] ${message}`)
  process.exit(1)
}

/** Wipe and recreate a directory so a removed file can never linger as a fixture. */
function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
}

if (!fs.existsSync(VITE_BIN)) {
  fail(`vite not found at ${VITE_BIN} — run \`npm run deps:reinstall\` at the repo root first`)
}

/**
 * Build one fixture package and write every committed artifact for it.
 *
 * @param {(typeof FIXTURES)[number]} fixture
 */
function regenerate(fixture) {
  const sourceDir = path.join(FIXTURES_DIR, fixture.source)
  // `dist` anywhere is already ignored by `frontend/.gitignore`, so the raw build
  // output can never be committed by accident — only the curated copy below is.
  const buildDir = path.join(sourceDir, 'dist')
  const packageDir = path.join(FIXTURES_DIR, fixture.package)

  // ------------------------------------------------------------ build

  console.log(`[fixtures] building ${fixture.source}/ with tools/miniapp-build …`)
  const build = spawnSync(VITE_BIN, ['build'], {
    cwd: sourceDir,
    stdio: 'inherit',
    // Inherited env, minus anything that could be inlined into published bytes.
    // The preset's `envPrefix` already refuses to inline `VITE_*`, so this is belt
    // and braces for the same reason `scripts/miniapps/publish.js` strips them.
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('VITE_') && !key.startsWith('PINATA_'))
    )
  })
  if (build.status !== 0) fail(`the ${fixture.label} fixture package failed to build`)

  // The preset's own re-verification, run before anything is copied: a package
  // whose manifest does not describe its own bytes must never become a fixture
  // that "proves" the loader accepts build output.
  const { manifest, manifestBytes, files } = verifyPackageDigests(buildDir)

  // ------------------------------------------------------------ package dir

  resetDir(packageDir)
  for (const relative of [MANIFEST_FILENAME, ...files]) {
    const target = path.join(packageDir, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(buildDir, relative), target)
  }

  // Hashed from the bytes on disk, never from a re-serialized object — the same
  // rule `publish.js` follows, and for the same reason: the host hashes exactly
  // what a gateway served it, so a hash taken over our own JSON encoding would be
  // a number no host could ever reproduce.
  const manifestHash = keccak256(fs.readFileSync(path.join(packageDir, MANIFEST_FILENAME)))

  /**
   * The vendor's on-chain submission, as `publish.js` would print it. Committed so
   * the test compares the HOST's hashing (`lib/miniapps/integrity.js`) against a
   * value produced by the BUILD side — comparing it against a hash the test
   * recomputes itself would pass even if both halves were wrong in the same way.
   */
  const onchain = {
    appId: manifest.id,
    version: manifest.version,
    approved: { cid: fixture.cid, manifestHash, version: 1 },
    files: Object.fromEntries(files.map((relative) => [relative, manifest.files[relative].sha256]))
  }

  // ------------------------------------------------------------ tampered dir

  if (fixture.tampered) {
    const tamperedDir = path.join(FIXTURES_DIR, fixture.tampered)
    resetDir(tamperedDir)

    const tamperedEntry = Buffer.concat([
      fs.readFileSync(path.join(packageDir, manifest.entry)),
      Buffer.from(TAMPER_STATEMENT, 'utf8')
    ])
    fs.writeFileSync(path.join(tamperedDir, manifest.entry), tamperedEntry)

    // Re-emitted the way `manifestPlugin.js` emits it (2-space JSON + trailing
    // newline, key order preserved by JSON.parse), so the tampered manifest differs
    // from the real one in exactly one digest and nothing else. Anything else would
    // let a test pass for the wrong reason.
    const tamperedManifest = JSON.parse(manifestBytes.toString('utf8'))
    tamperedManifest.files[manifest.entry] = { sha256: sha256Hex(tamperedEntry) }
    const tamperedManifestBytes = Buffer.from(`${JSON.stringify(tamperedManifest, null, 2)}\n`, 'utf8')
    fs.writeFileSync(path.join(tamperedDir, MANIFEST_FILENAME), tamperedManifestBytes)

    const tamperedManifestHash = keccak256(tamperedManifestBytes)
    if (tamperedManifestHash === manifestHash) {
      fail('the tampered manifest hashes to the approved value — the fixture would prove nothing')
    }

    // The stylesheet is byte-identical in both packages, so it is NOT duplicated
    // here: the tampered launch never gets past the manifest, and the test that
    // serves a tampered entry alongside the real manifest reads the real stylesheet.

    onchain.tampered = { manifestHash: tamperedManifestHash, entrySha256: sha256Hex(tamperedEntry) }
    console.log(`[fixtures] ${fixture.tampered}/     ${MANIFEST_FILENAME}, ${manifest.entry} (hash ${tamperedManifestHash})`)
  }

  // ------------------------------------------------------------ onchain tuple

  fs.writeFileSync(path.join(FIXTURES_DIR, fixture.onchain), `${JSON.stringify(onchain, null, 2)}\n`, 'utf8')

  console.log(`[fixtures] ${fixture.package}/      ${[MANIFEST_FILENAME, ...files].join(', ')}`)
  console.log(`[fixtures] manifestHash  ${manifestHash}`)
  console.log(`[fixtures] sharedDeps    ${manifest.sharedDeps.join(', ') || 'none'}`)
}

for (const fixture of FIXTURES) regenerate(fixture)

console.log('[fixtures] done — review `git diff` before committing; a diff means the build tool changed.')
