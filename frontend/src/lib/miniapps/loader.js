/**
 * Mini-app package loader (spec 073, research R1/R3/R7 · FR-011, FR-012).
 *
 * This module decides what executes. It is the whole of the platform's
 * supply-chain promise in one function, and its order of operations IS the
 * security property:
 *
 *   1. take the registry record's **approved** tuple only (never `proposed`)
 *   2. fetch `manifest.json`, failing over across the configured gateways
 *   3. `keccak256(manifest bytes) === approved.manifestHash` — BEFORE parsing
 *   4. parse + validate the manifest as the runtime contract
 *   5. fetch the entry (and any declared stylesheet), `sha256` each against the
 *      now-authenticated manifest
 *   6. only then wrap the verified entry bytes in a `Blob` and `import()` the
 *      object URL, revoking it once the module has evaluated
 *
 * Nothing from a package can execute before every one of those checks passes:
 * the bytes are inert until step 6, and step 6 is the only place a Blob URL is
 * ever minted. That is why `script-src` needs `blob:` and nothing more — the
 * host is the only party that can create one, and it only does so after
 * verification. Importing a gateway URL directly would have required `https:`
 * in `script-src`, which spec 069 deliberately confined to `connect-src`.
 *
 * Two refusal policies deserve their reasons stated:
 *
 * - **Unreachable ⇒ fail over. Tampered ⇒ stop.** FR-012's failover exists for
 *   availability (a firewalled or down gateway), so transport failures try the
 *   next gateway. A hash mismatch is not an availability problem: it is a
 *   supply-chain event that must surface and be audited, so it is terminal.
 *   Quietly retrying elsewhere would turn "one gateway is serving tampered
 *   bytes" into "the launch was a bit slow".
 * - **Unverifiable ⇒ never fetched.** Only paths listed in the verified
 *   manifest are requested, so there is no code path that downloads bytes it
 *   has no digest for.
 *
 * The loader never reads the registry itself (`registryClient.js` owns that);
 * it is handed the record so the caller keeps the FR-010 status re-check where
 * it belongs — at launch time, in the workspace.
 *
 * `fetchImpl` / `importImpl` / the object-URL pair are injectable so the whole
 * chain is testable without a network and without a browser module loader.
 */

import { AppStatus } from '../../abis/miniAppRegistry'
import { IPFS_GATEWAY } from '../../constants/ipfs'
import {
  ZERO_MANIFEST_HASH,
  normalizeBytes32Hex,
  verifyFileBytes,
  verifyManifestBytes,
} from './integrity'
import { ManifestError, MANIFEST_REFUSAL, manifestFileDigest, parseManifest } from './manifest'

// Re-exported so a caller catching launch failures imports one module. These are
// the same classes, not copies — `instanceof` works across the three files.
export { IntegrityError } from './integrity'
export { HostApiError, ManifestError, MANIFEST_REFUSAL } from './manifest'

/** The package file that anchors the integrity chain. */
export const MANIFEST_FILENAME = 'manifest.json'

/**
 * Per-attempt timeout. Generous enough for a cold gateway on a corporate VPN,
 * short enough that a black-holed primary still leaves room for the fallbacks
 * inside SC-002's 5-second first-launch budget.
 */
export const GATEWAY_TIMEOUT_MS = 15_000

/**
 * Response size ceilings. A gateway is untrusted, so it can answer a small
 * request with an unbounded body; without a cap the tab would buffer it to
 * death before the hash ever got a chance to reject it.
 */
export const MAX_MANIFEST_BYTES = 64 * 1024
export const MAX_FILE_BYTES = 8 * 1024 * 1024

/**
 * A CID as it may appear in a URL path. The registry bounds the string on-chain;
 * this bounds its *shape*, so a record carrying `../../etc` or `x?foo=` can
 * never be concatenated into a gateway URL.
 */
const CID_PATTERN = /^[A-Za-z0-9]{10,120}$/

/** Hosts for which plain `http:` is acceptable — a developer's local dev gateway (research R11). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * The record does not describe something this host may launch. Raised before
 * any byte is fetched, so it is also the defence-in-depth backstop for FR-011's
 * "approved tuple only" rule if a caller ever hands over a proposed tuple.
 */
export class AppNotLaunchableError extends Error {
  /**
   * @param {string} reason - `not_approved` | `no_approved_package` | `invalid_cid` | `invalid_manifest_hash`
   * @param {string} message - developer/log detail
   * @param {{userMessage?: string}} [detail]
   */
  constructor(reason, message, detail = {}) {
    super(message)
    this.name = 'AppNotLaunchableError'
    this.reason = reason
    this.userMessage =
      detail.userMessage ??
      'This app is not currently approved for launch. Its catalog entry has been updated.'
  }
}

