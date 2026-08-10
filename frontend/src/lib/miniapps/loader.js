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
 * - **Cancelled ⇒ say cancelled.** A caller that aborts (the member navigated
 *   away, the workspace unmounted) has not encountered a problem, so it gets
 *   {@link LoadCancelledError} rather than an availability error blaming a
 *   network that was never at fault.
 *
 * TWO ENTRY POINTS, ONE CHAIN OF CHECKS. {@link loadMiniApp} runs steps 1–6 for
 * a launch. {@link verifyMiniAppPackage} runs steps 1–5 and stops — the
 * curator's pre-approval check (FR-022), which must never execute the package it
 * is judging. Both go through the same `fetchVerifiedPackage`, deliberately: a
 * reviewer-only re-implementation of "fetch then verify" would drift, and the
 * way that drift shows up is a curator approving on the strength of a
 * verification that stopped testing what the launch tests.
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
  IntegrityError,
  ZERO_MANIFEST_HASH,
  normalizeBytes32Hex,
  verifyFileBytes,
  verifyManifestBytes,
} from './integrity'
import {
  HostApiError,
  ManifestError,
  MANIFEST_REFUSAL,
  manifestFileDigest,
  parseManifest,
} from './manifest'

// Re-exported so a caller catching launch failures imports one module. These are
// the same classes, not copies — `instanceof` works across the three files.
// Imported locally as well as re-exported because `verifyMiniAppPackage` classifies
// failures BY TYPE, and `export … from` alone creates no binding to test against.
export { IntegrityError, HostApiError, ManifestError, MANIFEST_REFUSAL }

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
 * The caller abandoned the load — the workspace unmounted, the member navigated
 * away, a newer launch superseded this one.
 *
 * Its own class because it is the one failure on this path that is NOT a
 * failure. Reporting it as {@link GatewayUnavailableError} ("every configured
 * gateway is unreachable — check your network") would be a lie about the
 * member's network, sent by the host to a workspace that no longer exists, and
 * would train whoever reads the logs to distrust a message that means something
 * real the rest of the time.
 *
 * `userMessage` exists for interface symmetry with the other refusals, but a
 * caller that cancelled deliberately should show NOTHING: the sentence is for
 * the rare case where a cancellation surfaces somewhere a member can see it.
 */
export class LoadCancelledError extends Error {
  /**
   * @param {string} path - the package file in flight when the abort landed, or null before any fetch
   * @param {Array<{gateway: string, reason: string, status: number|null}>} [attempts]
   */
  constructor(path, attempts = []) {
    super(`miniapp loader: the launch was cancelled${path ? ` while fetching "${path}"` : ' before it started'}`)
    this.name = 'LoadCancelledError'
    this.reason = 'cancelled'
    this.cancelled = true
    this.path = path
    this.attempts = attempts
    this.userMessage = 'Loading this app was cancelled before it finished.'
  }
}

/**
 * Refuse to keep working for a caller that has gone away. Called where the cost
 * of continuing is highest: before the first fetch, and immediately before the
 * verified bytes are made executable — a workspace that unmounted must not have
 * a package evaluate into it after the fact.
 */
function throwIfCancelled(signal, path = null) {
  if (signal?.aborted) throw new LoadCancelledError(path)
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
    // problem: it must not burn through the remaining gateways, and it must not
    // be reported as one — every gateway here may have been perfectly healthy.
    if (result.reason === 'cancelled') throw new LoadCancelledError(path, attempts)
  }
  throw new GatewayUnavailableError(path, attempts)
}

/** Default dynamic import. `@vite-ignore` — the URL is a runtime Blob URL, not a build-time module. */
const defaultImport = (url) => import(/* @vite-ignore */ url)

const defaultCreateObjectURL = (blob) => URL.createObjectURL(blob)
const defaultRevokeObjectURL = (url) => URL.revokeObjectURL(url)

