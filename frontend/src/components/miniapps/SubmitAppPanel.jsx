/**
 * SubmitAppPanel (spec 073 T034/T035, US3 · FR-021/FR-023) — the vendor's side of the registry.
 *
 * The catalog is what members see; this is where the listings come from. A developer submits a new
 * listing, submits a new package for one they already own, edits its reviewed metadata, and watches
 * what the curator queue has done with all of it. Every write lands on the SAME registry the host
 * launches from (`miniAppChainId()`), because a submission recorded anywhere else would be invisible
 * to the surface that decides what runs.
 *
 * Four rules shape this file, and each one exists because the obvious alternative misleads a vendor.
 *
 * **1. AN UPDATE DOES NOT TAKE THE APP OFFLINE, AND IT DOES NOT SHIP (FR-003).** This is the single
 * most misunderstandable fact on the surface, so it is stated as prose next to every control that
 * causes it — never as a tooltip, never once at the top. `submitUpdate` and `updateMetadata` write the
 * record's PROPOSED tuple and reset `status` to Pending; they do not touch the APPROVED tuple, which
 * is the only tuple a host ever serves. So a vendor with a live app keeps serving the package a
 * curator already reviewed for the whole time the new one sits in the queue — and, symmetrically,
 * nothing they submit reaches a member until a curator approves it. A vendor who believes either half
 * wrongly does real damage: one who thinks an update goes live immediately ships untested behavior in
 * their head, and one who thinks it takes them offline never updates at all.
 *
 * **2. THE VERSION NUMBER IS THE CONTRACT'S TO ISSUE, AND WE DO NOT GUESS IT.** There is no version
 * field on any form here. `MiniAppRegistry` keeps a per-app high-water mark (`lastVersion`) that it
 * increments on every submission and NEVER reuses, including across rejections — so a compliance log
 * cannot say "v2 rejected" and later "v2 approved" about different bytes. That mark is private state
 * with no getter, and it can legitimately be HIGHER than either live tuple (a rejected proposal is
 * cleared, its number is not). Predicting "your update will be v3" from the tuples on screen would
 * therefore be wrong exactly when a vendor has had something rejected — the moment they are paying
 * closest attention. So the panel shows the versions that exist and says plainly that the registry
 * issues the next one.
 *
 * **3. THE CHAIN IS AUTHORITATIVE; OUR CHECKS ARE A COURTESY.** Everything validated here mirrors a
 * rule `MiniAppRegistry` enforces itself (name bounds in BYTES, control bytes, blank-after-folding,
 * CID and manifest-hash presence) — the point is to spend a vendor's time instead of their gas, not
 * to become a second gate. Where our check is stricter than the chain's (an unrecognised CID shape, a
 * manifest that does not hash to the entered value, a name that cannot become a URL slug) the panel
 * says so and says why it matters, and a definite hash mismatch is the only client-side finding that
 * holds up a submission — behind an explicit acknowledgement, because a vendor who understands the
 * consequence is allowed to proceed. We never silently refuse what the registry would have accepted.
 *
 * **4. A REFUSAL EXPLAINS ITSELF.** Wrong network is blocked at submit time with the direction to fix
 * it, never a dead button and never a silent no-op. Every custom error the registry can revert with is
 * decoded into a sentence a developer can act on, including the membership tier requirement — read
 * from the registry's own gate config rather than assumed, because the gate is admin-configurable and
 * differs per deployment.
 *
 * Writes go through the wallet's unified `sendCalls`, so a passkey smart-account session (no ethers
 * signer, one sponsored UserOp) and a classic injected wallet both work without a second code path.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Contract, Interface } from 'ethers'

import './miniapps.css'
import EmptyState from '../account/EmptyState'
import {
  APP_CATEGORY_LABELS,
  AppStatus,
  MINI_APP_REGISTRY_ABI,
} from '../../abis/miniAppRegistry'
import { isValidCid } from '../../constants/ipfs'
import { useWallet } from '../../hooks/useWalletManagement'
import { TIER_NAMES } from '../../hooks/useRoleDetails'
import { networkName } from '../../lib/chains/estate'
import {
  ZERO_MANIFEST_HASH,
  keccak256Hex,
  normalizeBytes32Hex,
} from '../../lib/miniapps/integrity'
import {
  GATEWAY_TIMEOUT_MS,
  MANIFEST_FILENAME,
  MAX_MANIFEST_BYTES,
  resolveMiniAppGateways,
} from '../../lib/miniapps/loader'
import { parseManifest } from '../../lib/miniapps/manifest'
import {
  REGISTRY_STATUS,
  appSlug,
  clearCatalogCache,
  fetchAppByName,
  fetchVendorApps,
  registryLocation,
} from '../../lib/miniapps/registryClient'
import { getReadProvider } from '../../utils/rpcProvider'

/** Back to the catalog this panel is a sub-view of (`?view=submit` on the same tab). */
const CATALOG_ROUTE = '/wallet?tab=apps'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// ---------------------------------------------------------------------------
// Bounds, mirrored from `MiniAppRegistry`. These are BYTE lengths, not character
// counts: the contract measures `bytes(name).length`, so a 40-character name of
// non-ASCII text can be 80 bytes on-chain and revert `StringTooLong` while a
// `String.length` check waved it through. Every length check below encodes first.
// ---------------------------------------------------------------------------
const NAME_MAX_BYTES = 64
const DESCRIPTION_MAX_BYTES = 512
const CID_MAX_BYTES = 256

/** How long an input must settle before we spend a network read on it (name lookup, manifest fetch). */
const CHECK_DEBOUNCE_MS = 450

/** The six operational categories in on-chain enum order (see CatalogPanel for why this is sorted). */
const CATEGORY_OPTIONS = Object.entries(APP_CATEGORY_LABELS)
  .map(([ordinal, label]) => ({ value: Number(ordinal), label }))
  .sort((a, b) => a.value - b.value)

/** Review-state labels. `status` is the REVIEW state — never the answer to "is this app serving?". */
const STATUS_LABELS = Object.freeze({
  [AppStatus.PENDING]: 'In review',
  [AppStatus.APPROVED]: 'Approved',
  [AppStatus.SUSPENDED]: 'Suspended',
  [AppStatus.DEPRECATED]: 'Retired',
})

/**
 * The FR-003 sentence, in the two shapes it legitimately takes.
 *
 * Which one a vendor needs depends on whether they have anything serving. Telling a first-time
 * submitter that "members keep running the approved package" would be a comforting lie — there is no
 * approved package — and telling a live vendor that an update "replaces what is in the queue" would
 * hide the fact that their production app is untouched. Both halves of the promise are stated in the
 * live case, because a vendor who believes an update ships immediately is as badly served as one who
 * believes it takes them offline.
 */
const UPDATE_KEEPS_SERVING_LIVE =
  'Submitting this does not take your app offline, and it does not ship. The listing goes back to ' +
  'review, but members keep running the package a curator already approved — the whole time it is ' +
  'queued. Nothing you submit reaches anyone until a curator approves this exact package.'

const UPDATE_KEEPS_SERVING_NOT_LIVE =
  'This listing has never been approved, so nothing is serving to members yet. Submitting this ' +
  'replaces the package waiting in the review queue; it goes live only when a curator approves it.'

/**
 * The other half of the content-committed approval (FR-004a), told from the vendor's side.
 *
 * A curator approves a specific manifest hash, so a submission that lands while their approval is
 * in flight invalidates it — the transaction reverts `StaleProposal` and the review starts over.
 * That is the intended protection (it is what stops a vendor swapping bytes under a signature), but a
 * vendor who does not know about it experiences an unexplained delay and re-submits, making it worse.
 */
const RESUBMIT_RESETS_REVIEW =
  'If a curator is already reviewing your current package, submitting a new one cancels that review: ' +
  'their approval names the exact package they read, so it can no longer go through. Expect the ' +
  'review to start again from this submission.'