/**
 * Every configured gateway failed to serve a file. Carries the per-gateway
 * attempt log so the availability message can say what was tried without
 * inventing a cause.
 */
export class GatewayUnavailableError extends Error {
  /**
   * @param {string} path - the package file that could not be fetched
   * @param {Array<{gateway: string, reason: string, status: number|null}>} attempts
   */
  constructor(path, attempts) {
    const summary = attempts.map((a) => `${a.gateway} (${a.reason}${a.status ? ` ${a.status}` : ''})`).join(', ')
    super(
      `miniapp loader: no gateway could serve "${path}"${summary ? ` — tried ${summary}` : ' — no gateway configured'}`
    )
    this.name = 'GatewayUnavailableError'
    this.reason = attempts.length === 0 ? 'no_gateway_configured' : 'all_gateways_failed'
    this.path = path
    this.attempts = attempts
    this.userMessage =
      attempts.length === 0
        ? 'No app package gateway is configured for this environment, so apps cannot be launched here.'
        : 'The app package could not be downloaded — every configured gateway is unreachable. ' +
          'Check your network or VPN connection and try again.'
  }
}

/**
 * Normalize and vet a list of gateway base URLs.
 *
 * A gateway base is turned into an executable-bytes URL, so its scheme is
 * load-bearing: anything but `https:` (or `http:` on loopback, for the local
 * dev gateway) is dropped rather than trusted. Trailing slashes are stripped and
 * duplicates collapsed so the failover list is the list of *distinct* things to
 * try.
 *
 * @param {Iterable<string>} candidates
 * @returns {string[]} usable bases, in the given order
 */
export function normalizeGateways(candidates) {
  const seen = new Set()
  const gateways = []
  for (const candidate of candidates || []) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed === '') continue

    let url
    try {
      url = new URL(trimmed)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) continue

    const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '')
    if (seen.has(base)) continue
    seen.add(base)
    gateways.push(base)
  }
  return gateways
}

/**
 * The gateway list for this environment: `VITE_MINIAPP_GATEWAY` (one or more,
 * comma-separated) ahead of the existing IPFS gateway seam (research R7).
 * Read at call time, not at module load, so a tenant/env change — or a test —
 * takes effect without a reload.
 *
 * @returns {string[]}
 */
export function resolveMiniAppGateways() {
  const configured = String(import.meta.env.VITE_MINIAPP_GATEWAY || '').split(',')
  return normalizeGateways([...configured, IPFS_GATEWAY])
}

/** Build the URL for one package file. Every segment is encoded; none can escape the CID. */
function packageFileUrl(gateway, cid, path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `${gateway}/ipfs/${cid}/${encoded}`
}

/**
 * One fetch attempt against one gateway.
 *
 * Returns an outcome rather than throwing so the caller can decide whether a
 * failure is worth failing over for — transport problems are, and only
 * transport problems reach here.
 *
 * @returns {Promise<{ok: true, bytes: Uint8Array}|{ok: false, reason: string, status: number|null}>}
 */
async function fetchAttempt(url, { fetchImpl, timeoutMs, maxBytes, signal }) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, timeoutMs)
  if (signal) {
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  }

  try {
    let response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        // The gateway is untrusted and needs nothing from us: never attach
        // ambient cookies or HTTP auth to a package fetch (v1 gateways are
        // unauthenticated by design — research R7).
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      })
    } catch (error) {
      const aborted = error?.name === 'AbortError'
      // A caller abort and a timeout both surface as AbortError; only the
      // external signal distinguishes "the member left" from "the gateway hung".
      const reason = aborted ? (signal?.aborted ? 'cancelled' : 'timeout') : 'network_error'
      return { ok: false, reason, status: null }
    }

    if (!response?.ok) return { ok: false, reason: 'http_error', status: response?.status ?? null }

    // Refuse an oversize body before buffering it, when the gateway is honest
    // enough to declare a length; re-checked after the read for when it is not.
    const declared = Number(response.headers?.get?.('content-length') ?? NaN)
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, reason: 'oversize', status: response.status ?? null }
    }

    let buffer
    try {
      buffer = await response.arrayBuffer()
    } catch {
      return { ok: false, reason: 'body_read_failed', status: response.status ?? null }
    }
    if (buffer.byteLength > maxBytes) return { ok: false, reason: 'oversize', status: response.status ?? null }

    return { ok: true, bytes: new Uint8Array(buffer) }
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', abort)
  }
}

