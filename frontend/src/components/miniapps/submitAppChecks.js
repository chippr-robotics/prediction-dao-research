/**
 * Pure submission-check rules for SubmitAppPanel, extracted to their own module because a `.jsx`
 * file may only export components and constants — `react-refresh/only-export-components` is an
 * error in this repo's lint config, and `SUBMISSION_CHECKS` bundles functions, not just constants.
 */
import { isValidCid } from '../../constants/ipfs'
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
import { appSlug } from '../../lib/miniapps/registryClient'

// ---------------------------------------------------------------------------
// Bounds, mirrored from `MiniAppRegistry`. These are BYTE lengths, not character
// counts: the contract measures `bytes(name).length`, so a 40-character name of
// non-ASCII text can be 80 bytes on-chain and revert `StringTooLong` while a
// `String.length` check waved it through. Every length check below encodes first.
// ---------------------------------------------------------------------------
export const NAME_MAX_BYTES = 64
export const DESCRIPTION_MAX_BYTES = 512
export const CID_MAX_BYTES = 256

// ---------------------------------------------------------------------------
// Client-side pre-checks. Each returns `null` when the value is acceptable, or
// `{ code, message }` — `code` matching the contract error the chain would have
// reverted with, so the two vocabularies stay one vocabulary.
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder()

/** UTF-8 byte length — what the contract measures. See the bounds note above. */
export function utf8Length(value) {
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
export function checkName(name) {
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
export function checkDescription(description) {
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
export function checkCid(cid) {
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
export function checkManifestHash(hash) {
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
export function cidShapeWarning(cid) {
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
export function nameSlugWarning(name) {
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
export async function precheckManifest({
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
export function describeRegistryError(error, iface, gate = null) {
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

