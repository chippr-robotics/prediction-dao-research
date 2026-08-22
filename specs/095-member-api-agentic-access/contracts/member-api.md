# Contract: Member API (`/v1/member/*`) — spec 095

Producer: `services/relay-gateway/src/memberApi/{contract,routes,auth,revocation,membership,openapi,wagers,intents,assistant}.js`,
config block `memberApi` in `src/config/index.js`, mounted in `src/server.js`.

`contract.js` holds the **one** declaration of what this module serves — the route list, the scope
vocabulary and the error codes. `routes.js` mounts from it and `openapi.js` iterates it, so the
running server and the published document cannot describe different APIs; the gateway suite asserts
the mounted set equals the documented set.
Companion documents: [api-key-grant.md](./api-key-grant.md) (the credential) and
[mcp-server.md](./mcp-server.md) (the agent-facing projection).

> **This API cannot move value, and that is structural, not a policy.** Every operation is a read, a
> quote, or the construction of **unsigned** typed data. There is no scope that spends, no endpoint
> that signs, and no code path in which the gateway holds a member key. Submission of a signed payload
> goes to the pre-existing `POST /v1/intents`, which screens the *recovered* signer and always leaves
> self-submit available. A total member-API outage therefore cannot touch a value path, and cannot
> prevent anything a member's own wallet can do.

---

## 1. Cross-cutting behaviour

Mounted **unconditionally** (`server.js`), so a disabled module answers `503 member_api_unconfigured`
rather than a bare 404 — "off" is a stated fact, not a missing route.

Request pipeline, in this order:

| # | Stage | Failure |
|---|---|---|
| 0 | CORS / preflight (`OPTIONS` → 204, before the origin lock) | — |
| 1 | Origin lock (`X-Origin-Auth`, injected zone-wide by Cloudflare) | `403 origin_denied` |
| 2 | Module killswitch (`MEMBER_API_KILLSWITCH`) | `503 member_api_killed` |
| 3 | Global gateway killswitch | `503 killswitch_active` |
| 4 | `memberApi.enabled` | `503 member_api_unconfigured` |
| 5 | Bearer token parse + expiry + lifetime cap | `401 invalid_token` / `401 token_expired` / `401 token_ttl_exceeded` |
| 6 | Signature recovery (ECDSA, then ERC-1271) | `401 invalid_signature` / **`503 auth_unverifiable`** |
| 7 | Revocation register | `401 token_revoked` |
| 8 | Membership on the reference chain (cached ≈60 s) | `403 membership_required` / **`503 membership_unreadable`** |
| 9 | Sanctions screen of the token account (fail closed) | `403 sanctioned_signer` / `503 screening_unavailable` |
| 10 | Scope check | `403 insufficient_scope` |
| 11 | Quota (per account, then global) | `429 quota_exceeded` + `Retry-After` |

> **Stages 6 and 8 have a retryable outcome on purpose.** A contract account has no public key, so an
> ECDSA recovery that does not match the claimed account is *exactly* what a legitimate smart-account
> signature looks like from outside; when the on-chain leg cannot run, the honest answer is "could not
> verify", never "forged". The same holds for membership: an RPC failure is not tier zero. Reporting
> either as a 401/403 would tell a member their key is bad when the truth is that a chain did not
> answer.

Two paths deliberately sit outside part of this pipeline:

- `GET /v1/member/openapi.json` runs stages 0–4 only. **No token is required** — a contract nobody can
  read before authenticating is not a contract.
- `POST /v1/member/keys/revoke` runs stages 0–4, then verifies the **revocation signature** instead of
  a bearer token (stages 5–7 do not apply). A member who has lost a token must still be able to
  withdraw it.

**Error body** is the gateway-wide shape (`src/errors.js`), always exactly:

```jsonc
{ "error": { "code": "…", "reason": "…" } }
```

Bitcoin's flat `{ error, message }` body is the gateway's one documented deviation and is **not**
copied here. Unhandled (non-`GatewayError`) throws map to `503 upstream_unavailable` — never a 500
with a stack.

### Error codes

