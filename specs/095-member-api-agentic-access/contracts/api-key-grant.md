# Contract: API key grant, token format & verification — spec 095

Producers: `packages/intent-types/src/offchain.js` (the type tables + `canonicalScopeString`),
`frontend/src/lib/apiAccess/apiKeys.js` (builds and encodes),
`services/relay-gateway/src/memberApi/{auth,revocation}.js` (decodes and verifies).
Consumer contract: [member-api.md](./member-api.md).

> **The platform issues nothing.** A FairWins API key is a statement the **member signs** about what a
> holder of that statement may do on their behalf, for how long. The gateway keeps no record in order
> for one to be valid, cannot mint one, and cannot recover one. What it can do is refuse: check the
> signature, the clock, the revocation register, the membership, the screening and the scope, and
> answer honestly when it cannot check at all.

---

## 1. Token format

```
fw1.<base64url(grantJSON)>.<base64url(signatureBytes)>
```

- Three dot-separated parts. The first is the literal version tag `fw1`; a token with any other tag,
  a different part count, or a part that is not base64url is `401 invalid_token`.
- Base64url is unpadded, `-`/`_` alphabet. `grantJSON` is UTF-8 JSON; `signatureBytes` are the raw
  65-byte ECDSA signature for an EOA, or the arbitrary-length signature blob a contract account
  produced (ERC-1271 imposes no length).
- Transported as `Authorization: Bearer <token>` and **never** as a query parameter, never in a path,
  never in a log line, never in an audit field, never in device storage in the clear.

The token is shown to the member exactly once, at creation. It is not recoverable afterwards from any
surface — not from the app, not from the gateway, not from a support path. The member's device keeps
only non-secret metadata (`keyId`, `label`, `scopes`, `issuedAt`, `expiresAt`) so keys can be told
apart and revoked.

## 2. The grant

`grantJSON`, canonical field order:

```jsonc
{
  "v": 1,
  "account": "0xabc…",                 // the member; the address that signed
  "keyId": "0x…",                      // bytes32, 32 random bytes generated on the member's device
  "scopes": ["read:profile", "read:wagers"],
  "issuedAt": 1750000000,              // unix seconds
  "expiresAt": 1757776000,             // unix seconds
  "label": "my agent"                  // DISPLAY ONLY — see below
}
```