// ---------------------------------------------------------------------------
// Client-side pre-checks. Each returns `null` when the value is acceptable, or
// `{ code, message }` — `code` matching the contract error the chain would have
// reverted with, so the two vocabularies stay one vocabulary.
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder()

/** UTF-8 byte length — what the contract measures. See the bounds note above. */
function utf8Length(value) {
  return textEncoder.encode(String(value ?? '')).length
}

/**
 * Mirror of `MiniAppRegistry._checkMetadata`'s name rules, byte for byte.
 *
 * The two non-obvious rules are the ones a vendor is most likely to trip:
 *
 *  - **Blank after whitespace folding.** `"   "` passes any raw length check, folds to the empty name
 *    key, and would claim `keccak256("")` — the key every later blank name collides with. The contract
 *    rejects it with `EmptyName`, so we do too, and we say what "blank" means here.
 *  - **Control bytes.** C0 controls and DEL are invisible in a catalog card, so two listings carrying
 *    different ones would render identically to a member while holding different name keys. The
 *    contract rejects them outright rather than stripping them, and stripping them HERE would be worse
 *    than useless: the vendor would submit a name they never typed.
 */
function checkName(name) {
  const raw = textEncoder.encode(String(name ?? ''))
  if (raw.length === 0) {
    return { code: 'EmptyName', message: 'Enter a name for the listing.' }
  }
  if (raw.length > NAME_MAX_BYTES) {
    return {
      code: 'StringTooLong',
      message: `The registry accepts at most ${NAME_MAX_BYTES} bytes of name; this is ${raw.length}. Accented and non-Latin characters cost more than one byte each.`,
    }
  }
  let hasVisible = false
  for (let i = 0; i < raw.length; i += 1) {
    const byte = raw[i]
    // Every byte of a multi-byte UTF-8 sequence is >= 0x80, so this can only ever match a real ASCII
    // control character — the same reason the contract can iterate bytes safely.
    if (byte < 0x20 || byte === 0x7f) {
      return {
        code: 'InvalidName',
        message:
          'The name contains a control character (a tab, a line break, or a pasted invisible character). The registry rejects these because they are invisible in a catalog card. Retype the name rather than pasting it.',
      }
    }
    if (byte !== 0x20) hasVisible = true
  }
  if (!hasVisible) {
    return {
      code: 'EmptyName',
      message: 'A name of nothing but spaces counts as blank — the registry folds spaces away before storing it.',
    }
  }
  return null
}

/** Mirror of the description bound. Blank is allowed on-chain, so it is allowed here. */
function checkDescription(description) {
  const length = utf8Length(description)
  if (length > DESCRIPTION_MAX_BYTES) {
    return {
      code: 'StringTooLong',
      message: `The registry accepts at most ${DESCRIPTION_MAX_BYTES} bytes of description; this is ${length}.`,
    }
  }
  return null
}

/** Mirror of `MiniAppRegistry._checkPackage`'s CID rules. Shape is judged separately (a warning). */
function checkCid(cid) {
  const value = typeof cid === 'string' ? cid.trim() : ''
  if (value === '') {
    return { code: 'EmptyCid', message: 'Enter the content identifier (CID) of the published package directory.' }
  }
  const length = utf8Length(value)
  if (length > CID_MAX_BYTES) {
    return { code: 'StringTooLong', message: `The registry accepts at most ${CID_MAX_BYTES} bytes of CID; this is ${length}.` }
  }
  return null
}

/**
 * Mirror of the manifest-hash rule, plus the encoding rule ethers imposes on the way in.
 *
 * The contract only refuses `bytes32(0)`, but anything that is not 32 hex bytes cannot be encoded into
 * the call at all — so a typo would surface as an opaque ethers throw at the moment of signing rather
 * than as a field error while there is still something to fix.
 */
function checkManifestHash(hash) {
  const value = typeof hash === 'string' ? hash.trim() : ''
  if (value === '') {
    return { code: 'EmptyManifestHash', message: 'Enter the manifest hash printed by the publish script.' }
  }
  const normalized = normalizeBytes32Hex(value)
  if (normalized === null) {
    return {
      code: 'InvalidManifestHash',
      message: 'A manifest hash is 32 bytes of hex — 64 hex characters, normally written with a leading 0x.',
    }
  }
  if (normalized === ZERO_MANIFEST_HASH) {
    return {
      code: 'EmptyManifestHash',
      message: 'An all-zero hash could never match a real package, so the registry rejects it.',
    }
  }
  return null
}

/**
 * Advisory: does this look like an IPFS CID at all?
 *
 * The registry accepts any non-empty bounded string, so this cannot be an error — but the host fetches
 * packages by CID from a gateway, so a listing whose CID is not one has nothing to fetch and could
 * never launch. Saying so is more useful than a silent Approved-but-broken listing.
 */
function cidShapeWarning(cid) {
  const value = typeof cid === 'string' ? cid.trim() : ''
  if (value === '' || isValidCid(value)) return null
  return 'This does not look like an IPFS CID (a CIDv0 starts with “Qm”, a CIDv1 with “b”). The registry will store it either way, but the host fetches packages by CID — so a listing with a CID no gateway can resolve is a listing nobody can launch.'
}

/**
 * Advisory: can this name become the app's web address?
 *
 * The host has no id field on a registry record, so `/apps/:slug` is derived from the unique on-chain
 * NAME (`appSlug`), and that derivation refuses a lossy best effort — two distinct listings must never
 * collapse onto one URL. A name with no slug is catalogued and unreachable, which is exactly the kind
 * of thing a vendor should learn before paying for it rather than after.
 */
function nameSlugWarning(name) {
  const trimmed = String(name ?? '').trim()
  if (trimmed === '' || appSlug(trimmed)) return null
  return 'Members will not be able to open this listing: its web address is built from the registered name, and this name cannot become one. A usable name starts with a letter, is 2–31 characters after spaces are folded, and contains only letters, digits and single spaces.'
}

// ---------------------------------------------------------------------------
// Manifest pre-check — fetch the package's manifest and hash it, so a vendor
// learns their hash is wrong here rather than from a curator days later.
// ---------------------------------------------------------------------------

export const PRECHECK = Object.freeze({
  /** Nothing to check yet (a field is empty or malformed). */
  IDLE: 'idle',
  CHECKING: 'checking',
  /** The manifest at this CID hashes to the entered value. */
  MATCH: 'match',
  /** It hashes to something else. Definite, and the host would refuse to launch it. */
  MISMATCH: 'mismatch',
  /** We could not fetch it. NOT evidence of anything — a private gateway this build cannot reach. */
  UNREACHABLE: 'unreachable',
})

/**
 * Fetch `manifest.json` for a CID and compare its keccak-256 against the entered hash.
 *
 * Deliberately reuses `loader.js`'s gateway list and `integrity.js`'s hashing rather than rolling
 * either: this check is only worth anything if it computes the same number the launch path will, and a
 * second hashing implementation is a second chance to disagree with the chain.
 *
 * `UNREACHABLE` and `MISMATCH` are kept apart for the reason the registry client keeps its own
 * outcomes apart — "we could not look" and "we looked and it is wrong" call for opposite responses
 * from a vendor, and collapsing them would either block a correct submission behind an unreachable
 * private gateway or wave a broken one through.
 *
 * @param {{cid: string, manifestHash: string, expectedAppId?: string|null, gateways?: string[],
 *          fetchImpl?: Function, timeoutMs?: number, signal?: AbortSignal}} options
 */