| Status | `code` | Meaning |
|---|---|---|
| 400 | `bad_request` | malformed body, unknown action, oversized payload |
| 400 | `unsupported_action` | the action exists but is not buildable here (see §9) |
| 401 | `invalid_token` | not a `fw1.` token, or the grant does not parse |
| 401 | `token_expired` | `expiresAt` is in the past |
| 401 | `token_ttl_exceeded` | `expiresAt - issuedAt` exceeds `MEMBER_API_MAX_TTL_DAYS` |
| 401 | `invalid_signature` | recovery produced another address **and** the chain says the account holds no code |
| 401 | `token_revoked` | the key id is in this process's revocation register |
| 403 | `origin_denied` | the request did not arrive through the platform edge |
| 403 | `membership_required` | definitively no active paid membership on the reference chain |
| 403 | `sanctioned_signer` | the screening source returned a positive match |
| 403 | `insufficient_scope` | the token does not carry the scope this operation needs |
| 429 | `quota_exceeded` | per-account or global allowance exhausted; `Retry-After` is set |
| 503 | `auth_unverifiable` | the ERC-1271 leg could not run (chain read failed). **Retry.** |
| 503 | `membership_unreadable` | the reference-chain membership read failed. **Retry.** |
| 503 | `screening_unavailable` | the sanctions source could not answer (fail closed) |
| 503 | `member_api_killed` | module killswitch |
| 503 | `member_api_unconfigured` | `MEMBER_API_ENABLED` is not `true` |
| 503 | `killswitch_active` | global gateway killswitch |
| 503 | `assistant_unconfigured` | the assistant sub-module is off or has no model credential |
| 503 | `assistant_unavailable` | the model upstream failed or timed out |
| 503 | `upstream_unavailable` | unexpected internal failure (catch-all) |

### CORS

`server.js` adds `Authorization` to `Access-Control-Allow-Headers`, which previously listed
`Content-Type` alone. Without it a browser sending a bearer token fails preflight **silently**.
Nothing else about the CORS posture changes: no credentials mode, no cookies, the `ALLOWED_ORIGINS`
allow-list untouched, and the `X-Origin-Auth` edge lock unchanged.

> **The origin lock is a transport lock, not identity.** It is one zone-wide shared secret injected by
> Cloudflare in transit, and it names the platform edge, never a member. A client calling a production
> host from outside a browser must satisfy it *as well as* presenting a member token. The two are
> additive; neither substitutes for the other.

### Caching, quotas, logging

- Membership reads are cached per account for `MEMBER_API_MEMBERSHIP_CACHE_MS` (default 60 000). Only
  a `read` result is cached: an unreadable membership is re-attempted on the next request rather than
  pinned for a minute.
- Quotas use the gateway's existing sliding-window helper, keyed on the **verified token account**
  (lowercased) and then globally. Deliberately **not** the caller IP: `trust proxy` is unset and nginx
  fronts the container, so an IP key would pool every member into one bucket. Assistant turns are
  counted in the same allowance as reads.
- The audit line for any member-API event carries the account, the key id, the scope used, the outcome
  and counts. It **never** carries a token, a signature, a grant, or assistant message content. The
  audit logger's forbidden-key set is a backstop, not a licence to pass one.

---

## 2. Authentication

```
Authorization: Bearer fw1.<base64url(grantJSON)>.<base64url(signature)>
```

The full grammar, the EIP-712 types, the canonicalisation of `scopes` and the verification order are
specified in [api-key-grant.md](./api-key-grant.md). Two properties this document depends on:

1. **The gateway stores nothing to issue a token.** Validity is decided entirely by the signature, the
   validity window, and live reads. There is no key record, no rotation, and nothing to leak.
2. **`label` is not part of the signed struct.** Renaming a key on the member's device must not
   invalidate it, and a label the member types must never be able to change what a signature means.

## 3. Scopes

| Scope | Grants |
|---|---|
| `read:profile` | `GET /v1/member/me`, `GET /v1/member/keys/status` |
| `read:membership` | `GET /v1/member/membership` |
| `read:wagers` | `GET /v1/member/wagers` |
| `read:fees` | `GET /v1/member/fees` |
| `build:intents` | `POST /v1/member/intents/build` |
| `assistant:chat` | `POST /v1/member/assistant/chat` |