/**
 * Fetch one package file, trying each gateway in order (FR-012).
 *
 * @returns {Promise<{bytes: Uint8Array, gateway: string}>}
 * @throws {GatewayUnavailableError} when every gateway failed
 */
async function fetchPackageFile(gateways, cid, path, options) {
  const attempts = []
  for (const gateway of gateways) {
    const result = await fetchAttempt(packageFileUrl(gateway, cid, path), options)
    if (result.ok) return { bytes: result.bytes, gateway }
    attempts.push({ gateway, reason: result.reason, status: result.status })
    // A caller-cancelled load (unmount, navigation) is not an availability
    // problem and must not burn through the remaining gateways.
    if (result.reason === 'cancelled') break
  }
  throw new GatewayUnavailableError(path, attempts)
}

/** Default dynamic import. `@vite-ignore` — the URL is a runtime Blob URL, not a build-time module. */
const defaultImport = (url) => import(/* @vite-ignore */ url)

const defaultCreateObjectURL = (blob) => URL.createObjectURL(blob)
const defaultRevokeObjectURL = (url) => URL.revokeObjectURL(url)

/**
 * Read the approved package reference off a registry record, refusing anything
 * that is not launchable.
 *
 * Only `record.approved` is ever consulted. `record.proposed` — a version the
 * vendor has submitted but no curator has promoted — is not read here at all,
 * which is the strongest form the FR-011 rule can take: there is no branch that
 * could select it.
 */
function approvedPackageRef(record) {
  // An ABSENT status is refused exactly like a wrong one. A backstop that stops
  // existing when a field is missing is not a backstop: a caller that handed
  // over a partially-built record (or one assembled by hand) would otherwise get
  // a launch with no lifecycle check at all, which is the single thing this
  // function exists to make impossible. `registryClient.normalizeApp` always
  // sets `status`, so nothing on the real launch path is affected.
  if (Number(record?.status) !== AppStatus.APPROVED) {
    throw new AppNotLaunchableError(
      'not_approved',
      `miniapp loader: refusing to launch app with status ${String(record?.status)} (only Approved launches)`
    )
  }

  const approved = record?.approved
  const cid = typeof approved?.cid === 'string' ? approved.cid.trim() : ''
  const manifestHash = normalizeBytes32Hex(approved?.manifestHash)

  if (cid === '' || manifestHash === null || manifestHash === ZERO_MANIFEST_HASH) {
    throw new AppNotLaunchableError(
      'no_approved_package',
      'miniapp loader: the record carries no approved package (cid + manifestHash) — nothing has been approved to serve'
    )
  }
  if (!CID_PATTERN.test(cid)) {
    throw new AppNotLaunchableError(
      'invalid_cid',
      `miniapp loader: approved cid "${cid}" is not a plain content identifier`,
      {
        userMessage:
          'This app record points at a package address the platform cannot resolve, so it was not run. ' +
          'Please report this to the platform team.',
      }
    )
  }
  return { cid, manifestHash }
}

/**
 * Fetch, verify and import a mini-app package.
 *
 * @param {object} record - a registry record from `registryClient.js`; only
 *   `status` and `approved` are read (plus `appId`, when the caller has not
 *   named the app itself). `status` MUST be Approved — an absent one refuses.
 * @param {object} [options]
 * @param {string[]} [options.gateways] - ordered gateway bases; defaults to {@link resolveMiniAppGateways}
 * @param {Function} [options.fetchImpl] - injectable `fetch` (tests, instrumentation)
 * @param {Function} [options.importImpl] - injectable dynamic import of the Blob URL
 * @param {Function} [options.createObjectURL] - injectable `URL.createObjectURL`
 * @param {Function} [options.revokeObjectURL] - injectable `URL.revokeObjectURL`
 * @param {number} [options.timeoutMs] - per-attempt timeout
 * @param {AbortSignal} [options.signal] - cancels an in-flight launch (unmount/navigation)
 * @param {string} [options.expectedAppId] - the slug the host is launching; defaults to `record.appId`
 * @param {number} [options.supportedHostApi] - override for tests
 * @returns {Promise<{manifest: object, module: object, component: unknown,
 *   styles: Array<{path: string, css: string}>, gateway: string, cid: string, manifestHash: string}>}
 * @throws {AppNotLaunchableError|GatewayUnavailableError|IntegrityError|ManifestError|HostApiError}
 */
