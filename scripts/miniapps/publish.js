#!/usr/bin/env node
/**
 * Mini-app package publisher (spec 073, task T012).
 *
 * Turns `frontend/miniapps/<appId>/` into a published package and prints the two
 * values a vendor submits on-chain: the CID a host fetches from, and the
 * `keccak256` of the manifest bytes a host re-hashes before executing anything
 * (FR-011). Both halves of that pair come out of one pipeline so they can never
 * describe different bytes:
 *
 *     build (tools/miniapp-build) → verify digests → hash manifest → publish → re-verify → print
 *
 * Three properties are deliberate, and each one is load-bearing:
 *
 * 1. **The hash is taken from raw bytes on disk, never from a re-serialized
 *    object.** The registry stores `keccak256(manifest.json bytes)` and the host
 *    hashes exactly what the gateway served it. Re-`JSON.stringify`-ing the
 *    parsed manifest would normalize whitespace and key order and produce a hash
 *    no host could ever reproduce — the package would build cleanly, submit
 *    cleanly, and refuse to launch on every member's machine.
 * 2. **Nothing is printed that was not verified first.** The preset's
 *    `verifyPackageDigests` re-hashes every emitted file against the manifest
 *    before anything is staged or pinned, and after publishing the manifest is
 *    read and hashed a second time from the published location. A vendor pays
 *    for an on-chain submission; discovering a mismatch afterwards is the
 *    expensive way to find out.
 * 3. **`--dev` and the pinned path publish the same bytes.** Local development
 *    serves real built, hashed packages through the same loader and the same
 *    verification (research R11) — there is no mock package format, so a package
 *    that works in dev works when pinned.
 *
 * Usage:
 *
 *     node scripts/miniapps/publish.js --app token-mint            # build + pin to IPFS
 *     node scripts/miniapps/publish.js --app token-mint --dev      # build + stage for a local gateway
 *
 * Pinning credentials come from the environment only (`PINATA_JWT`, or
 * `PINATA_API_KEY` + `PINATA_SECRET_KEY` — the same names
 * `scripts/operations/market-templates/ipfs.js` reads). They are never printed,
 * never written to a file, and are stripped from the build subprocess's
 * environment: a published package is public bytes served to every member.
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const { keccak256 } = require('ethers')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const PACKAGES_DIR = path.join(REPO_ROOT, 'frontend', 'miniapps')
const PRESET_DIR = path.join(REPO_ROOT, 'tools', 'miniapp-build')
/*
 * Resolve vite from the workspace ROOT bin, not from frontend/.
 *
 * Under npm workspaces a child package gets NO node_modules/.bin at all — every executable hoists
 * to the root. Verified on npm 11.6.0. The old hardcoded `frontend/node_modules/.bin/vite` broke
 * the moment the workspace landed, and this is the RELEASE path for code whose bytes are
 * keccak-committed on-chain, so it must not fail late.
 *
 * Both locations are checked so the script keeps working in a non-workspace checkout.
 */
const VITE_BIN = [
  path.join(REPO_ROOT, 'node_modules', '.bin', 'vite'),
  path.join(REPO_ROOT, 'frontend', 'node_modules', '.bin', 'vite'),
].find((p) => fs.existsSync(p)) || path.join(REPO_ROOT, 'node_modules', '.bin', 'vite')

/**
 * Where `--dev` stages packages.
 *
 * `frontend/miniapps/dist/` is chosen for two reasons that are not stylistic:
 * `frontend/.gitignore`'s bare `dist` rule already ignores it, so a staged
 * package can never be committed; and it sits under `frontend/`, so the Vite dev
 * server (or any static server) can serve it as a gateway root. The staged
 * layout is `<root>/ipfs/<cid>/<file>` — literally the URL shape
 * `frontend/src/lib/miniapps/loader.js` builds — so pointing
 * `VITE_MINIAPP_GATEWAY` at a static server rooted here needs no rewriting
 * middleware to work.
 */