The vocabulary is closed and least-privilege. **No scope moves value**: there is no `write:`, no
`submit:`, no `spend:`, and adding one would be a change to the custody model, not a feature flag.
A grant carrying an unknown scope string is refused at parse time rather than silently ignored — a
token that appears to grant something it does not is worse than a rejected one.

`SCOPES` is declared once in `memberApi/contract.js` and consumed by the auth middleware **and** by
`openapi.js`, so the scope a handler enforces and the scope the document advertises are one value,
not two that happen to agree today.

---

## 4. `GET /v1/member/openapi.json`

The OpenAPI 3.1 document for this API. Guarded to stage 4 only (module must be enabled); **no token
required**.

```jsonc
{
  "openapi": "3.1.0",
  "info": { "title": "FairWins Member API", "version": "1.0.0", "description": "…" },
  "servers": [{ "url": "https://relay.fairwins.app" }],
  "components": {
    "securitySchemes": {
      "memberToken": { "type": "http", "scheme": "bearer", "bearerFormat": "fw1", "description": "…" }
    },
    "schemas": { "Error": …, "ChainRead": …, "Membership": …, "TypedData": … }
  },
  "paths": { "/v1/member/me": { "get": { "operationId": "getMe", "x-fairwins-scope": "read:profile", … } }, … }
}
```

Authored as a JS object (`src/memberApi/openapi.js`) that **iterates `contract.js`** — the same route
list `routes.js` mounts and the same scope and error-code constants the middleware enforces. Every
operation carries `x-fairwins-scope`; every operation's `responses` enumerate the codes §1 lists for
it. There is no generator and no validation middleware — the object *is* the artifact, and a route
added to one side is automatically present on the other. A document describing an endpoint the
gateway does not serve would be worse than no document, because an agent generated from it fails at a
member's request rather than at review.

---

## 5. `GET /v1/member/me`

Token introspection. Scope `read:profile`.

```jsonc
{
  "account": "0xabc…",
  "keyId": "0x1f…32 bytes",
  "scopes": ["read:profile", "read:wagers"],
  "issuedAt": 1750000000,
  "expiresAt": 1757776000,
  "membership": {
    "state": "read",                    // "read" | "unreadable"
    "chainId": 137,
    "tier": 3, "tierName": "Gold",
    "active": true,
    "expiresAt": 1760000000
  },
  "revocation": { "revoked": false, "durable": false }
}
```

- `tier`/`tierName`/`active`/`expiresAt` exist **only** in `state: "read"`. There is no `?? 0` shape
  for a failed read to fall into.
- Reaching this endpoint at all means the membership check passed, so `state: "unreadable"` cannot
  appear here in practice; it is present in the schema because the field is the same three-state
  reading `GET /v1/member/membership` returns, and a client should not need two parsers.
- `revocation.durable` is **always `false`** — see §7.

---

## 6. `POST /v1/member/keys/revoke`

Withdraw a key. **Self-authorising**: the body's signature is the authorisation, and no bearer token
is required or accepted as a substitute. A member who has lost a token must still be able to revoke
it.

```jsonc
// request
{ "revocation": { "account": "0xabc…", "keyId": "0x1f…", "revokedAt": 1750500000 },
  "signature": "0x…" }
```

```jsonc
// 200
{ "revoked": true,
  "durable": false,
  "reason": "Registered on this gateway instance only; it is forgotten on restart. The grant's own expiry is the durable bound." }
```

| Failure | Code |
|---|---|
| body shape / `revokedAt` far in the future | `400 bad_request` |
| signature does not recover to `account`, and the account holds no code | `401 invalid_signature` |
| the ERC-1271 leg could not run | `503 auth_unverifiable` |