async function precheckManifest({
  cid,
  manifestHash,
  expectedAppId = null,
  gateways,
  fetchImpl,
  timeoutMs = GATEWAY_TIMEOUT_MS,
  signal = null,
} = {}) {
  const expected = normalizeBytes32Hex(manifestHash)
  const trimmedCid = typeof cid === 'string' ? cid.trim() : ''
  if (!expected || expected === ZERO_MANIFEST_HASH || trimmedCid === '') {
    return { state: PRECHECK.IDLE }
  }

  const bases = gateways ?? resolveMiniAppGateways()
  const doFetch = fetchImpl || ((url, init) => globalThis.fetch(url, init))
  const attempts = []

  for (const base of bases) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    const timer = setTimeout(abort, timeoutMs)
    if (signal) {
      if (signal.aborted) abort()
      else signal.addEventListener('abort', abort, { once: true })
    }
    try {
      const response = await doFetch(`${base}/ipfs/${encodeURIComponent(trimmedCid)}/${MANIFEST_FILENAME}`, {
        method: 'GET',
        // The gateway is untrusted and needs nothing from us — same rule as the launch path.
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      })
      if (!response?.ok) {
        attempts.push({ gateway: base, status: response?.status ?? null })
        continue
      }
      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > MAX_MANIFEST_BYTES) {
        attempts.push({ gateway: base, status: response.status ?? null })
        continue
      }
      const bytes = new Uint8Array(buffer)
      const actual = keccak256Hex(bytes)
      if (actual !== expected) {
        return { state: PRECHECK.MISMATCH, expected, actual, gateway: base }
      }

      // The bytes are authenticated against the value being submitted, so reading them is safe. Two
      // things a vendor cannot see any other way come out of here: the human-readable display version
      // (which the on-chain uint64 is NOT — see rule 2 in the header), and the manifest's self-declared
      // id, which the launch path insists must equal the slug derived from the listing name.
      let manifest = null
      let manifestError = null
      try {
        manifest = parseManifest(bytes)
      } catch (error) {
        manifestError = error?.userMessage || error?.message || 'This manifest is not one the host can read.'
      }
      const idMismatch =
        manifest && expectedAppId && manifest.id !== expectedAppId
          ? { declared: manifest.id, expected: expectedAppId }
          : null

      return { state: PRECHECK.MATCH, expected, actual, gateway: base, manifest, manifestError, idMismatch }
    } catch {
      attempts.push({ gateway: base, status: null })
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', abort)
    }
  }

  return { state: PRECHECK.UNREACHABLE, expected, attempts }
}

// ---------------------------------------------------------------------------
// Contract error decoding.
// ---------------------------------------------------------------------------

/**
 * Pull a decoded custom error out of an ethers v6 failure, whether it arrived pre-decoded on `.revert`
 * or as raw selector bytes nested in an RPC payload. (Same shape as `CallsignPanel#extractRevert`;
 * a passkey UserOp failure nests the revert data one level deeper than a signer transaction does.)
 */
function extractRevert(error, iface) {
  if (error?.revert?.name) return { name: error.revert.name, args: error.revert.args }
  if (error?.errorName) return { name: error.errorName, args: error.errorArgs }
  const candidates = [error?.data, error?.info?.error?.data, error?.error?.data, error?.error?.error?.data]
  for (const data of candidates) {
    if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
      try {
        const parsed = iface.parseError(data)
        if (parsed) return { name: parsed.name, args: parsed.args }
      } catch {
        /* not one of ours — keep looking */
      }
    }
  }
  return null
}

/**
 * Turn a failed submission into guidance a developer can act on.
 *
 * `gate` is the registry's own membership configuration, read from the registry rather than assumed:
 * `minTier` is admin-configurable and differs per deployment, so a hardcoded "requires Gold" would be
 * confidently wrong on a network configured for Silver. When the gate could not be read we still say a
 * tier is required — that much the revert proves — and decline to name one we do not know.
 *
 * @param {unknown} error
 * @param {import('ethers').Interface} iface
 * @param {{enabled: boolean, minTier: number, chainId: number}|null} gate
 */
function describeRegistryError(error, iface, gate = null) {
  // A dismissed wallet prompt or passkey ceremony is a clean abort, not a failure.
  if (
    error?.name === 'CeremonyCancelled' ||
    error?.code === 'ACTION_REJECTED' ||
    /reject|denied/i.test(error?.message || '')
  ) {
    return 'You cancelled the transaction — nothing was submitted.'
  }

  const revert = extractRevert(error, iface)
  switch (revert?.name) {
    case 'DuplicateName':
      return 'Another listing already uses this name. The registry compares names with capitals folded and runs of spaces collapsed, so “Token Mint”, “token  mint” and “ TOKEN MINT ” are all the same name. Choose a different one.'
    case 'InvalidName':
      return 'The registry rejected the name because it contains a control character. Retype it rather than pasting it — a tab or line break can travel invisibly with copied text.'
    case 'EmptyName':
      return 'The registry treats this name as blank. A name made only of spaces folds away to nothing, so give it at least one visible character.'
    case 'StringTooLong':
      return `One of the fields is longer than the registry allows: at most ${NAME_MAX_BYTES} bytes of name, ${DESCRIPTION_MAX_BYTES} of description, ${CID_MAX_BYTES} of CID. These are byte lengths, so accented and non-Latin characters count more than once.`
    case 'EmptyCid':
      return 'The registry rejected an empty content identifier. Paste the CID of the published package directory.'
    case 'EmptyManifestHash':
      return 'The registry rejected an all-zero manifest hash — no real package could hash to it. Paste the hash printed by the publish script.'
    case 'InsufficientMembershipTier': {
      const tier = gate?.enabled ? TIER_NAMES[gate.minTier] : null
      const where = gate?.chainId != null ? ` on ${networkName(gate.chainId)}` : ''
      return tier
        ? `Listing an app requires ${tier} membership or above${where}, and this account does not hold it. Membership is checked at submission time, so upgrading and retrying is all that is needed.`
        : 'Listing an app on this registry requires a membership tier this account does not hold. Upgrade the membership on the registry’s network and retry — nothing else about the submission has to change.'
    }
    case 'SanctionedAccount':
      return 'This account is blocked by the registry’s sanctions screening, so it cannot list an app. If you believe that is wrong, contact the platform team — nothing you change on this form will alter it.'
    case 'NotVendor':
      return 'Only the wallet that first submitted this listing can change it — the registry records the vendor address permanently at submission. Connect that wallet, or submit a new listing from this one.'
    case 'AppNotFound':
      return 'The registry has no listing with that id. It may have been submitted on a different network.'
    case 'InvalidStatus':
      return 'This listing is suspended, and a suspended listing is frozen for its vendor too — that is what the suspension is for. A curator has to lift it before you can submit anything.'
    case 'AppDeprecatedError':
      return 'This listing has been retired permanently. Retirement is terminal on-chain: submit a new listing instead.'
    case 'StaleProposal':
      // Vendors do not call the content-committed lifecycle functions, so this can only reach here via
      // a curator-shaped call. Explain it as what it is rather than as a generic failure.
      return 'The package on this listing changed after the action was prepared, so it was refused. The registry binds approvals and rejections to the exact package that was reviewed — re-read the current package before acting on it again.'
    case 'AccessControlUnauthorizedAccount':
      return 'This account does not hold the role that action needs on the registry.'
    default:
      break
  }
  return error?.shortMessage || error?.reason || error?.message || 'The submission failed. Please try again.'
}

/**
 * Everything pure on this surface, in one frozen namespace.
 *
 * These are the CONTRACT's rules mirrored, so they belong beside the form that enforces them rather
 * than in a shared library nothing else would import — but they are also the part worth testing
 * directly, because a byte-length or control-byte rule that drifts from Solidity fails silently (a
 * vendor pays gas to learn a rule we could have told them, or is refused a submission the chain would
 * have taken). Exported as one constant rather than nine named functions because a `.jsx` module may
 * only export components and constants: `react-refresh/only-export-components` breaks fast refresh for
 * the whole file otherwise, and that rule is an error in this repo's lint config.
 */
export const SUBMISSION_CHECKS = Object.freeze({
  NAME_MAX_BYTES,
  DESCRIPTION_MAX_BYTES,
  CID_MAX_BYTES,
  utf8Length,
  checkName,
  checkDescription,
  checkCid,
  checkManifestHash,
  cidShapeWarning,
  nameSlugWarning,
  precheckManifest,
  describeRegistryError,
})

