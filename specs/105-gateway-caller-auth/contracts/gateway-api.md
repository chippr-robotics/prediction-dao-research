# Contract: Caller Identity and Keyed Access

**Feature**: `specs/105-gateway-caller-auth` | **Phase**: 1 | **Date**: 2026-09-04

Interface contract for what this feature adds to the relay-gateway. Error envelopes follow the
existing shape (`{ error: { code, reason } }`) and new codes extend the existing vocabulary
(`origin_denied`, `rate_limited`, `quota_exceeded`, `insufficient_scope`, `upstream_unavailable`, …)
rather than inventing a second convention.

---

## Part 1 — Caller identity applies to every client-facing route

Not a route. A resolution step that runs before route handlers and attaches a `CallerIdentity`.

### Ordering, and why it is load-bearing

```
CORS / preflight ─► body parse ─► origin lock ─► CALLER IDENTITY ─► route + quota ─► handler
```

Three ordering facts that a naive implementation gets wrong:

- **After the origin lock, not before.** The lock is cheap and rejects non-edge traffic; identity
  resolution may make a network call. Resolving first would let an off-edge caller cost us an upstream
  round trip per request.
- **Before route dispatch, not inside handlers.** Identity must be resolvable for a route that does not
  exist, so an unauthenticated probe cannot enumerate routes by their differing error shapes.
- **Preflight never carries credentials.** `OPTIONS` short-circuits at CORS, exactly as today.
  Resolution must never see one, or every preflight resolves `anonymous` and pollutes metering.

### Resolution

Every configured verifier runs. The result is the **highest accepted tier**. Precedence for
`verificationState` when verifiers disagree:

1. Any verifier `accepted` → `verified` at the highest accepted tier. A single success settles it —
   another verifier's timeout is then irrelevant.
2. No acceptance, any `unverifiable` → `verified: unverifiable`, tier `anonymous`.
3. Otherwise → `verified` at `anonymous`.

**Rule 1 before rule 2 is deliberate.** A member holding a valid grant must not be downgraded because
an unrelated challenge service timed out.

### Refusal contract

| Situation | Status | Code | Retryable |
|---|---|---|---|
| Tier below the route's minimum, `member` required | **403** | `member_grant_required` | no |
| Tier below the route's minimum, `human` required | **403** | `challenge_required` | no |
| A credential was presented and is invalid | **403** | `credential_rejected` | no |
| A credential was presented, verification unreachable | **503** | `auth_unverifiable` | **yes** |
| Membership source unreachable | **503** | `membership_unreadable` | **yes** |
| Per-subject or per-tier quota exhausted | **429** | `quota_exceeded` | yes, after window |
| Upstream ceiling reached before the call | **429** | `upstream_ceiling_reached` | yes |
| Identity layer disabled by configuration | — | — | request proceeds; state disclosed at `/status` |

`auth_unverifiable` and `membership_unreadable` are **already established** by spec 095 as retryable
503s. This feature reuses them verbatim rather than minting synonyms — a second code for the same
condition is how one of them ends up handled as a denial.

Every 403 body names what is required and how to obtain it (FR-008):

```json
{ "error": {
    "code": "member_grant_required",
    "reason": "This action signs with a platform credential and requires a member session. Authorise one in Settings ▸ API access.",
    "required": { "tier": "member" } } }
```

`required` is additive and safe for an older client to ignore.

### Response headers

`X-FairWins-Tier: anonymous|human|member` on every client-facing response.

Diagnostic only — **never** an input to authorisation, and it deliberately does not name an
application, because the web cannot prove one (FR-005).

---

## Part 2 — `POST /v1/access/rpc`

Issues short-lived, read-only keyed data access. The client calls the provider directly afterward;
**no read traffic is proxied**.

### Request

```json
{ "chainId": 137, "challengeToken": "0x…" }
```

Both fields optional in effect: `challengeToken` is absent for a caller already holding a member
grant, and its absence merely resolves a lower tier.

### Response `200`