**The honesty rule for this endpoint is binding on every consumer.** The gateway persists nothing
(its intent store, dedup map, quotas and caches are all in-process, single-instance), so a revocation
register can only be in-process. Reporting `durable: true`, or a UI saying "revoked" without saying
where and for how long, would claim a guarantee the service cannot keep. Every surface that reports a
revocation must also name the grant's expiry. This is why `MEMBER_API_MAX_TTL_DAYS` is a hard refusal
rather than a default: with a weak revocation guarantee, the expiry *is* the revocation.

## 7. `GET /v1/member/keys/status?keyId=[&account=]`

Scope `read:profile`. `keyId` is required and must be a 0x-prefixed 32-byte hex value
(`400 bad_request` otherwise).

```jsonc
{ "account": "0xabc…", "keyId": "0x1f…", "revoked": false, "durable": false }
```

**This endpoint answers about the caller, and only the caller.** `account` is accepted for symmetry
with the signed revocation struct but is never honoured for a different address — a mismatch is
`403 insufficient_scope`, not a lookup. That is why an otherwise near-public fact needs a token at
all: without one it would be an oracle for whether *anybody's* key id is live.

`durable: false` is a constant, for the reason in §6. A client that omits it from its own rendering is
misreporting the service.

---

## 8. `GET /v1/member/membership`

Scope `read:membership`. The three-state tier read on the membership **reference chain** — one chain
per environment cohort, the chain membership is written on. It is resolved once at boot
(`MEMBER_API_REFERENCE_CHAIN_ID`, defaulting to the first enabled chain with a recorded membership
contract, and failing boot if the override is not such a chain), **never** from the caller's chain and
never from a chain named in the request. Membership is only readable from one place because it is
also written in one place.

```jsonc
{ "chainId": 137,
  "state": "read",                     // "read" | "not-configured" | "unreadable"
  "tier": 3, "tierName": "Gold",
  "role": "WAGER_PARTICIPANT",
  "active": true,
  "expiresAt": 1760000000 }
```

`not-configured` means this deployment records no membership contract on the reference chain — a
different fact from an outage, and neither is a zero. Values exist only in `state: "read"`.

---

## 9. `GET /v1/member/wagers?chainId=`

Scope `read:wagers`. The token account's wagers, **per chain**, each with its own state.

```jsonc
{
  "account": "0xabc…",
  "chains": {
    "137":   { "state": "read", "wagers": [ … ] },
    "8453":  { "state": "not-configured" },
    "42161": { "state": "unreadable", "reason": "subgraph request failed" }
  },
  "asOf": "2026-08-22T18:04:00.000Z"
}
```

- `chainId` optionally narrows the answer to one chain. Omitted ⇒ every chain enabled on this
  deployment — which is always **one cohort**; a response never mixes testnet and mainnet data.
- Source is the per-chain subgraph configured as `MEMBER_API_SUBGRAPH_<chainId>`. **Unset ⇒
  `not-configured`. Fetch failure ⇒ `unreadable`.** Neither ever renders as `wagers: []`.
- `wagers` exists **only** in `state: "read"`. An empty array in that state means "this chain answered
  and the member has none there" — a fact, not an absence.

## 10. `GET /v1/member/fees`

Scope `read:fees`. Live platform fee rates.

```jsonc
{ "services": { "earn.lend": { "bps": 0, "capBps": 250, "source": "chain" }, … },
  "asOf": "2026-08-22T18:04:00.000Z" }
```

Read through the gateway's existing FeeRouter reader — the single source of truth for every
configurable rate. `source` is `"chain"` or `"env-fallback"`; a rate that could not be read is
reported as unreadable and **never** as `0`, because zero is a real, meaningful rate here (it means
"no fee line at all"). This endpoint does not introduce a second fee store and does not hardcode a
bps value.

---

## 11. `POST /v1/member/intents/build`

Scope `build:intents`. Returns **unsigned** EIP-712 typed data for a supported member action. The
gateway does not sign it, cannot sign it, and does not submit it.

```jsonc
// request
{ "action": "createWager", "chainId": 137, "params": { … } }
```

```jsonc
// 200
{
  "action": "createWager",
  "chainId": 137,
  "typedData": { "domain": {…}, "types": {…}, "primaryType": "CreateWagerIntent", "message": {…} },
  "target": "0x…",                     // the contract the relay will call
  "submitVia": {
    "relay": "/v1/intents",
    "selfSubmit": "Sign and send the equivalent call from your own wallet; the relay is optional and never required."
  }
}
```

