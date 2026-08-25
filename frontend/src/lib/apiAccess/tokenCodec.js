/**
 * Capability-token wire codec (spec 095).
 *
 *     fw1.<base64url(grantJSON)>.<base64url(signatureBytes)>
 *
 * carried as `Authorization: Bearer <token>` and verified by the relay gateway
 * (`services/relay-gateway/src/memberApi/auth.js`) — never by a contract.
 *
 * WHY THE ENCODING LIVES IN ITS OWN MODULE
 * The gateway parses these bytes with `Buffer`; the browser produces them with `btoa`. Those are two
 * different implementations of one format, which is exactly the shape of a bug that only shows up
 * for the member (a token that every request rejects as `invalid_token` seconds after they signed
 * it). Keeping encode and decode adjacent, and round-tripping them in `test/apiKeys.test.js`, is
 * what makes the two halves checkable at all from this side.
 *
 * TWO RULES:
 *   · UNPADDED base64url (`-`/`_`, no `=`). The gateway's decoder tolerates padding, but emitting
 *     it would put `=` in an Authorization header for no benefit.
 *   · The grant JSON is written in ONE canonical field order. The signature does not cover the JSON
 *     bytes — it covers the EIP-712 struct — so ordering is not a correctness requirement; it is a
 *     legibility one. A member comparing two tokens, or an operator reading a bug report, should see
 *     the same shape every time.
 *
 * NOTHING HERE IS A SECRET STORE. A token is assembled, shown once, and forgotten: this module has
 * no persistence and must never acquire any.
 */

/** Wire prefix. Mirrors `TOKEN_PREFIX` in services/relay-gateway/src/memberApi/contract.js. */
export const TOKEN_PREFIX = 'fw1'

/** Longest token we will attempt to parse — a grant is a few hundred bytes. Mirrors the gateway. */
const MAX_TOKEN_BYTES = 8192

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** Bytes → unpadded base64url. */
export function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url (padded or not) → bytes. Throws on anything that is not base64. */
export function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

/** 0x-hex → bytes. Kept local so this module has no ethers dependency. */
function hexToBytes(hex) {
  const body = String(hex).startsWith('0x') ? String(hex).slice(2) : String(hex)
  if (body.length === 0 || body.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(body)) {
    throw new Error('signature must be non-empty 0x-prefixed hex of whole bytes')
  }
  const out = new Uint8Array(body.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(body.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** bytes → 0x-hex. */
function bytesToHex(bytes) {
  let hex = '0x'
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/**
 * The grant object in its canonical field order. `label` is display-only and is deliberately NOT
 * part of the signed struct — a member renaming a key must not have to re-sign it, and a field the
 * gateway does not verify must never be able to widen what a token permits.
 */
export function canonicalGrantJson(grant) {
  const ordered = {
    v: 1,
    account: grant.account,
    keyId: grant.keyId,
    scopes: grant.scopes,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
  }
  if (grant.label) ordered.label = grant.label
  return JSON.stringify(ordered)
}

/**
 * Assemble the bearer token from a grant and the member's signature over the `ApiKeyGrant` struct.
 *
 * @param {{v?: number, account: string, keyId: string, scopes: string[], issuedAt: number, expiresAt: number, label?: string}} grant
 * @param {string} signature 0x-prefixed signature bytes
 * @returns {string} `fw1.<base64url grant>.<base64url signature>`
 */
export function encodeToken(grant, signature) {
  const grantSegment = bytesToBase64Url(textEncoder.encode(canonicalGrantJson(grant)))
  const signatureSegment = bytesToBase64Url(hexToBytes(signature))
  return `${TOKEN_PREFIX}.${grantSegment}.${signatureSegment}`
}

/**
 * Parse a token back into its grant and signature. STRUCTURAL ONLY — this never checks a signature
 * and must never be mistaken for verification: the gateway is the verifier, and a token that parses
 * here has proved nothing.
 *
 * @param {string} token
 * @returns {{grant: object, signature: string}}
 */
export function decodeToken(token) {
  if (typeof token !== 'string' || token.length === 0) throw new Error('token is empty')
  const trimmed = token.trim()
  if (textEncoder.encode(trimmed).length > MAX_TOKEN_BYTES) throw new Error('token is implausibly large')

  const parts = trimmed.split('.')
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    throw new Error(`token must be "${TOKEN_PREFIX}.<base64url grant>.<base64url signature>"`)
  }

  let grant
  try {
    grant = JSON.parse(textDecoder.decode(base64UrlToBytes(parts[1])))
  } catch {
    throw new Error('the grant segment is not base64url-encoded JSON')
  }
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) throw new Error('the grant must be a JSON object')

  const signature = bytesToHex(base64UrlToBytes(parts[2]))
  if (signature === '0x') throw new Error('the signature segment is empty')

  return { grant, signature }
}
