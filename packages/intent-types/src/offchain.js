/**
 * @fairwins/intent-types — OFF-CHAIN EIP-712 definitions (spec 095).
 *
 * WHY THIS FILE IS SEPARATE FROM index.js
 * Everything in `index.js` is verified by a DEPLOYED CONTRACT: `test/intent/TypehashParity.test.js`
 * parses each struct's `*_TYPEHASH` literal and each domain's `__EIP712_init(name, version)` out of
 * the Solidity and fails, in both directions, on any drift. That gate is what makes those tables
 * trustworthy — and it is exactly what these definitions CANNOT have, because no contract verifies
 * them.
 *
 * The member-API capability token is verified by the RELAY GATEWAY, in
 * `services/relay-gateway/src/memberApi/auth.js`, and nowhere else. There is no Solidity verifier,
 * no on-chain effect, and no `CONTRACT_VERIFIED_TYPES` entry: adding one would assert a contract
 * counterpart the parity gate would then (correctly) fail to find. Keeping them here, in their own
 * module, means the two kinds of definition can never be confused for one another — a struct in
 * `index.js` is a claim about a contract, a struct in this file is a claim about a server.
 *
 * WHY THEY LIVE IN THIS PACKAGE AT ALL
 * The same rule as every other struct here: the SIGNER (the SPA's API-access panel, and the
 * assistant's session grant) and the VERIFIER (the gateway) must agree byte-for-byte, and they live
 * in two trees that cannot import each other — `frontend/src` uses extensionless Vite-resolved
 * imports, the gateway is plain Node ESM. This package is the only place both can read. A local
 * copy on either side would reintroduce exactly the drift spec 075 exists to prevent, with a worse
 * failure mode than usual: a mismatched table here does not fail loudly, it produces a token that
 * every request rejects as `invalid_token` while the member watches a key they just signed be
 * refused.
 *
 * WHAT THE TOKEN IS
 * A member-signed CAPABILITY. The gateway stores nothing to issue one (it is stateless by design)
 * and the grant authorises READS, QUOTES and the forwarding of member-signed bytes — never custody,
 * never a signature the gateway produces. The wire format is
 *
 *     fw1.<base64url(grantJSON)>.<base64url(signatureBytes)>
 *
 * carried as `Authorization: Bearer <token>`. `grantJSON` is
 * `{ v, account, keyId, scopes, issuedAt, expiresAt, label }` — and note `label` is display-only and
 * is deliberately NOT part of the signed struct: a member renaming a key must not have to re-sign
 * it, and a label the gateway does not verify must never be able to change what the token permits.
 *
 * RULES FOR THIS FILE
 *   · Zero runtime dependencies, same as index.js.
 *   · Never import from frontend/src, services/, or a Vite virtual module.
 *   · Do NOT merge anything here into CONTRACT_VERIFIED_TYPES or CONTRACT_DOMAINS. Those two sets
 *     mean "a contract verifies this"; nothing here does.
 */

/**
 * The capability token's EIP-712 domain.
 *
 * CHAIN-AGNOSTIC ON PURPOSE: no `chainId`, no `verifyingContract`. A contract domain pins both
 * because a signature must be replayable on exactly one contract on exactly one chain. This grant
 * authorises READS that span the whole build cohort and quotes on any enabled chain, so pinning it
 * to one chain would mean either a token per chain or a lie about what the token covers. The
 * replay surface it gives up is bounded elsewhere and deliberately: the grant carries its own
 * `expiresAt` (capped by `MEMBER_API_MAX_TTL_DAYS` at the gateway), its own `keyId` (so one key can
 * be revoked without touching the others), and it can only ever be presented to a FairWins gateway,
 * which is the only thing that verifies this domain name.
 *
 * `{ name, version }` and NOTHING else — consumers spread this into an EIP-712 domain object, so
 * any extra key would land in the domain and change the separator (the same reasoning as
 * CONTRACT_DOMAINS in index.js).
 */
export const MEMBER_API_DOMAIN = Object.freeze({ name: 'FairWins Member API', version: '1' })

/**
 * `ApiKeyGrant` — what the member signs to mint an API key.
 *
 * `scopes` is a STRING, not `string[]`, and that is a decision rather than a convenience. EIP-712
 * can hash a dynamic array, but every wallet renders it differently and some render it not at all,
 * so a member approving `["read:wagers","build:intents"]` may be shown nothing about what the key
 * can do. A single canonical line is legible in every signing prompt. `canonicalScopeString()`
 * below is the ONE way that line is produced — sorted ascending, single-space separated,
 * de-duplicated — so signer and verifier cannot disagree about which bytes were signed.
 *
 * `keyId` is `bytes32` and is chosen client-side at random. It is an identifier, not a secret: it
 * is what a revocation names, and what `/v1/member/me` echoes back.
 */
export const MEMBER_API_GRANT_TYPES = {
  ApiKeyGrant: [
    { name: 'account', type: 'address' },
    { name: 'keyId', type: 'bytes32' },
    { name: 'scopes', type: 'string' },
    { name: 'issuedAt', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
}

/**
 * `ApiKeyRevocation` — what the member signs to withdraw a key.
 *
 * SELF-AUTHORIZING BY DESIGN: revoking needs no bearer token, because the situation you revoke in
 * is usually "the token got out". Requiring the leaked credential to withdraw the leaked credential
 * would be the wrong shape. A valid signature over this struct is the whole authorisation.
 *
 * `revokedAt` exists so a replayed revocation is still just a revocation of the same key at the
 * same moment — there is no "un-revoke", so replay is harmless, and the timestamp is what lets the
 * gateway prune records for grants that can no longer exist.
 */
export const MEMBER_API_REVOCATION_TYPES = {
  ApiKeyRevocation: [
    { name: 'account', type: 'address' },
    { name: 'keyId', type: 'bytes32' },
    { name: 'revokedAt', type: 'uint256' },
  ],
}

/**
 * Canonicalise a scope list into the exact string the `ApiKeyGrant.scopes` field carries.
 *
 * Sorted ascending, de-duplicated, joined by single spaces. Both halves matter: the SIGNER shows
 * the member this line and the VERIFIER re-derives it from the parsed grant, so any disagreement
 * about ordering or spacing is a signature that does not verify. Deriving it in two places by hand
 * is precisely the class of drift this package exists to remove.
 *
 * A scope containing whitespace THROWS rather than being escaped: after joining, `"a b"` and
 * `["a","b"]` would be indistinguishable, so a scope name that could split is refused at the point
 * it is introduced rather than silently widening a grant later.
 *
 * @param {string[]} scopes
 * @returns {string}
 */
export function canonicalScopeString(scopes) {
  if (!Array.isArray(scopes)) throw new Error('scopes must be an array of strings')
  const seen = new Set()
  for (const s of scopes) {
    if (typeof s !== 'string' || s.length === 0) throw new Error('every scope must be a non-empty string')
    if (/\s/.test(s)) throw new Error(`scope ${JSON.stringify(s)} contains whitespace; scopes are space-separated`)
    seen.add(s)
  }
  return [...seen].sort().join(' ')
}
