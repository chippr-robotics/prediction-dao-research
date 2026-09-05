# Data Model: Gateway Caller Authentication and Abuse Prevention

**Feature**: `specs/105-gateway-caller-auth` | **Phase**: 1 | **Date**: 2026-09-04

This document fixes the vocabulary the implementation uses. Nothing here is persisted to a member's
device or to a chain; every entity is either request-scoped, held in process memory, or read from
configuration. **No entity in this feature stores member business data**, which is what keeps the
gateway inside the bounded no-backend exception.

---

## 1. AssuranceTier

The central concept. Everything else is defined relative to it.

An ordered enumeration describing **what was actually proven about a caller**. Order matters: a route
declares a minimum, and a caller satisfies it by holding that tier or higher.

| Value | Ordinal | What it proves | Obtained from |
|---|---|---|---|
| `anonymous` | 0 | Nothing. The request arrived. | absence of any credential |
| `human` | 1 | A real browser on a real device, recently | a verified challenge token |
| `address` | 2 | Control of a specific account | a verified capability grant, signature only |
| `member` | 3 | That, **plus an active paid membership** | the same grant, plus a successful tier read |
| `app` | 4 | This exact signed application binary | device attestation (**not built** — see §8) |

### Why `address` and `member` are separate rungs

The existing verifier returns **403 `membership_required`** unless the account holds a live paid tier on
the reference chain. So "member-verified" in this codebase already means *"holds a paid membership"*,
not *"proved control of this address"* — and gating trading, broadcast or listing on it would stop any
member without a paid tier from trading at all. That is a severe regression this feature never intended.

Splitting the rung fixes it without weakening anything: **proof of control is what these routes actually
need.** A caller who signed a grant is stable, revocable, attributable and rate-limitable, which is
everything metering and accountability require. Whether they also bought a membership is a *product*
question that this feature must not silently answer.

`address` outranks `human` because it is strictly more accountable — a challenge token proves a browser
existed, an account proves who is answerable.

### Rules

- **The ladder is not a claim of app identity.** `human` and `member` say nothing about *which*
  application made the request. Only `app` does, and it is unreachable on the web. FR-005 binds every
  message, log field and metric label to this distinction.
- **Ordinals are for comparison only.** They are never serialised, never sent to a client, and never
  stored — a route asserts `tierOf(req) >= MEMBER`, and that is the entire use.
- **A tier is established per request**, from credentials presented on that request. There is no
  session object and no server-side session state.
- **Higher is not automatic.** A member-verified caller is `member`, not `app`. A caller presenting
  both a challenge token and a grant resolves to `member` (the higher), and both facts are recorded.

---

## 2. CallerIdentity

The resolved outcome of examining one request. Request-scoped; never persisted.

| Field | Type | Notes |
|---|---|---|
| `tier` | AssuranceTier | the highest tier actually proven |
| `subject` | string \| null | the **non-rotatable** identifier metering keys on (§5). Account address at `member`; challenge-token digest at `human`; `null` at `anonymous` |
| `evidence` | Evidence[] | every credential examined and its outcome — for audit, never for authorisation |
| `verificationState` | `verified` \| `unverifiable` | **load-bearing**, see below |
| `reason` | string \| null | present only when a credential was rejected or unverifiable |

### `verificationState` is not a boolean in disguise

`unverifiable` means a dependency could not be reached — the membership source timed out, the
challenge service was unreachable. It is **categorically not** a failed verification, and the two must
never collapse into one falsy value. FR-009 and FR-017 turn on this: `unverifiable` yields a retryable
temporary failure, never a denial.

This is why the field is a string enumeration rather than `verified: boolean`. A boolean has one
falsy value and would force two very different outcomes to share it — which is exactly the bug the
requirement exists to prevent.

### Evidence

| Field | Type | Notes |
|---|---|---|
| `kind` | `challenge` \| `grant` \| `attestation` | which credential type |
| `outcome` | `accepted` \| `rejected` \| `unverifiable` \| `absent` | |
| `tierIfAccepted` | AssuranceTier | what this credential would grant |
| `detail` | string \| null | **never** contains credential material |