| Field | Type | Notes |
|---|---|---|
| `v` | integer | `1`. A future version is a new tag and a new table, never a reinterpretation of this one. |
| `account` | address | Checksummed or lowercase; compared case-insensitively. |
| `keyId` | bytes32 | 32 bytes from the platform's CSPRNG. Identifies the key for revocation and for the member's own metadata. It is **not** a secret — knowing a `keyId` grants nothing. |
| `scopes` | string[] | From the closed vocabulary in [member-api.md §3](./member-api.md#3-scopes). An unknown entry is refused at parse time. |
| `issuedAt` / `expiresAt` | uint256 (unix seconds) | `expiresAt > issuedAt` is required; `expiresAt - issuedAt` must not exceed the deployment's lifetime cap. |
| `label` | string | **Not part of the signed struct.** |

> ### Why `label` is outside the signature
>
> Two reasons, and both matter. A label is member-typed display text that lives on the member's own
> device: renaming "my agent" to "laptop script" must not invalidate a working key, and it would if
> the label were signed. And a field a member types must never be able to change what a signature
> authorises — keeping it out of the struct makes that impossible by construction rather than by
> validation. The gateway ignores `label` entirely; it never appears in a response, a log, or an
> audit field.

## 3. EIP-712 types

Defined once, in `packages/intent-types/src/offchain.js`, re-exported from the package's `index.js`
and additionally reachable at `@fairwins/intent-types/offchain`. Imported by **both** the frontend and
the gateway; never re-declared locally in either tree.

```js
export const MEMBER_API_DOMAIN = Object.freeze({ name: 'FairWins Member API', version: '1' })

export const MEMBER_API_GRANT_TYPES = Object.freeze({
  ApiKeyGrant: [
    { name: 'account',   type: 'address' },
    { name: 'keyId',     type: 'bytes32' },
    { name: 'scopes',    type: 'string'  },   // canonicalised — see §4
    { name: 'issuedAt',  type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
})

export const MEMBER_API_REVOCATION_TYPES = Object.freeze({
  ApiKeyRevocation: [
    { name: 'account',   type: 'address' },
    { name: 'keyId',     type: 'bytes32' },
    { name: 'revokedAt', type: 'uint256' },
  ],
})
```

> ### These are OFF-CHAIN types, and they live in their own file for that reason
>
> No Solidity contract verifies either struct. The verifier is the **gateway**, which is why the
> domain deliberately carries **no `chainId` and no `verifyingContract`**: a grant is chain-agnostic —
> the reads it authorises span the whole build cohort, and pinning it to one chain would make a token
> mysteriously invalid for the rest.
>
> They therefore must **not** enter the contract-verified set. `test/intent/TypehashParity.test.js`
> checks every entry of that set against a deployed contract's own `*_TYPEHASH`, in both directions —
> a struct the package declares but no contract verifies fails it. Putting these in `index.js`
> alongside the intent tables would break that gate; putting them in `offchain.js` keeps the gate's
> set exactly the contract-verified one, and keeps the CLAUDE.md rule ("one source, never a local
> copy") intact, because it is still the same package.
>
> The domain string is nonetheless load-bearing in the same way every other domain here is: a correct
> type table signed under the wrong `name`/`version` produces a signature that verifies **nowhere** —
> the member is prompted, pays nothing, and the request simply fails (issue #1038 is the recorded
> instance of that class of bug). Both trees import the constant; neither retypes it.

## 4. Canonicalising `scopes`

`scopes` is signed as a **single string**: the granted scopes **sorted ascending (byte order) and
joined with one space**.

```
["read:wagers","read:profile"]  →  "read:profile read:wagers"
```

- Sorting removes ordering as a degree of freedom, so the same grant always produces the same digest
  regardless of the order a UI happened to collect the checkboxes in.
- A single space is the only separator; no leading, trailing or repeated spaces.
- Duplicates are removed before sorting.
- The gateway re-derives this string from the parsed `scopes` **array** and hashes that — it never
  hashes a string taken from the wire. A token whose array and whose implied string disagree therefore
  fails signature verification rather than being silently normalised.

The rule ships as **one function**, `canonicalScopeString`, exported from the same module as the type
tables. The signer and the verifier must derive the identical string or the signature simply does not
match, and a rule written twice in two trees is exactly the drift this package exists to prevent —
here with an unusually quiet failure mode, since the member watches a key they just signed be refused
as malformed on every request.

`string` is used rather than `string[]` deliberately: a flat struct with no nested or dynamic-array
types keeps the digest expressible by every wallet's `signTypedData` implementation, and matches the
"flat structs only" rule the platform's other tables already follow.

## 5. Signing

```js
const grant = { v: 1, account, keyId, scopes, issuedAt, expiresAt, label }
const signature = await signer.signTypedData(
  MEMBER_API_DOMAIN,
  MEMBER_API_GRANT_TYPES,
  { account, keyId, scopes: canonicalScopes(grant.scopes), issuedAt, expiresAt },
)
const token = `fw1.${b64url(JSON.stringify(grant))}.${b64url(getBytes(signature))}`
```

Exactly one wallet prompt. Nothing is sent anywhere: **key creation is entirely local**, which is why
the API access card can create a key with the gateway unreachable and says so.

## 6. Verification order (gateway)

Executed in this order; each step's failure is distinct because a client must be able to tell *why*.

| # | Step | Failure |
|---|---|---|
| 1 | Parse `fw1.<a>.<b>`; decode; validate the grant's shape, `v`, address form, `keyId` length, scope vocabulary, `expiresAt > issuedAt` | `401 invalid_token` |
| 2 | `expiresAt` in the past (server clock) | `401 token_expired` |
| 3 | `expiresAt - issuedAt` above `MEMBER_API_MAX_TTL_DAYS` | `401 token_ttl_exceeded` |
| 4 | Compute the EIP-712 digest over the canonicalised struct; `recoverAddress` | — |
| 5a | Recovered address **equals** `account` | ✅ authenticated |
| 5b | Otherwise: ERC-1271 `isValidSignature(digest, signature)` on `account`, on the membership reference chain | returns the magic value ⇒ ✅ |
| 5c | The 1271 read **threw / timed out / the chain did not answer** | **`503 auth_unverifiable`** |
| 5d | The chain answered, `account` holds **no code**, and recovery mismatched — or the account contract said no | `401 invalid_signature` |
| 6 | `keyId` present in the in-process revocation register | `401 token_revoked` |
| 7 | Active paid membership on the reference chain (cached ≈60 s) | `403 membership_required` / **`503 membership_unreadable`** |
| 8 | Sanctions screen of `account`, fail closed | `403 sanctioned_signer` / `503 screening_unavailable` |
| 9 | Requested operation's scope ∈ `scopes` | `403 insufficient_scope` |
| 10 | Per-account then global quota | `429 quota_exceeded` + `Retry-After` |

> ### Step 5c is the whole reason this has three outcomes instead of two
>
> A contract account has no public key. An ECDSA recovery that returns some other address is **exactly
> what a legitimate smart-account signature looks like** from outside — a Safe, a passkey account, any
> ERC-4337 wallet. The only thing that can settle it is asking the account contract, and that is a
> network read.
>
> So a failed 1271 read is reported as *unverifiable and retryable*, never as invalid. Promoting a
> mismatching recovery to a denial when the on-chain leg could not run would tell a passkey member
> their key is forged every time an RPC hiccups. This is the same three-verdict discipline the
> platform's message-verification surface already enforces (`valid` / `invalid` / `unverifiable`), and
> it is not optional here.
>
> The negative in 5d is only reported when it is **knowable**: recovery produced someone else *and*
> the chain positively said the account holds no code, or the account contract itself said no.

Two ancillary rules:

- **Timing.** Steps 1–5 are pure computation and are performed before any network read, so a malformed
  token never costs an RPC call. Steps 7–8 are cached per account.
- **No caching of failures as successes.** Only a `read` membership result is cached; an unreadable
  membership is re-attempted on the next request rather than pinned for 60 seconds.

## 7. Revocation

```js
const signature = await signer.signTypedData(
  MEMBER_API_DOMAIN,
  MEMBER_API_REVOCATION_TYPES,
  { account, keyId, revokedAt },
)
```

`POST /v1/member/keys/revoke` with `{ revocation, signature }`. **Self-authorising**: no bearer token
is required, and presenting one is not a substitute — a member who has lost the token must still be
able to withdraw it. Verification is steps 1, 4, 5a–5d of §6 applied to the revocation struct;
`revokedAt` is bounded to a small window around the server clock to keep a stale signed revocation
from being replayed as a fresh one after the fact.

The register is an in-process set of `(account, keyId)`. The response says so:

```jsonc
{ "revoked": true, "durable": false, "reason": "…forgotten on restart; the grant's own expiry is the durable bound." }
```

> ### Why `durable: false` is a field and not a footnote
>
> This gateway persists nothing — its intent store, dedup map, quota windows and caches are all
> in-process, the container declares no volume, and it runs single-instance. A revocation register can
> therefore only be in-process, and a restart forgets it.
>
> The alternatives were: (a) claim durability the service cannot keep — a fabricated guarantee about
> a security control, which is the worst available option; (b) introduce durable storage, which is a
> deliberate architectural change well outside this feature and one whose absence is load-bearing
> elsewhere; (c) state the truth in the payload so no consumer can accidentally render a stronger
> claim than the service makes. (c) is what ships, and the short lifetime cap is what makes it
> tolerable: **with a weak revocation guarantee, the expiry is the real revocation.**
>
> Every consumer — the app card, the console, the MCP server — must repeat both facts: that the
> revocation is registered on the live service, and when the grant expires on its own.

## 8. Security properties

**What a token holder can do**: read the member's profile, membership, wagers and the live fee rates;
obtain unsigned typed data; converse with the assistant. Within the scopes the grant names, and only
until it expires.

**What a token holder cannot do**: move any value; sign anything; submit anything as the member;
create another token; extend or re-scope this one; read another account's data; reach any surface
outside the scope vocabulary. Nothing in the vocabulary spends, and the built typed data must still be
signed by the member's own wallet before it can do anything at all.

**What the platform cannot do**: mint a token, recover one, or derive a member key. There is no key
table, so there is nothing to breach; the strongest thing an attacker with full gateway access gets is
the ability to censor requests — which is the same bound the relay already operates under.

**Threats and their answers**:

| Threat | Answer |
|---|---|
| Stolen token | Scope-limited, time-limited, revocable (best-effort), and cannot move value |
| Replayed grant | Bound by `expiresAt`; the lifetime cap keeps the window short |
| Forged signature | Verified per request; a contract-account check is required before any denial |
| Token in a URL or a log | Header-only by contract; the audit logger drops credential-shaped keys as a backstop |
| Scope escalation | The scope string is inside the signature; changing it invalidates the token |
| Label tampering | Impossible to exploit — the label is outside the struct and is never read by the gateway |
| Cross-account use | `account` is signed and re-derived; nothing accepts a caller-asserted address |

## 9. Non-goals

1. **No on-chain verifier.** These structs are never verified by a contract, appear in no
   `*_TYPEHASH`, and must not be added to the contract-verified parity set.
2. **No refresh, no rotation, no renewal endpoint.** A new key is a new signature — one prompt, no
   server state, nothing to expire on the platform side.
3. **No delegation.** A grant names one account and one key id; there is no "on behalf of", no
   sub-key, and no scope that would let a holder issue another grant.
4. **No server-side key list.** The member's device holds the metadata; the platform holds nothing.
   An endpoint that enumerated a member's keys would require exactly the store this design removes.