// ---------------------------------------------------------------------------
// Small presentational pieces.
// ---------------------------------------------------------------------------

/** A hash/CID shown short, with the full value available to copy and to assistive tech. */
function Mono({ value, chars = 10 }) {
  const text = String(value ?? '')
  if (text === '') return <span className="miniapp-submit-muted">—</span>
  const short = text.length > chars * 2 + 1 ? `${text.slice(0, chars)}…${text.slice(-chars)}` : text
  return (
    <code className="miniapp-submit-mono" title={text}>
      {short}
    </code>
  )
}

/**
 * One labelled control with its hint and error wired for assistive tech.
 *
 * `aria-describedby` carries the hint AND the error, so a screen-reader user hears why a field was
 * refused at the moment they land on it rather than having to hunt for a message elsewhere on screen.
 */
function Field({ id, label, hint, error, counter, children }) {
  const hintId = hint ? `${id}-hint` : null
  const errorId = error ? `${id}-error` : null
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`miniapp-submit-field${error ? ' has-error' : ''}`}>
      <label className="miniapp-submit-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p className="miniapp-submit-hint" id={hintId}>
          {hint}
          {counter ? <span className="miniapp-submit-counter"> {counter}</span> : null}
        </p>
      )}
      {error && (
        <p className="miniapp-submit-field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

/** A non-blocking advisory. Distinguishable from an error by its title, not by colour alone. */
function Advisory({ title, children }) {
  return (
    <div className="miniapp-submit-advisory" role="note">
      <p className="miniapp-submit-advisory-title">{title}</p>
      <div className="miniapp-submit-advisory-body">{children}</div>
    </div>
  )
}

/** The FR-003 promise, in whichever of its two honest shapes applies. */
function UpdateDisclosure({ live }) {
  return (
    <div className="miniapp-submit-disclosure" role="note">
      <p className="miniapp-submit-disclosure-title">
        {live ? 'Your app stays live while this is reviewed' : 'Nothing is serving yet'}
      </p>
      <p>{live ? UPDATE_KEEPS_SERVING_LIVE : UPDATE_KEEPS_SERVING_NOT_LIVE}</p>
      <p>{RESUBMIT_RESETS_REVIEW}</p>
    </div>
  )
}

/** The verdict of the manifest pre-check, rendered for whichever form is asking. */
function PrecheckVerdict({ result }) {
  if (!result || result.state === PRECHECK.IDLE) return null

  if (result.state === PRECHECK.CHECKING) {
    return (
      <p className="miniapp-submit-precheck" role="status">
        Fetching the manifest at this CID to check the hash…
      </p>
    )
  }

  if (result.state === PRECHECK.UNREACHABLE) {
    return (
      <Advisory title="We could not check this package from here">
        <p>
          No gateway this build can reach served <code>{MANIFEST_FILENAME}</code> for that CID. That is
          not evidence of anything being wrong — a package pinned to a private gateway is expected to be
          unreadable from a browser outside it. Your submission is unaffected; the reviewer will fetch
          and verify the package themselves.
        </p>
      </Advisory>
    )
  }

  if (result.state === PRECHECK.MISMATCH) {
    return (
      <div className="miniapp-submit-mismatch" role="alert">
        <p className="miniapp-submit-advisory-title">This CID’s manifest does not hash to what you entered</p>
        <p>
          The manifest served for that CID hashes to <Mono value={result.actual} />, but you entered{' '}
          <Mono value={result.expected} />. The registry will store whatever you give it, and the host
          will then refuse to run the package — it verifies the manifest against the on-chain hash
          before a single byte executes, so this listing could never launch.
        </p>
        <p>
          Almost always this is a stale hash: re-run the publish script and paste the values it prints
          together, rather than pairing a new CID with an older hash.
        </p>
      </div>
    )
  }

  return (
    <div className="miniapp-submit-precheck-ok" role="status">
      <p>
        The manifest at this CID hashes to the value you entered
        {result.manifest ? (
          <>
            {' '}
            and declares version <strong>{result.manifest.version}</strong> of{' '}
            <code>{result.manifest.id}</code>
          </>
        ) : null}
        .
      </p>
      {result.manifestError && (
        <p className="miniapp-submit-precheck-note">
          The bytes match, but the host could not read the manifest: {result.manifestError}
        </p>
      )}
      {result.idMismatch && (
        <p className="miniapp-submit-precheck-note">
          The package calls itself <code>{result.idMismatch.declared}</code>, but this listing’s name
          produces the address <code>{result.idMismatch.expected}</code>. The host refuses to run a
          package that identifies itself as a different app, so this package would not launch under
          this listing.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hooks: the two debounced advisory reads.
// ---------------------------------------------------------------------------

/**
 * Run the manifest pre-check whenever a settled (cid, hash) pair is worth checking.
 *
 * Debounced and abortable so typing a CID does not fire a request per keystroke, and so a superseded
 * check can never overwrite the verdict for the values currently on screen.
 *
 * The answer is TAGGED with the request it answers (the `CatalogPanel` pattern), which makes "a check
 * is in flight" and "there is nothing to check" DERIVED rather than state an effect has to write on
 * the way in. That matters for correctness, not just tidiness: a verdict is only ever rendered
 * alongside the exact values that produced it, so a stale MATCH can never sit under a hash the vendor
 * has since edited — which is the one way this courtesy could actively mislead someone.
 */
function useManifestPrecheck({ cid, manifestHash, expectedAppId, fetchImpl }) {
  const ready = !checkCid(cid) && !checkManifestHash(manifestHash)
  // NUL-joined: no field can contain it, so no two distinct requests can collide on one key.
  const requestKey = ready ? `${cid}\u0000${manifestHash}\u0000${expectedAppId ?? ''}` : null
  const [answered, setAnswered] = useState({ key: null, outcome: null })

  useEffect(() => {
    if (requestKey === null) return undefined

    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      let outcome
      try {
        outcome = await precheckManifest({
          cid,
          manifestHash,
          expectedAppId,
          fetchImpl,
          signal: controller.signal,
        })
      } catch {
        // The pre-check is a courtesy: a throw from it must never take the form down with it.
        outcome = { state: PRECHECK.UNREACHABLE, attempts: [] }
      }
      if (!cancelled) setAnswered({ key: requestKey, outcome })
    }, CHECK_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [requestKey, cid, manifestHash, expectedAppId, fetchImpl])

  if (requestKey === null) return { state: PRECHECK.IDLE }
  if (answered.key !== requestKey) return { state: PRECHECK.CHECKING }
  return answered.outcome
}

/**
 * Ask the registry whether a name is already claimed (FR-006).
 *
 * `ownId` excludes the listing being renamed — its own name is not a duplicate of itself, and the
 * contract agrees (`updateMetadata` only checks the key when it actually changes).
 *
 * Only a POSITIVE answer is acted on. An unreadable registry leaves the state `unknown`, because
 * "we could not check" must never render as "that name is free" — the chain settles it either way.
 *
 * Tagged by request for the same reason as the manifest check above.
 */
function useDuplicateNameCheck(name, ownId = null) {
  const trimmed = String(name ?? '').trim()
  const ready = trimmed !== '' && !checkName(trimmed)
  const requestKey = ready ? `${trimmed}\u0000${ownId ?? ''}` : null
  const [answered, setAnswered] = useState({ key: null, result: null })

  useEffect(() => {
    if (requestKey === null) return undefined

    let cancelled = false
    const timer = setTimeout(async () => {
      let outcome
      try {
        outcome = await fetchAppByName(trimmed)
      } catch {
        outcome = null
      }
      if (cancelled) return
      let result
      if (!outcome || outcome.status === REGISTRY_STATUS.UNREACHABLE || outcome.status === REGISTRY_STATUS.NOT_DEPLOYED) {
        result = { status: 'unknown' }
      } else if (outcome.status === REGISTRY_STATUS.NOT_FOUND) {
        result = { status: 'free' }
      } else if (ownId != null && Number(outcome.app?.id) === Number(ownId)) {
        result = { status: 'free' }
      } else {
        result = { status: 'taken', app: outcome.app }
      }
      setAnswered({ key: requestKey, result })
    }, CHECK_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [requestKey, trimmed, ownId])

  if (requestKey === null) return { status: 'idle' }
  if (answered.key !== requestKey) return { status: 'checking' }
  return answered.result
}

// ---------------------------------------------------------------------------
// Forms.
// ---------------------------------------------------------------------------

/**
 * Make a refused submission perceivable (T047 · WCAG 3.3.1, 2.4.3).
 *
 * Every form here validates on the first submit attempt and then renders the failures beside
 * their fields, wired with `aria-invalid` and `aria-describedby`. That is correct and it is also
 * completely silent: a member who presses Submit and cannot see the page gets no page change to
 * notice, no live region, and no reason to suspect the button did anything at all — the form just
 * does not submit. Pointer users see the red borders appear; screen-reader and keyboard users
 * were told nothing.
 *
 * Moving focus to the first refused control fixes both halves at once — the failure is announced
 * (the control's own label, error text and invalid state are read on arrival) and the member is
 * standing on the thing they have to change. It is preferred over an error-summary live region
 * because it leaves them somewhere useful rather than somewhere informative.
 *
 * Returns a ref for the `<form>` and a `reportBlocked()` to call when a submit is refused. The
 * attempt counter is what makes a SECOND refused press re-announce: the DOM does not change
 * between two identical failures, so without it nothing would happen the second time.
 */
function useFocusFirstInvalid() {
  const formRef = useRef(null)
  const [blockedAttempt, setBlockedAttempt] = useState(0)

  useEffect(() => {
    if (blockedAttempt === 0) return
    // Read after the render that added `aria-invalid`, in DOM order, so "first" means the
    // topmost refused control rather than whichever check happens to be listed first. The
    // acknowledgement box is in the selector because a hash mismatch is the one refusal with no
    // invalid FIELD behind it — the thing to go to is the consent the submission is waiting on,
    // and it always sits below the fields, so a genuinely invalid field still wins.
    const first = formRef.current?.querySelector('[aria-invalid="true"], .miniapp-submit-ack input')
    if (first) first.focus()
  }, [blockedAttempt])

  return { formRef, reportBlocked: () => setBlockedAttempt((n) => n + 1) }
}

/** Shared metadata inputs (name / description / category), used by both the new and the edit form. */
function MetadataFields({ idPrefix, values, onChange, errors, duplicate }) {
  const slugWarning = nameSlugWarning(values.name)
  const nameError =
    errors.name ||
    (duplicate.status === 'taken'
      ? `“${duplicate.app?.name}” is already registered (listing #${duplicate.app?.id}). The registry folds capitals and collapses runs of spaces, so a near-identical spelling will not free it up.`
      : null)

  return (
    <>
      <Field
        id={`${idPrefix}-name`}
        label="Listing name"
        hint="Shown on the catalog card, and the basis of the app’s web address. Unique across the registry."
        counter={`${utf8Length(values.name)}/${NAME_MAX_BYTES} bytes`}
        error={nameError}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            value={values.name}
            onChange={(event) => onChange('name', event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      {duplicate.status === 'checking' && (
        <p className="miniapp-submit-inline-status" role="status">
          Checking whether that name is taken…
        </p>
      )}
      {slugWarning && (
        <Advisory title="This name has no web address">
          <p>{slugWarning}</p>
        </Advisory>
      )}

      <Field
        id={`${idPrefix}-description`}
        label="Description"
        hint="What the app does, for the catalog card and for the reviewer."
        counter={`${utf8Length(values.description)}/${DESCRIPTION_MAX_BYTES} bytes`}
        error={errors.description}
      >
        {({ id, describedBy, invalid }) => (
          <textarea
            id={id}
            rows={3}
            value={values.description}
            onChange={(event) => onChange('description', event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>

      <Field id={`${idPrefix}-category`} label="Operational category" hint="How the catalog files and filters this app.">
        {({ id, describedBy }) => (
          <select
            id={id}
            value={values.category}
            onChange={(event) => onChange('category', Number(event.target.value))}
            aria-describedby={describedBy}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  )
}

/** Shared package inputs (CID / manifest hash) plus the pre-check verdict. */
function PackageFields({ idPrefix, values, onChange, errors, precheck }) {
  const shapeWarning = cidShapeWarning(values.cid)
  return (
    <>
      <Field
        id={`${idPrefix}-cid`}
        label="Package CID"
        hint="The content identifier of the published package directory — the one holding manifest.json."
        error={errors.cid}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            spellCheck={false}
            value={values.cid}
            onChange={(event) => onChange('cid', event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      {shapeWarning && (
        <Advisory title="That does not look like a CID">
          <p>{shapeWarning}</p>
        </Advisory>
      )}

      <Field
        id={`${idPrefix}-manifest-hash`}
        label="Manifest hash"
        hint="keccak-256 of the manifest.json bytes, printed by the publish script. This is what the host verifies before running any of the package."
        error={errors.manifestHash}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            spellCheck={false}
            value={values.manifestHash}
            onChange={(event) => onChange('manifestHash', event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>

      {/* Keyed on the state (T047), for the reason the notice above is. The verdict's four
          renderings carry three different roles — `status` while checking and on a match,
          `alert` on a mismatch, `note` when no gateway answered — and three of them are a
          `<div>` at the same position, which React would reconcile into one node with a
          rewritten `role`. That the hook currently routes every change through the CHECKING
          `<p>` (so a remount happens anyway) is a property of the hook, not of this render; the
          key makes the announcement hold regardless. The verdict this protects is the mismatch
          one, which is the only client-side finding that holds up a submission. */}
      <PrecheckVerdict key={precheck.state} result={precheck} />
    </>
  )
}

/**
 * The acknowledgement that lets a vendor submit over a definite hash mismatch.
 *
 * This is the one place the panel is stricter than the chain, so it comes with an escape: our check
 * can be wrong (a gateway serving a directory index instead of the file, a CID that resolves
 * differently inside the vendor's network), and refusing outright would strand a submission the
 * registry would have accepted. Acknowledging names the consequence rather than hiding it.
 */
function MismatchAcknowledgement({ id, checked, onChange }) {
  return (
    <div className="miniapp-submit-ack">
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <label htmlFor={id}>
        Submit anyway. I understand the host will refuse to launch this package while its manifest does
        not hash to the value recorded on-chain.
      </label>
    </div>
  )
}

/**
 * The submit button, shared by all three forms.
 *
 * `aria-disabled` rather than `disabled` while the write is in flight (T047), for the reason the
 * catalog's Refresh control gives: a control that goes `disabled` under the press that activated
 * it leaves the tab order, and focus falls to <body> — so a keyboard member is thrown to the top
 * of the page at exactly the moment the wallet prompt appears, and never hears the outcome. Kept
 * focusable, the label change and `aria-busy` are announced on the control they are still
 * standing on. The submit handler refuses re-entry, so a second press during the write is a
 * no-op rather than a second transaction.
 */
function SubmitButton({ busy, blockedNote, children, busyLabel }) {
  return (
    <button
      type="submit"
      className="miniapp-submit-primary"
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      aria-describedby={blockedNote}
    >
      {busy ? busyLabel : children}
    </button>
  )
}

/** New listing (`submitApp`). */
function NewListingForm({ onSubmit, busy, fetchImpl, blockedNote }) {
  const idPrefix = useId()
  const { formRef, reportBlocked } = useFocusFirstInvalid()
  const [values, setValues] = useState({
    name: '',
    description: '',
    category: CATEGORY_OPTIONS[0].value,
    cid: '',
    manifestHash: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const expectedAppId = useMemo(() => appSlug(values.name.trim()), [values.name])
  const precheck = useManifestPrecheck({
    cid: values.cid,
    manifestHash: values.manifestHash,
    expectedAppId,
    fetchImpl,
  })
  const duplicate = useDuplicateNameCheck(values.name)

  const failures = useMemo(
    () => ({
      name: checkName(values.name),
      description: checkDescription(values.description),
      cid: checkCid(values.cid),
      manifestHash: checkManifestHash(values.manifestHash),
    }),
    [values],
  )
  // Field errors appear after the first submit attempt, not while a vendor is still typing the first
  // character of a name — a form that scolds before it is filled in is noise, not help.
  const errors = submitted
    ? Object.fromEntries(Object.entries(failures).map(([key, failure]) => [key, failure?.message ?? null]))
    : {}

  const mismatch = precheck.state === PRECHECK.MISMATCH
  const blocked = Object.values(failures).some(Boolean) || duplicate.status === 'taken' || (mismatch && !acknowledged)

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    if (field === 'cid' || field === 'manifestHash') setAcknowledged(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (blocked) {
      reportBlocked()
      return
    }
    const sent = await onSubmit({
      name: values.name,
      description: values.description,
      category: values.category,
      cid: values.cid.trim(),
      manifestHash: normalizeBytes32Hex(values.manifestHash),
    })
    if (sent) {
      setValues({ name: '', description: '', category: CATEGORY_OPTIONS[0].value, cid: '', manifestHash: '' })
      setSubmitted(false)
      setAcknowledged(false)
    }
  }

  return (
    <form className="miniapp-submit-form" onSubmit={handleSubmit} noValidate ref={formRef}>
      <MetadataFields idPrefix={idPrefix} values={values} onChange={update} errors={errors} duplicate={duplicate} />
      <PackageFields idPrefix={idPrefix} values={values} onChange={update} errors={errors} precheck={precheck} />

      <div className="miniapp-submit-disclosure" role="note">
        <p className="miniapp-submit-disclosure-title">What happens next</p>
        <p>
          The registry records this as a Pending listing under your wallet address and emits an event for
          the compliance reviewers. It does not appear in the catalog and cannot be launched until a
          curator approves this exact package.
        </p>
        <p>
          You do not choose a version number: the registry issues one and never reuses it, including for
          versions that were rejected. This submission will be version 1.
        </p>
      </div>

      {mismatch && (
        <MismatchAcknowledgement id={`${idPrefix}-ack`} checked={acknowledged} onChange={setAcknowledged} />
      )}

      <SubmitButton busy={busy} blockedNote={blockedNote} busyLabel="Submitting…">
        Submit listing for review
      </SubmitButton>
    </form>
  )
}

/** New package for an existing listing (`submitUpdate`). */
function PackageUpdateForm({ app, onSubmit, busy, fetchImpl, blockedNote, formId }) {
  const idPrefix = useId()
  const { formRef, reportBlocked } = useFocusFirstInvalid()
  const [values, setValues] = useState({ cid: '', manifestHash: '' })
  const [submitted, setSubmitted] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  const expectedAppId = useMemo(() => appSlug(app.name), [app.name])
  const precheck = useManifestPrecheck({
    cid: values.cid,
    manifestHash: values.manifestHash,
    expectedAppId,
    fetchImpl,
  })

  const failures = useMemo(
    () => ({ cid: checkCid(values.cid), manifestHash: checkManifestHash(values.manifestHash) }),
    [values],
  )
  const errors = submitted
    ? Object.fromEntries(Object.entries(failures).map(([key, failure]) => [key, failure?.message ?? null]))
    : {}
  const mismatch = precheck.state === PRECHECK.MISMATCH
  const blocked = Object.values(failures).some(Boolean) || (mismatch && !acknowledged)

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setAcknowledged(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (blocked) {
      reportBlocked()
      return
    }
    const sent = await onSubmit({
      id: app.id,
      cid: values.cid.trim(),
      manifestHash: normalizeBytes32Hex(values.manifestHash),
    })
    if (sent) {
      setValues({ cid: '', manifestHash: '' })
      setSubmitted(false)
      setAcknowledged(false)
    }
  }

  return (
    <form className="miniapp-submit-form" onSubmit={handleSubmit} noValidate ref={formRef} id={formId}>
      <UpdateDisclosure live={app.launchable} />
      <PackageFields idPrefix={idPrefix} values={values} onChange={update} errors={errors} precheck={precheck} />
      <p className="miniapp-submit-version-note">
        The registry issues this package’s version number itself and never reuses one — not even a
        number that was issued to a package a curator rejected. It will be higher than every version
        listed above, but we cannot tell you which number in advance without guessing.
      </p>
      {mismatch && (
        <MismatchAcknowledgement id={`${idPrefix}-ack`} checked={acknowledged} onChange={setAcknowledged} />
      )}
      <SubmitButton busy={busy} blockedNote={blockedNote} busyLabel="Submitting…">
        Submit package for review
      </SubmitButton>
    </form>
  )
}

/** Reviewed metadata for an existing listing (`updateMetadata`). */
function MetadataUpdateForm({ app, onSubmit, busy, blockedNote, formId }) {
  const idPrefix = useId()
  const { formRef, reportBlocked } = useFocusFirstInvalid()
  const [values, setValues] = useState({
    name: app.name,
    description: app.description,
    category: app.category,
  })
  const [submitted, setSubmitted] = useState(false)

  const duplicate = useDuplicateNameCheck(values.name, app.id)
  const failures = useMemo(
    () => ({ name: checkName(values.name), description: checkDescription(values.description) }),
    [values],
  )
  const errors = submitted
    ? Object.fromEntries(Object.entries(failures).map(([key, failure]) => [key, failure?.message ?? null]))
    : {}
  const blocked = Object.values(failures).some(Boolean) || duplicate.status === 'taken'

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (blocked) {
      reportBlocked()
      return
    }
    await onSubmit({
      id: app.id,
      name: values.name,
      description: values.description,
      category: values.category,
    })
  }

  return (
    <form className="miniapp-submit-form" onSubmit={handleSubmit} noValidate ref={formRef} id={formId}>
      <UpdateDisclosure live={app.launchable} />
      <p className="miniapp-submit-version-note">
        Name, description and category are reviewed fields, so editing them sends the listing back to
        review exactly like a new package does — and, exactly like a new package, it changes nothing
        about what members are running in the meantime.
      </p>
      <MetadataFields idPrefix={idPrefix} values={values} onChange={update} errors={errors} duplicate={duplicate} />
      <SubmitButton busy={busy} blockedNote={blockedNote} busyLabel="Submitting…">
        Submit details for review
      </SubmitButton>
    </form>
  )
}

// ---------------------------------------------------------------------------
// T035 — the vendor's own submissions.
// ---------------------------------------------------------------------------

/** One package tuple, or an honest blank when the record holds none. */
function PackageTuple({ label, tuple, note }) {
  return (
    <div className="miniapp-submit-tuple">
      <p className="miniapp-submit-tuple-label">{label}</p>
      {tuple.present ? (
        <dl className="miniapp-submit-tuple-body">
          <div>
            <dt>Version</dt>
            <dd>v{tuple.version}</dd>
          </div>
          <div>
            <dt>CID</dt>
            <dd>
              <Mono value={tuple.cid} />
            </dd>
          </div>
          <div>
            <dt>Manifest hash</dt>
            <dd>
              <Mono value={tuple.manifestHash} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="miniapp-submit-muted">{note}</p>
      )}
    </div>
  )
}

/**
 * One of the vendor's listings (FR-023).
 *
 * The card leads with the distinction the rest of the platform is built on: `status` is the REVIEW
 * state and `launchable` is the SERVING decision, and they are frequently different. A live app with
 * an update in review reads "In review" and is simultaneously being run by members — so the card says
 * both, in the same breath, with the versions that make it concrete. Showing only the status would
 * make a vendor think their app had gone offline; showing only "live" would hide that their submission
 * has not shipped.
 */
function VendorAppCard({ app, openAction, onToggle, onSubmitPackage, onSubmitMetadata, busy, fetchImpl, blockedNote }) {
  const headingId = `miniapp-submission-${app.id}-name`
  const packageFormId = `miniapp-submission-${app.id}-package-form`
  const metadataFormId = `miniapp-submission-${app.id}-metadata-form`
  const statusLabel = STATUS_LABELS[app.status] ?? `Status ${app.status}`
  const categoryLabel = APP_CATEGORY_LABELS[app.category] ?? `Category ${app.category}`
  // The contract freezes a listing for its vendor once it is suspended or retired — offering the
  // controls anyway would be offering a transaction we know reverts.
  const editable = app.status === AppStatus.PENDING || app.status === AppStatus.APPROVED
  const open = openAction?.id === app.id ? openAction.kind : null

  return (
    <li className="miniapp-submission" aria-labelledby={headingId}>
      <div className="miniapp-submission-head">
        <h5 className="miniapp-submission-name" id={headingId}>
          {app.name}
        </h5>
        <span className="miniapp-submission-id">Listing #{app.id}</span>
      </div>
      <p className="miniapp-submission-category">{categoryLabel}</p>

      <dl className="miniapp-submission-state">
        <div>
          <dt>Review state</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>Serving to members</dt>
          <dd>{app.launchable ? `Yes — v${app.approved.version}` : 'No'}</dd>
        </div>
      </dl>

      {/* The one combination that reads as a contradiction unless it is spelled out. */}
      {app.status === AppStatus.PENDING && app.launchable && (
        // Built as one string rather than interleaved JSX: the spacing around these substitutions is
        // load-bearing, and JSX's newline-whitespace trimming silently eats it.
        <p className="miniapp-submission-explainer" role="note">
          {`Both of those are true at once, and that is the design: members are running the approved ` +
            `v${app.approved.version} package right now, while ` +
            `${app.proposed.present ? `your v${app.proposed.version} submission` : 'your edit'} ` +
            `waits for a curator. Your app is not offline.`}
        </p>
      )}
      {app.status === AppStatus.PENDING && !app.launchable && (
        <p className="miniapp-submission-explainer" role="note">
          This listing has never been approved, so it is not in the catalog and cannot be launched yet.
          A curator has to approve the package below first.
        </p>
      )}
      {app.status === AppStatus.SUSPENDED && (
        <p className="miniapp-submission-explainer" role="note">
          A curator has suspended this listing. It is out of the catalog, launches are refused, and it
          is frozen for you too — you cannot submit updates until the suspension is lifted.
        </p>
      )}
      {app.status === AppStatus.DEPRECATED && (
        <p className="miniapp-submission-explainer" role="note">
          This listing has been retired. Retirement is terminal on-chain, so nothing further can be
          submitted against it — a replacement has to be a new listing.
        </p>
      )}

      <div className="miniapp-submission-tuples">
        <PackageTuple
          label="Approved package (the only one ever served)"
          tuple={app.approved}
          note="None — this listing has never been approved."
        />
        <PackageTuple
          label="Proposed package (waiting for review)"
          tuple={app.proposed}
          note="None — nothing is queued for review."
        />
      </div>

      {editable && (
        <div className="miniapp-submission-actions">
          {/* `aria-expanded` says a control reveals something; `aria-controls` says WHAT, which
              is what lets a screen reader jump to the form these buttons open instead of
              hunting for it. The ids are per-listing, so two expanded cards never claim the
              same target (T047). */}
          <button
            type="button"
            className="miniapp-submit-secondary"
            aria-expanded={open === 'package'}
            aria-controls={open === 'package' ? packageFormId : undefined}
            onClick={() => onToggle(app.id, 'package')}
          >
            {open === 'package' ? 'Cancel package update' : 'Submit a package update'}
          </button>
          <button
            type="button"
            className="miniapp-submit-secondary"
            aria-expanded={open === 'metadata'}
            aria-controls={open === 'metadata' ? metadataFormId : undefined}
            onClick={() => onToggle(app.id, 'metadata')}
          >
            {open === 'metadata' ? 'Cancel details edit' : 'Edit listing details'}
          </button>
        </div>
      )}

      {open === 'package' && (
        <PackageUpdateForm
          app={app}
          formId={packageFormId}
          onSubmit={onSubmitPackage}
          busy={busy}
          fetchImpl={fetchImpl}
          blockedNote={blockedNote}
        />
      )}
      {open === 'metadata' && (
        <MetadataUpdateForm
          app={app}
          formId={metadataFormId}
          onSubmit={onSubmitMetadata}
          busy={busy}
          blockedNote={blockedNote}
        />
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Panel.
// ---------------------------------------------------------------------------

/**
 * @param {{fetchImpl?: Function}} [props] `fetchImpl` is an injection seam for the manifest pre-check,
 *   matching the one `loader.js` exposes for the same reason: the check is a network read, and a test
 *   that could not stub it would either hit the internet or not exercise the check at all.
 */
export default function SubmitAppPanel({ fetchImpl } = {}) {
  const { address, chainId, isConnected, sendCalls } = useWallet()
  const { chainId: registryChainId, registryAddress } = useMemo(() => registryLocation(), [])
  const iface = useMemo(() => new Interface(MINI_APP_REGISTRY_ABI), [])
  const networkNoteId = useId()

  const [gate, setGate] = useState(null)
  const [vendorRead, setVendorRead] = useState({ loading: true, outcome: null })
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [openAction, setOpenAction] = useState(null)

  const walletChainId = Number(chainId)
  const onRegistryChain = Number.isInteger(walletChainId) && walletChainId === Number(registryChainId)

  /**
   * Read the registry's own membership gate.
   *
   * Advisory only — it is used to state the requirement up front and to name the tier when a
   * submission reverts `InsufficientMembershipTier`. It is read FROM THE REGISTRY because the gate is
   * admin-configurable per deployment; a constant here would be confidently wrong somewhere. A failed
   * read leaves `gate` null and every message degrades to the version that does not name a tier.
   */
  useEffect(() => {
    if (!registryAddress) return undefined
    let cancelled = false
    ;(async () => {
      try {
        // Reads go through `getReadProvider`, which applies the member's own RPC route (spec 069).
        // Never `new JsonRpcProvider(NETWORKS[chainId].rpcUrl)`.
        const provider = getReadProvider(registryChainId)
        if (!provider) return
        const contract = new Contract(registryAddress, MINI_APP_REGISTRY_ABI, provider)
        const [manager, minTier] = await Promise.all([contract.membershipManager(), contract.minTier()])
        if (cancelled) return
        setGate({
          enabled: String(manager).toLowerCase() !== ZERO_ADDRESS,
          minTier: Number(minTier),
          chainId: Number(registryChainId),
        })
      } catch {
        // Not knowing the gate is not an error worth showing: the submission itself will settle it.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [registryAddress, registryChainId])

  const loadVendorApps = useCallback(async () => {
    if (!address || !registryAddress) {
      setVendorRead({ loading: false, outcome: null })
      return
    }
    setVendorRead((current) => ({ ...current, loading: true }))
    let outcome
    try {
      outcome = await fetchVendorApps(address)
    } catch (error) {
      outcome = {
        status: REGISTRY_STATUS.UNREACHABLE,
        chainId: registryChainId,
        registryAddress,
        error,
      }
    }
    setVendorRead({ loading: false, outcome })
  }, [address, registryAddress, registryChainId])

  useEffect(() => {
    loadVendorApps()
  }, [loadVendorApps])

  /**
   * One write path for all three vendor actions.
   *
   * The wallet-chain check lives HERE rather than on each button: the registry is single-chain by
   * design (FR-025), so a transaction sent from a wallet on any other network would either revert
   * against unrelated bytecode or — worse — succeed against a different deployment. The button stays
   * enabled and the refusal is spoken, because a disabled control with no explanation is the silent
   * no-op this rule exists to prevent.
   *
   * @returns {Promise<boolean>} whether the write was sent (so a form can clear itself)
   */
  const send = useCallback(
    async (data, successText) => {
      setNotice(null)
      if (!registryAddress) {
        setNotice({
          kind: 'error',
          text: `This build has no mini-app registry address on ${networkName(registryChainId)}, so there is nowhere to submit.`,
        })
        return false
      }
      if (!isConnected || !address) {
        setNotice({ kind: 'error', text: 'Connect a wallet before submitting — the registry records its address as the vendor.' })
        return false
      }
      if (!onRegistryChain) {
        setNotice({
          kind: 'error',
          text: `Your wallet is on ${networkName(walletChainId)}, but the app registry lives on ${networkName(registryChainId)}. Switch networks and submit again — nothing was sent.`,
        })
        return false
      }

      setBusy(true)
      try {
        await sendCalls([{ target: registryAddress, data }])
        // The catalog memo can be up to a minute old; a vendor who just changed a listing should not
        // have to wait it out to see the consequence.
        clearCatalogCache()
        setNotice({ kind: 'success', text: successText })
        await loadVendorApps()
        setOpenAction(null)
        return true
      } catch (error) {
        setNotice({ kind: 'error', text: describeRegistryError(error, iface, gate) })
        return false
      } finally {
        setBusy(false)
      }
    },
    [
      registryAddress,
      registryChainId,
      isConnected,
      address,
      onRegistryChain,
      walletChainId,
      sendCalls,
      loadVendorApps,
      iface,
      gate,
    ],
  )

  const submitNew = useCallback(
    ({ name, description, category, cid, manifestHash }) =>
      send(
        iface.encodeFunctionData('submitApp', [name, description, category, cid, manifestHash]),
        `“${name}” was submitted for review as version 1. It is not in the catalog and cannot be launched until a curator approves this package.`,
      ),
    [send, iface],
  )

  const submitPackage = useCallback(
    ({ id, cid, manifestHash }) =>
      send(
        iface.encodeFunctionData('submitUpdate', [id, cid, manifestHash]),
        'The new package is queued for review. Your app is not offline: members keep running the approved package until a curator approves this one.',
      ),
    [send, iface],
  )

  const submitMetadata = useCallback(
    ({ id, name, description, category }) =>
      send(
        iface.encodeFunctionData('updateMetadata', [id, name, description, category]),
        'The listing details are queued for review. Members keep running the approved package in the meantime — nothing about what is served has changed.',
      ),
    [send, iface],
  )

  function toggleAction(id, kind) {
    setOpenAction((current) => (current?.id === id && current.kind === kind ? null : { id, kind }))
  }

  const vendorOutcome = vendorRead.outcome

  return (
    <section className="miniapp-submit" aria-label="Submit an app">
      <div className="miniapp-submit-header">
        <div>
          <h3>Submit an app</h3>
          <p className="miniapp-submit-subtitle">
            Listings live on-chain. Submitting records your wallet as the listing’s permanent vendor and
            puts the package in the compliance review queue — nothing reaches a member until a curator
            approves the exact package you submitted.
          </p>
        </div>
        <Link className="miniapp-submit-back" to={CATALOG_ROUTE}>
          Back to the catalog
        </Link>
      </div>

      {registryAddress ? (
        <p className="miniapp-submit-location">
          Submissions are written to the app registry at <Mono value={registryAddress} chars={6} /> on{' '}
          {networkName(registryChainId)}.
          {gate
            ? gate.enabled
              ? ` Listing an app there requires ${TIER_NAMES[gate.minTier] ?? `tier ${gate.minTier}`} membership or above.`
              : ' It has no membership requirement, so any connected wallet may list an app.'
            : ''}
        </p>
      ) : (
        <div className="miniapp-catalog-unavailable" role="status">
          <p className="miniapp-catalog-state-title">There is no registry to submit to.</p>
          <p>
            App listings are published by a registry on {networkName(registryChainId)}, and this build has
            no registry address there. This is a deployment gap rather than an outage — retrying will not
            change it, and no form here could produce a listing.
          </p>
        </div>
      )}

      {registryAddress && !isConnected && (
        <div className="miniapp-catalog-unavailable" role="status">
          <p className="miniapp-catalog-state-title">Connect a wallet to submit.</p>
          <p>
            The registry records the submitting address as the listing’s vendor permanently, and only
            that address can ever update it — so there is nothing to fill in until we know which wallet
            is listing the app.
          </p>
        </div>
      )}

      {registryAddress && isConnected && !onRegistryChain && (
        <div className="miniapp-catalog-unverified" role="alert" id={networkNoteId}>
          <p className="miniapp-catalog-state-title">Your wallet is on the wrong network.</p>
          <p>
            The app registry lives on {networkName(registryChainId)}; your wallet is connected to{' '}
            {networkName(walletChainId)}. Switch networks before submitting — a submission sent from
            another network would not reach this catalog at all. Nothing here is disabled: if you submit
            anyway, we will refuse it and say so rather than failing quietly.
          </p>
        </div>
      )}

      {notice && (
        // Keyed on the kind (T047). Success and failure are two DIFFERENT live regions at one
        // position — `status` and `alert` — and React reconciling them as a single `<p>` would
        // rewrite `role` in place, which no screen reader treats as a new announcement. Today
        // `send` clears the notice before every write, so the node does unmount in between and
        // the announcement survives; the key is what stops that guarantee depending on the
        // ordering inside an unrelated function. Cheap here, silent failure if it ever changes.
        <p
          key={notice.kind}
          className={`miniapp-submit-notice is-${notice.kind}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      {registryAddress && isConnected && (
        <>
          <section className="miniapp-submit-section" aria-labelledby="miniapp-submissions-heading">
            <h4 id="miniapp-submissions-heading">Your submissions</h4>
            <p className="miniapp-submit-section-intro">
              Every listing this wallet has ever submitted, with the package a curator approved and the
              one waiting for review. “Review state” and “serving to members” are different questions —
              a listing can be in review and live at the same time.
            </p>

            {vendorRead.loading && !vendorOutcome && (
              <p className="miniapp-submit-inline-status" role="status">
                Loading your submissions…
              </p>
            )}

            {vendorOutcome?.status === REGISTRY_STATUS.UNREACHABLE && (
              <div className="miniapp-catalog-unverified" role="alert">
                <p className="miniapp-catalog-state-title">Your submissions could not be read.</p>
                <p>
                  The registry on {networkName(registryChainId)} did not answer. We will not show you a
                  partial list: a missing listing would read as one that was never recorded. Nothing is
                  wrong with your submissions — this is a read failure on our side.
                </p>
              </div>
            )}

            {vendorOutcome?.status === REGISTRY_STATUS.OK && vendorOutcome.apps.length === 0 && (
              <EmptyState
                title="You haven’t submitted anything yet"
                message="Listings you submit from this wallet appear here with their review state, their approved package, and anything waiting for a curator."
              />
            )}

            {vendorOutcome?.status === REGISTRY_STATUS.OK && vendorOutcome.apps.length > 0 && (
              <ul className="miniapp-submission-list">
                {vendorOutcome.apps.map((app) => (
                  <VendorAppCard
                    key={app.id}
                    app={app}
                    openAction={openAction}
                    onToggle={toggleAction}
                    onSubmitPackage={submitPackage}
                    onSubmitMetadata={submitMetadata}
                    busy={busy}
                    fetchImpl={fetchImpl}
                    blockedNote={onRegistryChain ? undefined : networkNoteId}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="miniapp-submit-section" aria-labelledby="miniapp-new-listing-heading">
            <h4 id="miniapp-new-listing-heading">Submit a new listing</h4>
            <NewListingForm
              onSubmit={submitNew}
              busy={busy}
              fetchImpl={fetchImpl}
              blockedNote={onRegistryChain ? undefined : networkNoteId}
            />
          </section>
        </>
      )}
    </section>
  )
}