Rules, each of which exists because breaking it produces a signature that means something other than
what the member was shown:

1. **The actor is the token account.** The action's actor field is set from the verified token and is
   **never** read from `params`. A client-asserted actor, signer, or "on behalf of" address is
   rejected, not honoured.
2. **Structs and domains come from the one source** (`@fairwins/intent-types`), never from a local
   table. Domains carry `{name, version}` and nothing else; `chainId` and `verifyingContract` are
   runtime values.
3. **`authOnly` actions return their true shape.** `poolJoin` has no intent struct — the EIP-3009
   authorisation *is* the intent — so the response returns that authorisation payload rather than a
   synthesised struct.
4. **Pool actions keep the domain/target split**: the transaction target is the factory, while the
   EIP-712 `verifyingContract` is the clone named in `params.pool`. Both are returned; they are not
   the same address and a caller must not assume they are.
5. **`invalidateNonce` is refused** with `400 unsupported_action` and a stated reason: the client
   signer overwrites the struct nonce with a fresh uniqueness marker, so a relayed call cannot express
   *which* nonce to burn and would silently invalidate an unused one. The real cancel path is a direct
   contract write from the member's wallet.
6. **An action whose target is not pinned on this deployment is refused** with `400 unsupported_action`
   naming the action and chain, rather than returning calldata the relay would reject downstream.
7. **Fee-bearing actions carry the live rate** and echo it as the member's `maxFeeBps` consent
   ceiling. A rate that could not be read is reported as unconfirmed; it is never assumed.

Submission is **not** part of this endpoint. A signed payload goes to the existing public
`POST /v1/intents`, which re-verifies the signature, re-screens the recovered signer and applies its
own quotas. This API adds no second relay pipeline and removes no self-submit fallback.

---

## 12. `POST /v1/member/assistant/chat`

Scope `assistant:chat`. An optional sub-module: `ASSISTANT_ENABLED` plus a model credential. Off or
uncredentialed ⇒ `503 assistant_unconfigured`.

```jsonc
// request
{ "messages": [ { "role": "user", "content": "where do I change my RPC endpoint?" } ],
  "surface": "/wallet?tab=settings" }          // optional hint about where the member is
```

```jsonc
// 200
{ "reply": "…",
  "model": "claude-sonnet-5",
  "usage": { "inputTokens": 412, "outputTokens": 88 } }
```

| Rule | Behaviour |
|---|---|
| Bounds | ≤ 20 messages, each ≤ 4 000 characters; over either ⇒ `400 bad_request` |
| Roles | `user` \| `assistant` only |
| Upstream | the model provider's messages API, via bounded `fetch` + `AbortController`; failure or timeout ⇒ `503 assistant_unavailable` |
| Quota | the module's per-account and global allowance, same as the reads. A turn costs an upstream model call, so a separate, tighter assistant allowance is a reasonable follow-up — but it is not shipped, and this document does not claim one |
| **Logging** | **message content is never logged, never audited, never cached.** The audit line carries the account, message **count** and outcome only |

The system prompt is **server-side** and describes the platform's surfaces plus the standing safety
rules: never claim to have performed an action; never ask for a private key, seed phrase or password;
suggest in-app destinations as links; state fees and risks honestly; say plainly when something is
unknown. The client renders every reply with the AI-generated / never-signs notice; the server never
returns a canned answer dressed as a model reply.

---

## 13. `/status` contribution

`GET /status` (origin-lock exempt) carries a `memberApi` block — operational state only, **no member
data, no counts of members, no key ids**:

```jsonc
"memberApi": {
  "enabled": true,                    // honest liveness: false under EITHER killswitch, not just config
  "killSwitch": false,
  "assistant": { "configured": true }  // a boolean; never the model credential, never the model name's provenance
}
```

`enabled` answers "would a request right now be served?".

---

## 14. Config & boot