```json
{ "endpoint": "https://<host>/<path>",
  "credential": "<jwt>",
  "expiresAt": "2026-09-04T12:15:00Z",
  "permits": ["eth_call", "eth_getBalance", "eth_getLogs", "…"],
  "tier": "human",
  "keyId": "k3" }
```

- `expiresAt` is **absolute UTC**, never a duration — a duration is interpreted against the client's
  clock, and a skewed client would either discard a valid credential or keep a dead one.
- `permits` is returned so the client can avoid issuing a call the provider will reject, and so the
  restriction is **visible** rather than an invisible server-side surprise.
- `keyId` is echoed for support and rotation diagnostics; it is not a secret.

### Refusals

| Situation | Status | Code | Retryable |
|---|---|---|---|
| Module not configured | **503** | `access_unconfigured` | no — honest absence |
| Killswitch engaged | **503** | `access_disabled` | yes |
| No endpoint configured for `chainId` | **404** | `chain_unavailable` | no |
| Endpoint enforcement `absent` | **503** | `endpoint_unprotected` | no — **operator alert** |
| Endpoint enforcement `unverifiable` | **503** | `endpoint_unverified` | no — **operator alert** |
| Issuance quota exhausted for this subject | **429** | `quota_exceeded` | yes |

**`endpoint_unprotected` and `endpoint_unverified` refuse rather than degrade**, and this is the one
inversion in the feature. Everywhere else "we could not tell" is retryable, because failing closed
would deny a legitimate member. Here failing open transmits a credential that may be sufficient on its
own — so unverifiable is treated as unprotected. Both are operator alerts, not member-facing errors:
**the client's correct response is to fall back to public capacity and say it is degraded** (FR-028),
not to show an error.

### Client obligations

1. **Renew before expiry**, not on failure — a read failing because the app let a credential lapse is
   avoidable and looks like an outage.
2. **Fall back to public capacity** on any refusal, and disclose the degraded state. Never render
   throttled or partial results as complete (FR-028).
3. **A member's own configured endpoint always wins** — this route is consulted only where the app
   would otherwise use a build default (FR-029).
4. **Never persist `credential`** beyond memory. It is key material for its lifetime.

---

## Part 3 — `GET /status` additions

Extends the existing origin-lock-gated disclosure. Operator telemetry only.

```json
{ "callerIdentity": {
    "verifiers": { "challenge": "configured", "grant": "configured", "attestation": "not-built" },
    "enforcing": true },
  "keyedAccess": {
    "state": "read",
    "endpoints": [ { "id": "qn-001", "chains": [1,10,8453,42161],
                     "enforcement": "verified", "checkedAt": "2026-09-04T11:58:00Z" } ],
    "activeKeyIds": ["k3","k2"] } }
```

Three honesty rules bind this payload:

- **`enforcing: false` must be visible.** A gateway running with identity checks disabled looks
  identical to one enforcing them; FR-015 requires it to say so, here and loudly at boot.
- **`state` is `read` / `not-configured` / `unreadable`**, and endpoint detail exists only under
  `read`. An unreadable check never renders as an empty endpoint list — absence of data is not data.
- **`attestation: "not-built"` is deliberate wording.** Not `false`, not `disabled` — the tier does not
  exist yet, and saying "disabled" would imply it could be turned on.

`activeKeyIds` showing more than one is the normal, expected state **during** a rotation, not an
anomaly.

---

## Part 4 — What this contract deliberately does not add

- **No RPC passthrough.** No route accepts an arbitrary JSON-RPC body and forwards it. FR-030 — such a
  route would be a general-purpose proxy over a platform credential, which is the thing being
  prevented. The issuance route hands out access; it never carries traffic.
- **No revocation endpoint for issued credentials.** Lifetime is the bound; mass revocation is retiring
  a `keyId`. An endpoint implying per-credential revocation would promise precision the design does not
  have.
- **No tier in a request body.** A caller never asks for a tier; a tier is only ever concluded from
  evidence.
- **No pricing.** x402 is a separate rail on separate routes and is untouched here.
