/**
 * WebAuthn credential ceremonies for passkey accounts (spec 041, T016).
 *
 * Wraps the browser WebAuthn API (navigator.credentials) with:
 *  - capability detection (FR-004: the login surface offers passkeys only
 *    where genuinely usable, with an honest reason otherwise),
 *  - typed errors (contracts/passkey-connector.md error taxonomy),
 *  - PRF extension request at creation (feeds prfKeys.js, FR-012),
 *  - duplicate-signup steering (edge case: existing credential → sign-in).
 *
 * The private key NEVER leaves the platform authenticator; this module only
 * handles credential IDs, public keys, and assertion outputs.
 */

const RP_NAME = 'FairWins'
const CREDENTIALS_KEY = 'fairwins.passkey.credentials.v1'

/** Typed error: the user dismissed/cancelled the platform ceremony. Clean abort. */
export class CeremonyCancelled extends Error {
  constructor(message = 'Passkey prompt was cancelled') {
    super(message)
    this.name = 'CeremonyCancelled'
  }
}

/** Typed error: no usable authenticator/WebAuthn support in this context. */
export class AuthenticatorUnavailable extends Error {
  constructor(reason) {
    super(`Passkeys are not available: ${reason}`)
    this.name = 'AuthenticatorUnavailable'
    this.reason = reason
  }
}

/** Map raw WebAuthn/DOM exceptions onto the typed taxonomy. */
function mapCeremonyError(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return new CeremonyCancelled()
  if (err?.name === 'NotSupportedError' || err?.name === 'SecurityError') {
    return new AuthenticatorUnavailable(err.message || err.name)
  }
  return err
}

/**
 * Capability detection (FR-004). Returns:
 *   { available: boolean, reason?: string, platformAuthenticator?: boolean }
 * `reason` is user-displayable ("this browser doesn't support passkeys").
 */
export async function detectCapability(env = globalThis) {
  const pk = env?.window?.PublicKeyCredential ?? env?.PublicKeyCredential
  if (!pk || !(env?.navigator?.credentials ?? env?.window?.navigator?.credentials)) {
    return { available: false, reason: 'This browser does not support passkeys.' }
  }
  try {
    const platformAuthenticator = await pk.isUserVerifyingPlatformAuthenticatorAvailable()
    if (!platformAuthenticator) {
      // Cross-device (hybrid) passkeys may still work; keep the option but note it.
      return { available: true, platformAuthenticator: false }
    }
    return { available: true, platformAuthenticator: true }
  } catch {
    return { available: false, reason: 'Passkey support could not be confirmed on this device.' }
  }
}

/** Local, non-authoritative record of credentials created/used on this browser. */
export function knownCredentials(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(CREDENTIALS_KEY) || '[]')
  } catch {
    return []
  }
}

export function rememberCredential(entry, storage = globalThis.localStorage) {
  const list = knownCredentials(storage).filter((c) => c.credentialId !== entry.credentialId)
  list.push({ ...entry, updatedAt: Date.now() })
  storage.setItem(CREDENTIALS_KEY, JSON.stringify(list))
}

/**
 * Merge-update a credential record by credentialId (spec 045, FR-005).
 * Unlike rememberCredential (which replaces the whole entry), this never
 * drops fields the partial update doesn't carry — in particular `publicKey`,
 * which cannot be recovered from an assertion ceremony. Sign-in uses this to
 * keep the book transact-complete without needing the key again.
 */
export function upsertCredential(partial, storage = globalThis.localStorage) {
  if (!partial?.credentialId) return
  const list = knownCredentials(storage)
  const existing = list.find((c) => c.credentialId === partial.credentialId)
  const merged = { ...existing, ...stripUndefined(partial), updatedAt: Date.now() }
  const rest = list.filter((c) => c.credentialId !== partial.credentialId)
  rest.push(merged)
  storage.setItem(CREDENTIALS_KEY, JSON.stringify(rest))
  return merged
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null))
}

/**
 * A record can back transactions only when the ceremony can be pinned to a
 * credential AND the P-256 key is known (the WebAuthn owner needs both).
 * Records failing this are legacy/partial writes; the signing layer refuses
 * them with a plain-language error instead of crashing inside the signer.
 */
export function isTransactComplete(record) {
  return Boolean(record?.credentialId && record?.publicKey?.x && record?.publicKey?.y)
}

export function forgetCredential(credentialId, storage = globalThis.localStorage) {
  const list = knownCredentials(storage).filter((c) => c.credentialId !== credentialId)
  storage.setItem(CREDENTIALS_KEY, JSON.stringify(list))
}

/**
 * Duplicate-signup steering (edge case): true when this browser already knows
 * a FairWins credential — the UI should steer to sign-in, keeping an explicit
 * "create another account" escape hatch.
 */
export function hasExistingCredential(storage = globalThis.localStorage) {
  return knownCredentials(storage).length > 0
}