---

## 3. CredentialVerifier

The extension point FR-004 requires. A verifier examines one credential kind and returns Evidence.

```
verify(request) -> { kind, outcome, tierIfAccepted, subject?, detail? }
```

### Rules

- **Adding a tier means adding a verifier, never editing a route.** The attestation tier ships as a
  verifier registration and nothing else. This is the whole reason the shape exists.
- **A verifier never throws to deny.** A thrown error is indistinguishable from a bug; a verifier
  returns `rejected` for "this credential is not valid" and `unverifiable` for "I could not tell".
- **Verifiers are independent and order-free.** Resolution runs each and takes the maximum accepted
  tier. No verifier may depend on another having run.
- **A verifier that is not configured returns `absent`, not `rejected`.** An unconfigured challenge
  service must not deny every anonymous caller.

---

## 4. ProtectedRoute

Configuration, not runtime state. Declares what a route demands.

| Field | Type | Notes |
|---|---|---|
| `pattern` | string | route path pattern |
| `minimumTier` | AssuranceTier | the floor |
| `upstream` | string \| null | which upstream credential this route spends, for §6 attribution |
| `class` | `read` \| `write` \| `sign` | drives defaults and the FR-007 audit |

### The declaration is the source of truth

There is exactly one table. The middleware, the operator display, the metering attribution and the
least-privilege tests all read it. A route absent from the table is a configuration error rather than
an implicitly public route — **silence is not permission**, matching the deny-by-default posture the
platform already applies to vault policy.

Initial assignment, from FR-007:

| Route class | Minimum | Rationale |
|---|---|---|
| Market, listing and perps **reads** | **`anonymous`** | FR-006 — reads never refuse for want of a tier |
| Keyed-access **issuance** | **`anonymous`** | FR-022 — tier shapes *what* is issued, never *whether* |
| Bitcoin **broadcast**, marketplace and venue **writes**, venue **order signing** | **`address`** | irreversible, or spends platform commercial standing — needs an answerable party, not a purchase |
| Health, status, build identity | `anonymous` | unchanged |

### A challenge is a metering upgrade, never an access gate

This is the correction that most improves the feature, and the first draft of this document got it
wrong — it put a `human` minimum on reads, which turns an unreachable challenge service into a
**non-retryable 403** on exactly the surfaces FR-006, FR-017 and US1 scenario 3 require to keep working.

Tier does not decide *whether* a read is served. It decides **how much**:

| Tier | Read access | Rate ceiling |
|---|---|---|
| `anonymous` | yes | low |
| `human` | yes | materially higher |
| `address` / `member` | yes | highest |

A challenge outage therefore costs throughput and never access, and a logged-out visitor needs no
challenge ceremony during boot before the first market fetch. **Reads never refuse for want of a tier;
they slow down.**

`member` appears in no row of the route table. It is a tier the ladder can express and that metering may
reward, and deliberately not a requirement this feature imposes anywhere.

---

## 5. UsageCounter

Consumption recorded against an identifier the caller cannot freely rotate.

| Field | Type | Notes |
|---|---|---|
| `scope` | `{ tier, upstream }` | independent windows, per FR-012 |
| `subject` | string | from CallerIdentity.subject; falls back to a network identifier only at `anonymous` |
| `count` / `window` | number / duration | |

### Rules

- **The key is never caller-asserted.** This is the defect being repaired: an address supplied in a
  request path is a self-chosen name, and metering on it means metering on nothing.
- **Tiers do not share a window.** Exhausting the anonymous allowance must not deny an authenticated
  member — one window cannot serve two different promises.
- **Counters are operational state, not records.** They may be lost on restart. Nothing in this
  feature treats a counter as evidence of anything.

---

## 6. UpstreamCredential

Configuration describing a platform-held third-party credential.

| Field | Type | Notes |
|---|---|---|
| `id` | string | stable identifier, also the metric label (bounded set — FR-027) |
| `ceiling` | rate/spend cap | enforced **before** the upstream is called (FR-013) |
| `enabled` | boolean | disableable without redeploy (FR-014) |
| `rotationRunbook` | doc reference | FR-032 |