const DEV_STAGING_ROOT = path.join(PACKAGES_DIR, 'dist')

/**
 * Default gateway bases used only to print a usable URL (and, when pinning, to
 * read the package back). Loopback http is what the loader permits for local
 * development; everything else must be https.
 */
const DEFAULT_DEV_GATEWAY = 'http://localhost:8080'
const DEFAULT_PIN_GATEWAY = 'https://gateway.pinata.cloud'

/** Hosts for which the loader accepts plain http (`loader.js#LOOPBACK_HOSTS`). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

/** The Pinata seam: same API and same credential names the rest of the repo uses. */
const PINATA_BASE_URL = 'https://api.pinata.cloud'
const PINATA_PIN_URL = `${PINATA_BASE_URL}/pinning/pinFileToIPFS`
const PINATA_AUTH_URL = `${PINATA_BASE_URL}/data/testAuthentication`

/** Mirrors `IPFS_CONFIG.UPLOAD_TIMEOUT` / `TIMEOUT` in `frontend/src/constants/ipfs.js`. */
const PIN_TIMEOUT_MS = 120_000
const AUTH_TIMEOUT_MS = 30_000
const GATEWAY_PROBE_TIMEOUT_MS = 20_000

/** Environment variables scrubbed from the build subprocess (see the file docblock). */
const SECRET_ENV_KEYS = [
  'PINATA_JWT',
  'PINATA_API_KEY',
  'PINATA_SECRET_KEY',
  'VITE_PINATA_JWT',
  'VITE_PINATA_API_KEY',
  'VITE_PINATA_API_SECRET',
]

const USAGE = `Usage: node scripts/miniapps/publish.js --app <appId> [options]

  --app <appId>       package directory under frontend/miniapps/ (required)
  --dev               stage locally instead of pinning to IPFS
  --gateway <url>     gateway base for the printed URL
                      (default: ${DEFAULT_DEV_GATEWAY} with --dev, ${DEFAULT_PIN_GATEWAY} without)
  --help              show this message

Pinning reads PINATA_JWT, or PINATA_API_KEY + PINATA_SECRET_KEY, from the
environment. Use --dev when you have no credentials.`

/** A failure the operator can act on. Thrown, printed once by main(), exit 1. */
class PublishError extends Error {}

function fail(message) {
  throw new PublishError(message)
}

// =============================================================================
// Arguments
// =============================================================================

function parseArgs(argv) {
  const args = { app: null, dev: false, gateway: null, help: false }

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--app') args.app = argv[++i]
    else if (flag === '--dev') args.dev = true
    else if (flag === '--gateway') args.gateway = argv[++i]
    else if (flag === '--help' || flag === '-h') args.help = true
    // An unrecognized flag is refused rather than ignored: silently dropping
    // `--devv` would pin a package the operator meant to keep local.
    else fail(`unknown argument "${flag}"\n\n${USAGE}`)
  }

  return args
}

/**
 * Normalize a gateway base the way the loader does, and refuse anything the
 * loader would silently drop — printing a URL the host cannot use is worse than
 * printing nothing.
 */