const b64url = (buf) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Create a new passkey (WebAuthn registration ceremony) for account sign-up.
 * Requests the PRF extension (FR-012) and a platform authenticator with user
 * verification. Returns { credentialId, publicKey: {x, y}, prfCapable, label }.
 *
 * `deps` is injectable for tests: { credentials, rpId }.
 */
export async function createCredential({ label, userName = 'FairWins account', deps = {} } = {}) {
  const credentials = deps.credentials ?? globalThis.navigator?.credentials
  if (!credentials) throw new AuthenticatorUnavailable('no credential manager in this context')

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = crypto.getRandomValues(new Uint8Array(16))

  let cred
  try {
    cred = await credentials.create({
      publicKey: {
        rp: { name: RP_NAME, ...(deps.rpId ? { id: deps.rpId } : {}) },
        user: { id: userId, name: userName, displayName: userName },
        challenge,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 / P-256 only
        authenticatorSelection: {
          residentKey: 'required', // discoverable: sign-in without typing anything
          userVerification: 'required',
        },
        extensions: { prf: { eval: { first: new Uint8Array(32) } } },
      },
    })
  } catch (err) {
    throw mapCeremonyError(err)
  }
  if (!cred) throw new CeremonyCancelled()

  const response = cred.response
  // P-256 public key: prefer the standard getPublicKey() (SPKI DER), whose
  // uncompressed point is the last 65 bytes (0x04 || x || y).
  const spki = new Uint8Array(response.getPublicKey())
  const point = spki.slice(-65)
  if (point[0] !== 0x04) throw new AuthenticatorUnavailable('unexpected public key encoding')
  const toHex = (u8) => '0x' + Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('')
  const publicKey = { x: toHex(point.slice(1, 33)), y: toHex(point.slice(33, 65)) }

  const ext = cred.getClientExtensionResults?.() ?? {}
  const prfCapable = Boolean(ext.prf?.enabled ?? ext.prf?.results)

  const entry = { credentialId: cred.id, publicKey, prfCapable, label: label || 'This device' }
  return entry
}

/**
 * Run an assertion (WebAuthn "get") ceremony over a 32-byte challenge.
 * When `credentialId` is set the request pins that credential. When unpinned,
 * every credential in the local book is offered via `allowCredentials` so the
 * platform MUST present a chooser — Brave/Chromium silently assert the first
 * discoverable credential on a bare request, which locked users out of all
 * but their first account (spec 045, US3). Only a browser with no local book
 * (fresh device) falls back to the bare discoverable-credential request.
 *
 * `discoverable: true` deliberately skips the local-book `allowCredentials`
 * even when the book is non-empty, issuing a bare discoverable request so the
 * platform offers EVERY FairWins passkey on the device — including ones this
 * browser has never recorded (issue #849: "several passkeys on one device").
 * The in-app "Use a different passkey…" escape uses this; the app still never
 * silently guesses because the platform's own chooser makes the pick.
 *
 * `prfSalt` (optional Uint8Array(32)) also evaluates the PRF extension.
 * Returns the raw fields the signing layer needs:
 *   { credentialId, signature, authenticatorData, clientDataJSON, prfOutput? }
 */
export async function getAssertion({ challenge, credentialId, prfSalt, discoverable = false, deps = {} }) {
  const credentials = deps.credentials ?? globalThis.navigator?.credentials
  if (!credentials) throw new AuthenticatorUnavailable('no credential manager in this context')

  const pinnedIds = credentialId
    ? [credentialId]
    : discoverable
      ? []
      : (deps.knownCredentials ?? knownCredentials)(deps.storage).map((c) => c.credentialId)
  const allowCredentials = []
  for (const id of pinnedIds) {
    try {
      if (id) allowCredentials.push({ type: 'public-key', id: base64urlToBytes(id) })
    } catch {
      // Malformed stored id — skip rather than abort the whole ceremony.
    }
  }

  const publicKey = {
    challenge,
    userVerification: 'required',
    ...(allowCredentials.length ? { allowCredentials } : {}),
    ...(prfSalt ? { extensions: { prf: { eval: { first: prfSalt } } } } : {}),
  }

  let assertion
  try {
    assertion = await credentials.get({ publicKey })
  } catch (err) {
    throw mapCeremonyError(err)
  }
  if (!assertion) throw new CeremonyCancelled()

  const ext = assertion.getClientExtensionResults?.() ?? {}
  const prfOutput = ext.prf?.results?.first ? new Uint8Array(ext.prf.results.first) : undefined

  return {
    credentialId: assertion.id,
    signature: new Uint8Array(assertion.response.signature),
    authenticatorData: new Uint8Array(assertion.response.authenticatorData),
    clientDataJSON: new Uint8Array(assertion.response.clientDataJSON),
    prfOutput,
  }
}

export function base64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export { b64url as bytesToBase64url }