**The ceiling is checked before the call, not after.** A cap enforced on the response bounds nothing —
the spend has already happened. This is the difference between a budget and a receipt.

---

## 7. IssuedAccess

The credential handed to a client so it can read directly from the data provider. §7 and §8 are the
keyed-data-access half of the feature.

| Field | Type | Notes |
|---|---|---|
| `endpoint` | string | the provider address the client will call |
| `credential` | string | the expiring token |
| `expiresAt` | timestamp | absolute, not a duration |
| `permits` | string[] | the operations allowed — read-only (FR-023) |
| `issuedToTier` | AssuranceTier | shapes lifetime, rate and permitted operations |
| `keyId` | string | which signing key produced it — the rotation handle (FR-025) |

### Rules

- **Both fields reach the browser and both are readable there.** This is the accepted residual, stated
  in the spec rather than hidden. The design bounds theft; it does not prevent it.
- **`endpoint` alone must never be sufficient.** The entire safety of transmitting it rests on the
  provider rejecting a request that lacks a valid `credential`. §8 is what makes that checkable rather
  than assumed.
- **`expiresAt` is absolute.** A duration would be interpreted against the client's clock.
- **Never logged.** `credential` is key material for its lifetime and is excluded from every emitted
  field (FR-028 of the secrets rules, FR-037 here).

---

## 8. ProviderEndpoint

Configuration plus a **verified** enforcement state. The subject of FR-026.

| Field | Type | Notes |
|---|---|---|
| `id` / `chains` | string / number[] | which chains it serves |
| `address` | string | held server-side; reaches a client only inside an IssuedAccess |
| `enforcement` | `verified` \| `absent` \| `unverifiable` | **three states, deliberately** |
| `checkedAt` | timestamp | staleness of the last check |

### Why enforcement has three states and why two of them refuse

An endpoint with second-factor enforcement switched off is **identical in every log** to one with it
on — until the address turns out to have been sufficient by itself. There is no observable difference
until the moment it matters.

So `absent` refuses, and **`unverifiable` refuses too**. This is the one place in the feature where
"we could not tell" is treated as "no" rather than as a retryable condition, and it inverts FR-009
deliberately: everywhere else, failing closed would deny a legitimate member, so unverifiable is
retryable; here, failing open transmits an unprotected credential. **The asymmetry is the design.**

---

## 9. AccessIssuanceRecord

Audit, per FR-031: which endpoint was served, to which tier, under which enforcement, when.

**Records the decision, never the credential.** Sufficient to answer "what did we hand out, to whom,
under what protection" after the fact, and useless to anyone who steals the log.

---

## Relationships

```
Request
  │
  ├── CredentialVerifier[]  (challenge | grant | attestation)
  │        └── Evidence[] ──┐
  │                          ▼
  │                    CallerIdentity { tier, subject, verificationState }
  │                          │
  ├── ProtectedRoute.minimumTier  ──►  admit / refuse / retry-later
  │                          │
  ├── UsageCounter { scope:{tier,upstream}, subject }
  │                          │
  ├── UpstreamCredential.ceiling  ──►  checked BEFORE the upstream call
  │
  └── (issuance route only)
           ProviderEndpoint.enforcement ──► verified? ──► IssuedAccess ──► AccessIssuanceRecord
                                             │
                                       absent | unverifiable ──► refuse
```

## What is deliberately absent

- **No session store.** Identity resolves per request from presented credentials.
- **No member profile, preference, or business data.** The gateway stays stateless with respect to
  members, which is the property the no-backend exception is bounded by.
- **No credential persistence.** Issued credentials are minted and forgotten; the audit record holds
  the decision, not the secret.
- **No revocation list for issued access.** Lifetime is the bound. Revocation at scale is retiring a
  signing key (`keyId`), which invalidates everything it signed at once — cheaper and more certain
  than tracking individual credentials, and honest about what it does.