/**
 * Vet a `(cid, manifestHash)` tuple's SHAPE, without any opinion about whether
 * it may be launched.
 *
 * Split out of {@link approvedPackageRef} so the reviewer's pre-approval
 * verification ({@link verifyMiniAppPackage}) can reuse the exact same checks on
 * a PROPOSED tuple — which by definition is not launchable, and which the
 * launchable gate would therefore refuse before a reviewer ever saw a digest.
 * Shape and permission are two different questions, and only the launch path
 * asks both.
 */
function packageTuple(ref) {
  const cid = typeof ref?.cid === 'string' ? ref.cid.trim() : ''
  const manifestHash = normalizeBytes32Hex(ref?.manifestHash)

  if (cid === '' || manifestHash === null || manifestHash === ZERO_MANIFEST_HASH) {
    throw new AppNotLaunchableError(
      'no_approved_package',
      'miniapp loader: the tuple carries no package (cid + manifestHash) — there is nothing to fetch or serve'
    )
  }
  if (!CID_PATTERN.test(cid)) {
    throw new AppNotLaunchableError(
      'invalid_cid',
      `miniapp loader: cid "${cid}" is not a plain content identifier`,
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
 * Read the approved package reference off a registry record, refusing anything
 * that is not launchable.
 *
 * Only `record.approved` is ever consulted. `record.proposed` — a version the
 * vendor has submitted but no curator has promoted — is not read here at all,
 * which is the strongest form the FR-011 rule can take: there is no branch that
 * could select it.
 */
function approvedPackageRef(record) {
  // THE SERVING DECISION IS `launchable`, NOT `status`. `status` is the REVIEW
  // state; `launchable` is the registry's own answer to "may a host run this?"
  // (`MiniAppRegistry.isLaunchable`, carried in every `AppView`). The two differ
  // in exactly the case FR-003/FR-010 are about: a Pending record IS launchable
  // once a package has been approved before — that is a LIVE app with an update
  // in review, still serving its last reviewed bytes. Refusing it because the
  // status reads Pending would hand every vendor an offline switch for their own
  // live app, just by submitting something.
  //
  // `status` remains the fallback for a record assembled WITHOUT the chain's
  // decision — a hand-built record, or one that did not come through
  // `registryClient.normalizeApp` (which always sets `launchable`). An ABSENT
  // decision is refused exactly like a negative one: a backstop that stops
  // existing when a field is missing is not a backstop, and a partially-built
  // record must not get a launch with no lifecycle check at all, which is the
  // single thing this function exists to make impossible.
  const launchable = record?.launchable
  const servable =
    typeof launchable === 'boolean' ? launchable : Number(record?.status) === AppStatus.APPROVED
  if (!servable) {
    throw new AppNotLaunchableError(
      'not_approved',
      `miniapp loader: refusing to launch a record the registry does not report as launchable ` +
        `(launchable=${String(launchable)}, status=${String(record?.status)})`
    )
  }

  return packageTuple(record?.approved)
}

/**
 * Fetch a package and verify every byte of it — steps 1–5 of the chain in this
 * file's header — WITHOUT making any of it executable.
 *
 * This exists as its own function so the launch path and the curator's
 * pre-approval check are literally the same code. Two parallel implementations
 * of "fetch then verify" would eventually disagree, and the way they disagree
 * is that one of them stops checking something — which on the reviewer's side
 * means a curator approving a package on the strength of a verification that
 * did not test what the launch will test.
 *
 * Nothing here mints a Blob URL or calls `import()`. Turning verified bytes into
 * code happens in exactly one place ({@link loadMiniApp}), after this returns.
 *
 * @param {{cid: string, manifestHash: string}} tuple - an already shape-vetted package reference
 * @param {object} options - see {@link loadMiniApp}; plus `verifyAllDeclaredFiles`
 * @param {boolean} [options.verifyAllDeclaredFiles] - also fetch and digest-check every OTHER path
 *   the manifest declares. Off for a launch (the host executes the entry and injects the declared
 *   stylesheets, and nothing else — fetching unused files would slow every launch and could refuse
 *   one over a file it never runs), on for a review (a reviewer asking "do the per-file digests
 *   match?" means the whole package, not the subset this host happens to execute).
 * @returns {Promise<{manifest: object, entryBytes: Uint8Array, styles: Array<{path: string, css: string}>,
 *   files: Array<{path: string, sha256: string, role: string}>, gateway: string}>}
 */
async function fetchVerifiedPackage({ cid, manifestHash }, options) {
  const {
    gateways,
    fetchImpl,
    timeoutMs,
    signal,
    expectedAppId,
    supportedHostApi,
    verifyAllDeclaredFiles = false,
  } = options

  const fetchOptions = { fetchImpl, timeoutMs, signal, maxBytes: MAX_MANIFEST_BYTES }

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
  const files = []

  /** Fetch one declared file and refuse it unless its bytes hash to the manifest's digest. */
  const fetchVerified = async (path, role) => {
    const expected = manifestFileDigest(manifest, path)
    const { bytes } = await fetchPackageFile(ordered, cid, path, fileOptions)
    verifyFileBytes(path, bytes, expected)
    files.push({ path, sha256: expected, role })
    return bytes
  }

  // (4) the executable bytes. Entry first — it is the critical path and a
  // failure here makes fetching stylesheets pointless.
  const entryBytes = await fetchVerified(manifest.entry, 'entry')

  const styles = []
  for (const path of manifest.styles) {
    const bytes = await fetchVerified(path, 'style')
    // Lenient decode on purpose: these bytes are already proven authentic, so a
    // stray byte sequence is a cosmetic flaw in an approved package, not a
    // reason to refuse a launch (unlike the manifest, where a decode surprise
    // would change what the host acts on).
    styles.push({ path, css: new TextDecoder('utf-8').decode(bytes) })
  }

  if (verifyAllDeclaredFiles) {
    const checked = new Set(files.map((file) => file.path))
    for (const path of Object.keys(manifest.files)) {
      if (checked.has(path)) continue
      await fetchVerified(path, 'declared')
    }
  }

  return { manifest, entryBytes, styles, files, gateway }
}

/**
 * Fetch, verify and import a mini-app package.
 *
 * @param {object} record - a registry record from `registryClient.js`; only
 *   `launchable`/`status` and `approved` are read (plus `appId`, when the caller
 *   has not named the app itself). The record MUST present a positive serving
 *   decision — an absent one refuses.
 * @param {object} [options]
 * @param {string[]} [options.gateways] - ordered gateway bases; defaults to {@link resolveMiniAppGateways}
 * @param {Function} [options.fetchImpl] - injectable `fetch` (tests, instrumentation)
 * @param {Function} [options.importImpl] - injectable dynamic import of the Blob URL
 * @param {Function} [options.createObjectURL] - injectable `URL.createObjectURL`
 * @param {Function} [options.revokeObjectURL] - injectable `URL.revokeObjectURL`
 * @param {number} [options.timeoutMs] - per-attempt timeout
 * @param {AbortSignal} [options.signal] - cancels an in-flight launch (unmount/navigation);
 *   an abort raises {@link LoadCancelledError}, never an availability error
 * @param {string} [options.expectedAppId] - the slug the host is launching; defaults to `record.appId`.
 *   Registry records carry no slug of their own, so the launch path derives one
 *   from the record's unique on-chain name (`registryClient.appSlug`) and names
 *   it here — without that, the manifest-id check below has nothing to compare
 *   against and does nothing.
 * @param {number} [options.supportedHostApi] - override for tests
 * @returns {Promise<{manifest: object, module: object, component: unknown,
 *   styles: Array<{path: string, css: string}>, gateway: string, cid: string, manifestHash: string}>}
 * @throws {AppNotLaunchableError|GatewayUnavailableError|LoadCancelledError|IntegrityError|ManifestError|HostApiError}
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

  // An already-aborted signal is a cancelled load, not a gateway problem — and
  // there is no reason to open a connection on behalf of a caller that is gone.
  throwIfCancelled(signal)

  const gateways = normalizeGateways(gatewayOption ?? resolveMiniAppGateways())
  if (gateways.length === 0) throw new GatewayUnavailableError(MANIFEST_FILENAME, [])

  const doFetch = fetchImpl || ((url, init) => globalThis.fetch(url, init))

  // (1)–(4) fetch + verify, in the one place that order is defined.
  const { manifest, entryBytes, styles, gateway } = await fetchVerifiedPackage(
    { cid, manifestHash },
    { gateways, fetchImpl: doFetch, timeoutMs, signal, expectedAppId, supportedHostApi }
  )

  // (5) EVERY check has passed. This is the first moment any package byte
  // becomes executable, and the Blob URL exists only for the duration of the
  // import (research R1). Last look at the signal first: a workspace that
  // unmounted mid-load must not have a package evaluate into it afterwards.
  throwIfCancelled(signal, manifest.entry)
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

/**
 * Stable codes for a verification outcome, so a reviewer surface can branch on
 * WHY a package could not be verified instead of reading a message.
 *
 * The distinction that matters most is `INTEGRITY` versus everything else.
 * `INTEGRITY` is a PROVEN disagreement: the package at that CID is not the
 * package the record's hash names, so nothing could ever launch from that tuple
 * and no amount of retrying changes it. The others are all forms of "we could
 * not establish that" — a gateway that would not answer, a cancelled check — or
 * "the bytes are authentic but the package is defective". Those are different
 * decisions for a curator, and a surface that collapsed them would either block
 * approvals during an outage or wave through a hash mismatch.
 */
export const VERIFICATION_FAILURE = Object.freeze({
  /** The tuple itself is unusable (empty/oversized CID, zero or malformed hash). */
  INVALID_REF: 'invalid_ref',
  /** Proven mismatch: manifest keccak or a file sha-256 disagrees with what was recorded. */
  INTEGRITY: 'integrity',
  /** Bytes are authentic, but the manifest is not a manifest this host can honor. */
  MANIFEST: 'manifest',
  /** Bytes are authentic; the package declares a host API newer than this build. */
  HOST_API: 'host_api',
  /** No gateway would serve the package — availability, not evidence about the package. */
  GATEWAY: 'gateway',
  /** The caller abandoned the check (navigation, a newer verification superseded it). */
  CANCELLED: 'cancelled',
  /** Anything unrecognised. Never treated as a pass. */
  UNEXPECTED: 'unexpected',
})

/**
 * Verify a package WITHOUT running any of it — the curator's pre-approval check
 * (FR-022, and the spec.md edge case "reviewers can see fetch/verification
 * failure before approving").
 *
 * Two properties make this worth having as its own entry point:
 *
 * 1. **It runs the launch path's checks, not a re-implementation of them.** The
 *    fetch → hash → parse → per-file-digest sequence is shared with
 *    {@link loadMiniApp} (see {@link fetchVerifiedPackage}), so a curator's
 *    "verified" means the same thing the host will mean at launch. A separate
 *    reviewer-only hasher would be the worst kind of drift: it would keep
 *    passing while the thing it claims to predict started failing.
 * 2. **It takes a TUPLE, not a record.** A reviewer verifies the *proposed*
 *    tuple, which is by definition not launchable — {@link loadMiniApp} refuses
 *    it, correctly, and would refuse it before fetching a byte. So the caller
 *    names the tuple it is reviewing and this function has no opinion about
 *    lifecycle at all.
 *
 * Nothing here can execute package code: there is no `importImpl` parameter, no
 * Blob is constructed, and the entry bytes are discarded on the way out. The
 * only thing a caller receives is a description of what was checked.
 *
 * Returns an OUTCOME rather than throwing, because every one of these failures
 * is a thing the reviewer needs rendered next to the record — not an exception
 * to be caught and flattened into "something went wrong".
 *
 * @param {{cid: string, manifestHash: string}} tuple - the package reference being reviewed
 * @param {object} [options] - as {@link loadMiniApp} (`gateways`, `fetchImpl`, `timeoutMs`,
 *   `signal`, `expectedAppId`, `supportedHostApi`)
 * @returns {Promise<
 *   {ok: true, manifest: object, files: Array<{path: string, sha256: string, role: string}>,
 *    gateway: string, cid: string, manifestHash: string} |
 *   {ok: false, code: string, reason: string|null, path: string|null, expected: string|null,
 *    actual: string|null, message: string, userMessage: string, error: Error,
 *    cid: string|null, manifestHash: string|null}
 * >}
 */
export async function verifyMiniAppPackage(tuple, options = {}) {
  const {
    gateways: gatewayOption,
    fetchImpl,
    timeoutMs = GATEWAY_TIMEOUT_MS,
    signal = null,
    expectedAppId = null,
    supportedHostApi,
  } = options

  /** Shape one failure the same way every time, so the caller has one branch to write. */
  const failure = (code, error, detail = {}) => ({
    ok: false,
    code,
    reason: error?.reason ?? null,
    path: detail.path ?? error?.path ?? null,
    expected: error?.expected ?? null,
    actual: error?.actual ?? null,
    message: error?.message || String(error),
    userMessage: error?.userMessage || 'This package could not be verified.',
    error: error instanceof Error ? error : new Error(String(error)),
    cid: detail.cid ?? null,
    manifestHash: detail.manifestHash ?? null,
  })

  let ref
  try {
    ref = packageTuple(tuple)
  } catch (error) {
    return failure(VERIFICATION_FAILURE.INVALID_REF, error)
  }

  const gateways = normalizeGateways(gatewayOption ?? resolveMiniAppGateways())
  if (gateways.length === 0) {
    return failure(VERIFICATION_FAILURE.GATEWAY, new GatewayUnavailableError(MANIFEST_FILENAME, []), ref)
  }

  const doFetch = fetchImpl || ((url, init) => globalThis.fetch(url, init))

  try {
    const { manifest, files, gateway } = await fetchVerifiedPackage(ref, {
      gateways,
      fetchImpl: doFetch,
      timeoutMs,
      signal,
      expectedAppId,
      supportedHostApi,
      // A reviewer's question is about the whole package, not the subset this
      // host executes — see the option's doc on `fetchVerifiedPackage`.
      verifyAllDeclaredFiles: true,
    })
    return { ok: true, manifest, files, gateway, cid: ref.cid, manifestHash: ref.manifestHash }
  } catch (error) {
    if (error instanceof IntegrityError) return failure(VERIFICATION_FAILURE.INTEGRITY, error, ref)
    if (error instanceof HostApiError) return failure(VERIFICATION_FAILURE.HOST_API, error, ref)
    if (error instanceof ManifestError) return failure(VERIFICATION_FAILURE.MANIFEST, error, ref)
    if (error instanceof LoadCancelledError) return failure(VERIFICATION_FAILURE.CANCELLED, error, ref)
    if (error instanceof GatewayUnavailableError) return failure(VERIFICATION_FAILURE.GATEWAY, error, ref)
    if (error instanceof AppNotLaunchableError) return failure(VERIFICATION_FAILURE.INVALID_REF, error, ref)
    // Unrecognised: recorded as a failure, never as a pass. A verification that
    // "passes" because nobody predicted the exception is the failure mode this
    // whole surface exists to prevent.
    return failure(VERIFICATION_FAILURE.UNEXPECTED, error, ref)
  }
}