Env block `memberApi` (`src/config/index.js`). Fail-loud validation applies **only when the module is
enabled**; a disabled module never throws at boot and fails closed at the route instead — losing an
optional feature must never take down the gasless relay path.

| Env | Default | Notes |
|---|---|---|
| `MEMBER_API_ENABLED` | `false` | anything but `true` ⇒ `503 member_api_unconfigured` |
| `MEMBER_API_KILLSWITCH` | `false` | ops kill for this module alone, checked **before** the global one |
| `MEMBER_API_MAX_TTL_DAYS` | `90` | a grant asking for longer is refused, never truncated |
| `MEMBER_API_REFERENCE_CHAIN_ID` | first enabled chain with a recorded `membershipManager` | the one chain membership is read on; an id that is not such a chain fails boot |
| `MEMBER_API_MEMBERSHIP_CACHE_MS` | `60000` | only `read` results are cached |
| `MEMBER_API_CLOCK_SKEW_SEC` | `300` | tolerance on `issuedAt`/`revokedAt` against the server clock |
| `MEMBER_API_REVOCATION_MAX` | `50000` | bound on the in-process register |
| `MEMBER_API_QUOTA_PER_ACCOUNT` | `120` | keyed on the **verified account**, never the caller IP |
| `MEMBER_API_QUOTA_GLOBAL` | `600` | |
| `MEMBER_API_QUOTA_WINDOW_MS` | `60000` | |
| `MEMBER_API_SUBGRAPH_<chainId>` | — | per-chain wager source; unset ⇒ that chain reports `not-configured` |
| `MEMBER_API_TIMEOUT_MS` | `5000` | upstream reads |
| `ASSISTANT_ENABLED` | `false` | sub-module switch |
| `ANTHROPIC_API_KEY` | — | **secret**; delivered per-container, never in the image, never logged, never echoed |
| `ASSISTANT_BASE_URL` | `https://api.anthropic.com` | must be a valid http(s) URL when the sub-module is enabled |
| `ASSISTANT_MODEL` | `claude-sonnet-5` | |
| `ASSISTANT_MAX_TOKENS` | `1024` | |
| `ASSISTANT_TIMEOUT_MS` | `30000` | |

Boot throws (only when the module is enabled) on: a TTL cap below one day, a reference chain that is
not an enabled chain with a recorded membership contract, a malformed or non-http(s) subgraph URL, and
— when `ASSISTANT_ENABLED=true` — a malformed `ASSISTANT_BASE_URL` or a non-positive
`ASSISTANT_MAX_TOKENS`.

> **A missing `ANTHROPIC_API_KEY` is deliberately NOT a boot failure.** It is an optional feature
> credential, delivered per-container by the platform's secret script and classified optional there:
> a missing one leaves the assistant failing closed with `503 assistant_unconfigured` while the rest
> of the gateway — including the gasless relay path — keeps running. Losing an optional feature must
> never take down a value path.

---

## 15. What this API deliberately does not do

1. **No signing, ever.** Not a member intent, not a Seaport order, not a UserOp, not a Bitcoin
   transaction. Every artifact it produces is unsigned, and every signed artifact it forwards was
   signed by the member.
2. **No custody, no key material.** It never holds, derives or reconstructs a private key, seed,
   passkey secret, xpub, or a third-party credential derived from one.
3. **No second relay pipeline.** Signed payloads go to the existing `POST /v1/intents`; a relay outage
   degrades to self-submit, never to "action unavailable".
4. **No server-side key store.** There is no key list to enumerate, rotate or leak; the token *is* the
   grant.
5. **No fabricated reads.** A chain, subgraph or venue that did not answer is reported as `unreadable`;
   an unconfigured source as `not-configured`; a missing value as `null`. Never `0`, never `[]`,
   never `false`.
6. **No cross-cohort answers.** A deployment serves exactly one cohort; testnet and mainnet data never
   appear in one response.
7. **No conversation retention.** The assistant endpoint keeps nothing: no transcript, no cache, no
   log line carrying content. Conversation memory is the member's device's business.
8. **No address book, no backup blobs, no recovered keys, no hardware metadata.** Those are
   frontend-only by design and are not exposed here at any scope.