function normalizeGateway(candidate) {
  let url
  try {
    url = new URL(candidate)
  } catch {
    fail(`gateway "${candidate}" is not a URL`)
  }

  const loopback = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !loopback) {
    fail(
      `gateway "${candidate}" must be https, or http on ${[...LOOPBACK_HOSTS].join('/')} — ` +
        'the host loader drops every other origin (frontend/src/lib/miniapps/loader.js)'
    )
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

// =============================================================================
// Build
// =============================================================================

/**
 * Locate the package and prove it is buildable before anything else runs, so a
 * typo in `--app` costs a message rather than a confusing Vite stack trace.
 */
function resolvePackageDir(appId, appIdPattern) {
  if (!appId) fail(`--app is required\n\n${USAGE}`)
  if (!appIdPattern.test(appId)) {
    fail(
      `--app "${appId}" must match ${appIdPattern} — the same slug is the package directory, ` +
        'the registry id, the URL segment and the store namespace'
    )
  }
  if (path.join(PACKAGES_DIR, appId) === DEV_STAGING_ROOT) {
    // `frontend/miniapps/dist/` is the --dev staging root; a package of that
    // name would have staged copies of every other package inside its source.
    fail(`--app "${appId}" is reserved: ${path.relative(REPO_ROOT, DEV_STAGING_ROOT)} is the --dev staging root`)
  }

  const packageDir = path.join(PACKAGES_DIR, appId)
  if (!fs.existsSync(packageDir)) {
    const available = fs.existsSync(PACKAGES_DIR)
      ? fs
          .readdirSync(PACKAGES_DIR, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && path.join(PACKAGES_DIR, entry.name) !== DEV_STAGING_ROOT)
          .map((entry) => entry.name)
      : []
    fail(
      `no mini-app package at ${path.relative(REPO_ROOT, packageDir)}` +
        (available.length > 0 ? `\n  available packages: ${available.join(', ')}` : '\n  no packages exist yet')
    )
  }

  const configPath = path.join(packageDir, 'vite.config.js')
  if (!fs.existsSync(configPath)) {
    fail(
      `${path.relative(REPO_ROOT, packageDir)} has no vite.config.js — a package is built by the shared ` +
        'preset (tools/miniapp-build/README.md), not by hand'
    )
  }

  return packageDir
}

/**
 * Run the package's own Vite build.
 *
 * The workspace binary is used rather than a programmatic `build()` call so the
 * operator sees exactly the output of the documented manual command
 * (`tools/miniapp-build/README.md`), including the manifest plugin's summary
 * line. The child environment is scrubbed of pinning credentials: the build has
 * no use for them, and package bytes are public.
 */
function runBuild(packageDir) {
  if (!fs.existsSync(VITE_BIN)) {
    fail(`vite is not installed at ${path.relative(REPO_ROOT, VITE_BIN)} — run \`npm install\` in frontend/`)
  }

  const env = { ...process.env }
  for (const key of SECRET_ENV_KEYS) delete env[key]

  console.log(`Building ${path.relative(REPO_ROOT, packageDir)} with the mini-app preset…\n`)
  const result = spawnSync(VITE_BIN, ['build'], { cwd: packageDir, stdio: 'inherit', env })

  if (result.error) fail(`could not run vite: ${result.error.message}`)
  if (result.signal) fail(`vite build was killed by ${result.signal}`)
  if (result.status !== 0) {
    fail(
      `vite build failed (exit ${result.status}) for ${path.relative(REPO_ROOT, packageDir)} — ` +
        'the build output above says why; nothing was published'
    )
  }

  const distDir = path.join(packageDir, 'dist')
  if (!fs.existsSync(distDir)) {
    fail(`vite build reported success but produced no ${path.relative(REPO_ROOT, distDir)}`)
  }
  return distDir
}

// =============================================================================
// Hashing
// =============================================================================

/**
 * `keccak256` of the manifest exactly as it sits on disk.
 *
 * The buffer is hashed verbatim — see property (1) in the file docblock. This is
 * the value the registry stores and the host recomputes, so any transformation
 * here is a launch failure everywhere else.
 *
 * @param {string} dir - a directory containing `manifest.json`
 * @param {string} manifestFilename
 * @returns {{hash: string, bytes: Buffer, manifest: object}}
 */
function hashManifest(dir, manifestFilename) {
  const manifestPath = path.join(dir, manifestFilename)
  if (!fs.existsSync(manifestPath)) fail(`no ${manifestFilename} in ${path.relative(REPO_ROOT, dir)}`)

  const bytes = fs.readFileSync(manifestPath)
  return {
    hash: keccak256(new Uint8Array(bytes)),
    bytes,
    manifest: JSON.parse(bytes.toString('utf8')),
  }
}

function formatBytes(count) {
  if (count < 1024) return `${count} B`
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`
  return `${(count / (1024 * 1024)).toFixed(1)} MB`
}

/** Every published file, manifest included — the manifest is not in its own `files` map. */
function publishedFiles(distDir, files, manifestFilename) {
  return [manifestFilename, ...files].map((relative) => ({
    relative,
    absolute: path.join(distDir, relative),
    size: fs.statSync(path.join(distDir, relative)).size,
  }))
}

// =============================================================================
// Destination: local dev staging
// =============================================================================

/**
 * Stage the built package where a local gateway can serve it.
 *
 * The staged directory is keyed by the manifest hash, not by the app id, because
 * the whole system treats a package URL as immutable: the service-worker package
 * cache (spec 073 US6) caches gateway URLs on the assumption that a CID's bytes
 * never change, and a registry record keeps serving its previously approved
 * package while a new one is Pending. A stable per-app path would break both in
 * development and hide the bug until production.
 *
 * An existing directory with the same id is replaced rather than kept: the
 * quickstart's tamper test deliberately corrupts a staged byte, and re-running
 * publish must restore the bytes the id promises.
 */
function stageForDev(distDir, cid) {
  const stagedDir = path.join(DEV_STAGING_ROOT, 'ipfs', cid)
  fs.rmSync(stagedDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(stagedDir), { recursive: true })
  fs.cpSync(distDir, stagedDir, { recursive: true })
  return stagedDir
}

// =============================================================================
// Destination: IPFS via the existing Pinata seam
// =============================================================================

/**
 * Read pinning credentials from the environment.
 *
 * Returns the request headers, never the secret itself, so no caller can print
 * one by accident. `PINATA_JWT` first, the legacy key/secret pair second — the
 * same order and the same variable names as
 * `scripts/operations/market-templates/ipfs.js` and the frontend's
 * `ipfsService.js`.
 *
 * @returns {{kind: string, headers: Record<string, string>}|null} null when unconfigured
 */
function readPinataCredentials() {
  const jwt = (process.env.PINATA_JWT || '').trim()
  if (jwt !== '') return { kind: 'PINATA_JWT', headers: { Authorization: `Bearer ${jwt}` } }

  const apiKey = (process.env.PINATA_API_KEY || '').trim()
  const secretKey = (process.env.PINATA_SECRET_KEY || '').trim()
  if (apiKey !== '' && secretKey !== '') {
    return {
      kind: 'PINATA_API_KEY + PINATA_SECRET_KEY',
      headers: { pinata_api_key: apiKey, pinata_secret_api_key: secretKey },
    }
  }

  return null
}

async function requestWithTimeout(url, init, timeoutMs, label) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') fail(`${label} timed out after ${timeoutMs / 1000}s`)
    fail(`${label} failed: ${error?.message || error}`)
  } finally {
    clearTimeout(timer)
  }
}

/** Pinata's error shape, unwrapped the way `frontend/src/utils/ipfsService.js` unwraps it. */
async function describeHttpFailure(response) {
  const text = await response.text().catch(() => '')
  try {
    const parsed = JSON.parse(text)
    const candidates = [parsed?.error?.reason, parsed?.error?.message, parsed?.error, parsed?.message]
    // Only a string is usable: Pinata sometimes nests `error` as an object, and
    // interpolating that would print "[object Object]" instead of the reason.
    const message = candidates.find((value) => typeof value === 'string' && value.trim() !== '')
    if (message) return `${response.status} ${message}`
  } catch {
    // not JSON — fall through to the raw snippet
  }
  return `${response.status}${text ? ` ${text.slice(0, 200)}` : ''}`
}

/**
 * Confirm the credentials work before the build runs.
 *
 * A 401 discovered after a full build is a slow way to learn that an env var is
 * missing a character; this costs one round trip.
 */
async function verifyPinataAuth(credentials) {
  const response = await requestWithTimeout(
    PINATA_AUTH_URL,
    { method: 'GET', headers: credentials.headers },
    AUTH_TIMEOUT_MS,
    'Pinata authentication'
  )
  if (!response.ok) {
    fail(
      `Pinata rejected the credentials in ${credentials.kind}: ${await describeHttpFailure(response)}\n` +
        '  Fix the credentials, or publish locally with --dev.'
    )
  }
}

/**
 * Pin the built directory and return its CID.
 *
 * `@pinata/sdk`'s `pinFromFS` is deliberately NOT used: it reads one directory
 * level (`fs.readdir` + `createReadStream` per entry, which throws EISDIR on a
 * package that emitted `assets/`), and its `normalizePath` rewrites every entry
 * to the last two path segments — both would silently publish a directory whose
 * layout no longer matches the paths the manifest describes. The multipart
 * upload below is the same endpoint the SDK posts to, with the package's real
 * relative paths preserved.
 *
 * Each part's filename is `<appId>/<relative path>`; Pinata assembles those into
 * one directory and returns its CID, so `<gateway>/ipfs/<cid>/manifest.json`
 * resolves — exactly the URL the loader builds.
 */
async function pinToIpfs(files, { appId, version, credentials }) {
  const form = new FormData()
  for (const file of files) {
    form.append('file', new Blob([fs.readFileSync(file.absolute)]), `${appId}/${file.relative}`)
  }
  form.append('pinataMetadata', JSON.stringify({ name: `miniapp-${appId}-${version}` }))
  // CIDv1 keeps the string inside the registry's MAX_CID_LENGTH and matches the
  // rest of the repo's pins; the directory is the root, never wrapped again.
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1, wrapWithDirectory: false }))

  const response = await requestWithTimeout(
    PINATA_PIN_URL,
    { method: 'POST', headers: credentials.headers, body: form },
    PIN_TIMEOUT_MS,
    'Pinata upload'
  )
  if (!response.ok) fail(`Pinata upload failed: ${await describeHttpFailure(response)}`)

  const result = await response.json().catch(() => null)
  const cid = result?.IpfsHash
  if (!cid) fail('Pinata accepted the upload but returned no IpfsHash — nothing to submit on-chain')
  return cid
}

/**
 * Read the manifest back from the gateway and re-hash it.
 *
 * A 404 immediately after pinning is ordinary propagation, so it is reported and
 * not fatal. Bytes that hash to something else are not propagation — that is a
 * gateway serving different content under this CID, and printing a submission
 * block for it would hand the vendor a tuple that fails verification on every
 * member's machine.
 *
 * @returns {Promise<{state: string, detail: string}>}
 */
async function probeGateway(gateway, cid, expectedHash, manifestFilename) {
  const url = `${gateway}/ipfs/${cid}/${manifestFilename}`

  let response
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GATEWAY_PROBE_TIMEOUT_MS)
    try {
      response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timed out' : error?.message || String(error)
    return { state: 'unconfirmed', detail: `gateway did not answer (${reason}) — usually propagation delay` }
  }

  if (!response.ok) {
    return { state: 'unconfirmed', detail: `gateway answered ${response.status} — usually propagation delay` }
  }

  const served = Buffer.from(await response.arrayBuffer())
  const servedHash = keccak256(new Uint8Array(served))
  if (servedHash !== expectedHash) {
    fail(
      `the gateway is serving different bytes for this CID\n` +
        `  ${url}\n` +
        `  expected keccak256 ${expectedHash}\n` +
        `  served   keccak256 ${servedHash}\n` +
        '  Do NOT submit this tuple — every host would refuse it.'
    )
  }

  return { state: 'confirmed', detail: 'gateway serves the pinned manifest and it hashes correctly' }
}

// =============================================================================
// Output
// =============================================================================

function printReport({ mode, appId, manifest, cid, manifestHash, files, totalBytes, url, stagedDir, probe }) {
  const rule = '─'.repeat(72)

  console.log(`\n${rule}`)
  console.log(`  ${manifest.name} (${appId}) v${manifest.version} — ${mode === 'dev' ? 'staged locally' : 'pinned to IPFS'}`)
  console.log(rule)

  // The block a vendor copies: package identity plus the two verified values.
  console.log(
    JSON.stringify(
      { appId, cid, manifestHash, version: manifest.version, entry: manifest.entry },
      null,
      2
    )
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n')
  )

  console.log(`\n  package     ${files.length} file(s), ${formatBytes(totalBytes)}`)
  console.log(`  served from ${url}`)
  if (stagedDir) console.log(`  staged at   ${path.relative(REPO_ROOT, stagedDir)}`)
  if (probe) console.log(`  gateway     ${probe.state} — ${probe.detail}`)

  console.log('\n  On-chain submission (MiniAppRegistry, cohort registry chain):\n')
  console.log('    First listing — submitApp(name, description, category, cid, manifestHash)')
  console.log(`      name          ${JSON.stringify(manifest.name)}   (from the package manifest)`)
  console.log('      description   your listing copy      (vendor-supplied; not in the package)')
  console.log('      category      0 TradeSettlement · 1 Reconciliation · 2 TreasuryLiquidity')
  console.log('                    3 IdentityCompliance · 4 AssetServicing · 5 ReportingAudit')
  console.log(`      cid           ${JSON.stringify(cid)}`)
  console.log(`      manifestHash  ${manifestHash}`)
  console.log('\n    New version   — submitUpdate(id, cid, manifestHash)')
  console.log('      id            the app id submitApp returned')
  console.log(`      cid           ${JSON.stringify(cid)}`)
  console.log(`      manifestHash  ${manifestHash}`)

  console.log('\n  The listing lands Pending. The previously approved package keeps serving')
  console.log('  until a curator approves this one.')

  if (mode === 'dev') {
    const gatewayUrl = new URL(url)
    const port = gatewayUrl.port || (gatewayUrl.protocol === 'https:' ? '443' : '80')
    console.log(`\n  --dev did NOT pin anything. "${cid}" is a local staging id derived from the`)
    console.log('  manifest hash, not an IPFS CID: it resolves only against a gateway rooted at')
    console.log(`  ${path.relative(REPO_ROOT, DEV_STAGING_ROOT)}. Serve it, e.g.:`)
    console.log(`\n      npx --yes serve ${path.relative(REPO_ROOT, DEV_STAGING_ROOT)} -l ${port}`)
    console.log(`      VITE_MINIAPP_GATEWAY=${gatewayUrl.origin} npm run frontend`)
  }

  console.log(`${rule}\n`)
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }

  // The preset is ESM (tools/miniapp-build/package.json declares `type: module`)
  // and this script is CommonJS like the rest of scripts/ — importing it is how
  // the packaging contract stays in ONE place instead of being restated here.
  const { APP_ID_PATTERN, MANIFEST_FILENAME } = await import(pathToFileURL(path.join(PRESET_DIR, 'constants.js')))
  const { verifyPackageDigests } = await import(pathToFileURL(path.join(PRESET_DIR, 'packageIntegrity.js')))

  const packageDir = resolvePackageDir(args.app, APP_ID_PATTERN)
  const appId = args.app
  const gateway = normalizeGateway(args.gateway || (args.dev ? DEFAULT_DEV_GATEWAY : DEFAULT_PIN_GATEWAY))

  // Credentials are checked BEFORE the build so an unconfigured environment
  // costs a message instead of a build, and so the suggestion to use --dev
  // arrives while it is still useful.
  let credentials = null
  if (!args.dev) {
    credentials = readPinataCredentials()
    if (!credentials) {
      fail(
        'no Pinata credentials in the environment — set PINATA_JWT (or PINATA_API_KEY + PINATA_SECRET_KEY)\n' +
          '  to pin, or run with --dev to build and stage the package locally instead.'
      )
    }
    await verifyPinataAuth(credentials)
    console.log(`Pinata credentials (${credentials.kind}) accepted.`)
  }

  const distDir = runBuild(packageDir)

  // The preset's own check: every file on disk is listed in the manifest with a
  // matching sha256, and every listed file exists. A package that fails here
  // would be refused at launch by every host.
  const { files } = verifyPackageDigests(distDir)
  const built = hashManifest(distDir, MANIFEST_FILENAME)

  if (built.manifest.id !== appId) {
    fail(
      `manifest id "${built.manifest.id}" does not match the package directory "${appId}" — ` +
        `fix appId in ${path.relative(REPO_ROOT, path.join(packageDir, 'vite.config.js'))}; ` +
        'the host resolves /apps/:appId by this id'
    )
  }

  const published = publishedFiles(distDir, files, MANIFEST_FILENAME)
  const totalBytes = published.reduce((sum, file) => sum + file.size, 0)

  let cid
  let stagedDir = null
  let probe = null

  if (args.dev) {
    // Content-derived so identical bytes always stage to the same path; the
    // `dev` prefix makes it impossible to mistake for an IPFS CID.
    //
    // ALPHANUMERIC ONLY, deliberately: the host bounds the SHAPE of a package
    // address before it ever concatenates one into a gateway URL
    // (`loader.js#CID_PATTERN`, `/^[A-Za-z0-9]{10,120}$/`), which is what stops a
    // record carrying `../../etc` from escaping the package. Real CIDv1 base32 is
    // alphanumeric, so that allowlist costs nothing in production — but a
    // separator here (`dev-…`) would make every locally staged package refuse to
    // launch with "not a plain content identifier". The dev id bends to the
    // host's rule; the host's rule does not bend for a dev convenience.
    cid = `dev${built.hash.slice(2)}`
    stagedDir = stageForDev(distDir, cid)

    // Re-verify the STAGED copy: what the gateway will serve is what was hashed.
    verifyPackageDigests(stagedDir)
    const restaged = hashManifest(stagedDir, MANIFEST_FILENAME)
    if (restaged.hash !== built.hash) {
      fail(
        `the staged manifest hashes differently than the built one\n` +
          `  built  ${built.hash}\n  staged ${restaged.hash}\n` +
          '  Nothing was published; re-run the build.'
      )
    }
  } else {
    cid = await pinToIpfs(published, { appId, version: built.manifest.version, credentials })

    // Independent second read of the bytes that were uploaded, then the
    // authoritative check: read them back from the gateway and re-hash.
    const rehashed = hashManifest(distDir, MANIFEST_FILENAME)
    if (rehashed.hash !== built.hash) {
      fail(
        `${MANIFEST_FILENAME} changed on disk during publishing\n` +
          `  before ${built.hash}\n  after  ${rehashed.hash}\n` +
          `  The pin at ${cid} cannot be trusted — rebuild and publish again.`
      )
    }
    probe = await probeGateway(gateway, cid, built.hash, MANIFEST_FILENAME)
  }

  printReport({
    mode: args.dev ? 'dev' : 'pin',
    appId,
    manifest: built.manifest,
    cid,
    manifestHash: built.hash,
    files: published,
    totalBytes,
    url: `${gateway}/ipfs/${cid}/${MANIFEST_FILENAME}`,
    stagedDir,
    probe,
  })
}

main().catch((error) => {
  if (error instanceof PublishError) {
    console.error(`\n✖ publish failed: ${error.message}\n`)
  } else {
    console.error(`\n✖ publish failed: ${error?.stack || error}\n`)
  }
  process.exit(1)
})