export async function loadMiniApp(record, options = {}) {
  const {
    gateways: gatewayOption,
    fetchImpl,
    importImpl = defaultImport,
    createObjectURL = defaultCreateObjectURL,
    revokeObjectURL = defaultRevokeObjectURL,
    timeoutMs = GATEWAY_TIMEOUT_MS,
    signal = null,
    expectedAppId = record?.appId ?? null,
    supportedHostApi,
  } = options

  const { cid, manifestHash } = approvedPackageRef(record)

  const gateways = normalizeGateways(gatewayOption ?? resolveMiniAppGateways())
  if (gateways.length === 0) throw new GatewayUnavailableError(MANIFEST_FILENAME, [])

  const doFetch = fetchImpl || ((url, init) => globalThis.fetch(url, init))
  const fetchOptions = { fetchImpl: doFetch, timeoutMs, signal, maxBytes: MAX_MANIFEST_BYTES }

  // (1) manifest bytes, with failover.
  const { bytes: manifestBytes, gateway } = await fetchPackageFile(gateways, cid, MANIFEST_FILENAME, fetchOptions)

  // (2) authenticate the bytes against the chain BEFORE they are parsed. Until
  // this line returns, the manifest is untrusted gateway output — not a
  // document whose `entry` field may be acted on.
  verifyManifestBytes(manifestBytes, manifestHash)

  // (3) now it is safe to read the package's own runtime contract.
  const manifest = parseManifest(
    manifestBytes,
    supportedHostApi === undefined ? undefined : { supportedHostApi }
  )

  if (expectedAppId && manifest.id !== expectedAppId) {
    // The app id is the namespace root for the per-app store and the ledger
    // entry ids. A package claiming a different id than the record being
    // launched would read and write another app's data.
    throw new ManifestError(
      MANIFEST_REFUSAL.IDENTITY_MISMATCH,
      `miniapp loader: manifest id "${manifest.id}" does not match the launched app "${expectedAppId}"`,
      {
        field: 'id',
        userMessage:
          'This package identifies itself as a different app than the one being launched, so it was not run. ' +
          'Please report this to the platform team.',
      }
    )
  }

  // The verified manifest came from this gateway, so try it first for the rest
  // of the package; the others stay in the list as fallbacks.
  const ordered = [gateway, ...gateways.filter((g) => g !== gateway)]
  const fileOptions = { ...fetchOptions, maxBytes: MAX_FILE_BYTES }

  /** Fetch one declared file and refuse it unless its bytes hash to the manifest's digest. */
  const fetchVerified = async (path) => {
    const expected = manifestFileDigest(manifest, path)
    const { bytes } = await fetchPackageFile(ordered, cid, path, fileOptions)
    verifyFileBytes(path, bytes, expected)
    return bytes
  }

  // (4) the executable bytes. Entry first — it is the critical path and a
  // failure here makes fetching stylesheets pointless.
  const entryBytes = await fetchVerified(manifest.entry)

  const styles = []
  for (const path of manifest.styles) {
    const bytes = await fetchVerified(path)
    // Lenient decode on purpose: these bytes are already proven authentic, so a
    // stray byte sequence is a cosmetic flaw in an approved package, not a
    // reason to refuse a launch (unlike the manifest, where a decode surprise
    // would change what the host acts on).
    styles.push({ path, css: new TextDecoder('utf-8').decode(bytes) })
  }

  // (5) EVERY check has passed. This is the first moment any package byte
  // becomes executable, and the Blob URL exists only for the duration of the
  // import (research R1).
  const objectUrl = createObjectURL(new Blob([entryBytes], { type: 'text/javascript' }))
  let module
  try {
    module = await importImpl(objectUrl)
  } finally {
    revokeObjectURL(objectUrl)
  }

  if (typeof module?.default !== 'function') {
    // Integrity held — these are exactly the approved bytes. They simply do not
    // honor the entry contract (`contracts/host-context.md`: default-export a
    // mountable component), which is a package defect, not a tampering event.
    throw new ManifestError(
      MANIFEST_REFUSAL.ENTRY_NO_DEFAULT_EXPORT,
      `miniapp loader: entry "${manifest.entry}" does not default-export a component`,
      {
        field: 'entry',
        userMessage:
          'This app package did not provide a screen to display. Please report this to the platform team.',
      }
    )
  }

  return {
    manifest,
    module,
    component: module.default,
    styles,
    gateway,
    cid,
    manifestHash,
  }
}
