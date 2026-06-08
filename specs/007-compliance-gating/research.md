# Phase 0 Research: Compliance & Legal Gating Layer

All Technical-Context unknowns are resolved below. Factual claims (oracle address,
Cloudflare/GCP capabilities) were adversarially verified against primary sources.
Date: 2026-06-06.

---

## R1. Chainalysis on-chain Sanctions Oracle

**Decision**: Use the Chainalysis on-chain Sanctions Oracle (`SanctionsList`) as the
authoritative OFAC source. Read it (a) advisory client-side via RPC for UX and (b)
on-chain from `SanctionsGuard` for enforcement. Interface:
`interface IChainalysisSanctionsOracle { function isSanctioned(address) external view returns (bool); }`.

**Key facts (verified)**:
- Polygon **mainnet (137)** address: **`0x40C57923924B5c5c5455c48D93317139ADDaC8fb`**
  (verified contract on PolygonScan; same address on ETH/BSC/Avalanche/Optimism/Arbitrum/
  Fantom/Celo/Blast; **Base differs**: `0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B`).
- Polygon **Amoy (80002): NOT deployed** (empty EOA, no bytecode). → fork-test against a
  137 fork and use `MockSanctionsOracle` on Amoy/local.
- **Free**, no API key, no Chainalysis customer relationship for on-chain reads.
- Only `isSanctioned(address) view` is needed (do not rely on the undocumented
  `isSanctionedVerbose`).

**Rationale**: Free, authoritative, key-less, widely deployed, and fork-testable. Matches
the no-backend constraint (read on-chain or client-side via RPC; no server needed).

**Alternatives**: TRM/Elliptic (no free public on-chain oracle); Chainalysis off-chain
REST API (needs a key + a backend → violates the footprint constraint); self-maintained
SDN list (staleness/operational burden). All rejected.

**Risks**: oracle can lag OFAC; not a sole legal control. Address MUST be per-chain
injected (Amoy has none, Base differs) — validate it has bytecode at deploy. Treat an
unreachable/erroring oracle as **fail-closed** (block).

Sources: go.chainalysis.com/chainalysis-oracle-docs.html; polygonscan.com & amoy.polygonscan.com
(address `0x40C5…8fb`); PRNewswire 301500350 (free of charge); github.com/0xsequence/chainalysis.

---

## R2. On-chain SanctionsGuard + admin deny-list (FR-054 / FR-020)

**Decision**: A standalone `contracts/access/SanctionsGuard.sol` (OZ `AccessControl`,
`^0.8.24`) holding `IChainalysisSanctionsOracle public sanctionsOracle` (injectable; may
be `address(0)` off-mainnet) and `mapping(address => bool) private _denied`. Surface:
- `isAllowed(address) view → bool`: `false` if denied **or** (oracle set and
  `isSanctioned`); the oracle read is wrapped in `try/catch` and any revert / empty
  return-data is treated as **not allowed (fail-closed)**.
- `checkBlocked(address)`: reverts `SanctionedAddress(address)` for explicit revert reasons.
- `setDenied(address, bool, string reason)` — `onlyRole(SANCTIONS_ADMIN_ROLE)`, emits
  `DenyListUpdated(account, denied, msg.sender, reason)`.
- `setSanctionsOracle(address)` — `onlyRole(DEFAULT_ADMIN_ROLE)`, emits `SanctionsOracleUpdated`.

Consume via a sibling guard (not by extending `notFrozen`): `WagerRegistry.createWager`
(screen `msg.sender`), `WagerRegistry.acceptWager` (screen `msg.sender` **and** the
counterparty `w.creator`), `MembershipManager.purchaseTier`/`upgradeTier` (screen
`msg.sender`). The check is the **first Check** (before effects/transfers; CEI preserved);
contracts are already `nonReentrant`; the oracle read is a `view`/STATICCALL (no reentrancy).

**Rationale**: A deployed singleton gives one source of truth both consumers and the admin
UI target, mirrors the existing injectable `IOracleAdapter` pattern, and exposes a clean
FR-020 risk-scoring extension seam. Roles reuse OZ `AccessControl` (already a base of both
contracts) so the floppy-keystore admin holds `SANCTIONS_ADMIN_ROLE` + `DEFAULT_ADMIN_ROLE`.

**Decision — do NOT extend `notFrozen`**: `notFrozen` is operator account-moderation
(`ACCOUNT_MODERATOR_ROLE`) applied across the whole lifecycle incl. exit paths; sanctions
screening has different semantics (external oracle, fail-closed, different role,
cross-contract reuse) and a **narrower** surface (only fund-taking / standing-granting
entrypoints — never `claimRefund`/`declareDraw`, which stay open so a newly-listed party
can recover their own escrowed funds). Keep them independent and composable.

**Alternatives**: inline mapping per contract (duplicate state/admin), library/abstract
base (no shared singleton for the admin UI), Ownable (loses the two-role split),
fail-open-on-oracle-revert (violates fail-closed). All rejected.

**Risks**: STATICCALL to a non-contract address returns empty data — handle as
fail-closed. Counterparty-on-accept screening can make an open wager un-acceptable if the
creator is listed later (desired) — keep refund/expire ungated. Full Principle I gate
applies (Slither/Medusa/EthTrust-SL L2/security review). Gas overhead <5%.

Sources: `contracts/wagers/WagerRegistry.sol` (createWager L191, acceptWager L278,
`notFrozen` L101-104, refund-path reasoning L497-525), `contracts/access/MembershipManager.sol`
(purchaseTier L133, upgradeTier L154), `contracts/oracles/IOracleAdapter.sol`,
constitution.md (Principle I, floppy keystore).

---

## R3. Per-wager T&C version binding (FR-056/FR-057) — no key-derivation change

**Decision**: Do **both**: (a) bind the canonical T&C version hash as **ChaCha20-Poly1305
Associated Data (AAD)** on the content seal/open, and (b) add an authenticated top-level
`termsVersion` field to the encrypted-metadata schema (bump to **v1.1**, optional-on-read).

- AAD is added only at the **content** cipher call sites in
  `frontend/src/utils/crypto/envelopeEncryption.js`: `encryptEnvelope` (~L305),
  `encryptEnvelopeXWing` (~L482) and the matching `decryptEnvelope` (~L383) /
  `decryptEnvelopeXWing` (~L555). **Not** on the per-recipient DEK-wrap ciphers.
- `aad = utf8ToBytes("FairWins-TC|" + schemaVersion + "|" + termsVersionHashHex)`
  (full hash, deterministic, no secrets) — pinned in a `TERMS_AAD_PREFIX` builder in
  `constants.js`. The decrypt side reconstructs AAD from `envelope.termsVersion`, so a
  tampered version fails AEAD auth ("invalid tag", already handled at
  `useEncryption.js` ~L852).
- `termsVersion = { id, hash }` is emitted alongside `version`/`algorithm`/`content`/`keys`.

**Stays out of key derivation**: `getMarketSigningMessage(version)` →
`signer.signMessage` → `keccak256(toUtf8Bytes(sig))` → seed (`deriveKeyPair` ~L179,
`deriveXWingKeyPair` ~L237) is **untouched**. The T&C hash is only a function argument into
the AEAD + envelope JSON; the per-account key stays versionless/reproducible (FR-041).

**Canonicalization (frozen, FR-026/FR-059)**: `text.normalize('NFC')` → CRLF/CR → LF →
`trim()` → UTF-8 (`utf8ToBytes`) → `sha256` (already imported) → `bytesToHex`.

**Backward-compat (FR-057)**: `termsVersion` optional on read; legacy v1.0/v2.0 envelopes
have none → decrypt with **no AAD** (today's exact path) and are governed by the launch
version. New schema = `encrypted-metadata-v1.1.json` with `termsVersion` in `properties`,
out of `required`, `version` enum extended; this also reconciles the existing schema/runtime
drift (schema currently `additionalProperties:false` + describes the old xsalsa20 shape).

**Alternatives**: version in the signing message (breaks FR-041, changes the key);
plaintext `termsVersion` with no AAD (not tamper-evident); AAD only, no field (not
human-readable/queryable). Rejected.

Sources: `frontend/src/utils/crypto/envelopeEncryption.js`, `constants.js`,
`schemas/encrypted-metadata-v1.json`, `@noble/ciphers` `chacha20poly1305(key,nonce,AAD?)`.

---

## R4. Geo-blocking at Cloudflare + origin lock within the footprint (FR-001…FR-013)

**Decision**: Enforce geo at **Cloudflare** (it owns the true client IP); lock the Cloud
Run origin with a **Cloudflare-injected secret header verified in the existing nginx** — no
load balancer, Cloud Armor, or mTLS added (those are noted as future hardening outside the
footprint).

- **Geo gate**: WAF custom rule on `ip.src.country` (ISO 3166-1 alpha-2). Allowlist posture
  default: `not (ip.src.country in {<allowed>})` → Block; locked OFAC set + US always in
  the deny path. Block action → **custom 451** response (Cloudflare custom responses are
  Pro+, status 400-499, ≤2KB; country blocking in custom rules works on all plans).
  `CF-IPCountry` (XX=unknown, T1=Tor) is the country-of-record; `CF-Connecting-IP` the
  client IP — both land in Cloud Run request logs via nginx (geo evidence tier).
- **Origin lock**: a Cloudflare **Transform Rule** ("Set static") injects
  `X-Origin-Auth: <high-entropy secret>` on every request; the **existing nginx** verifies
  it and returns 403 if missing/wrong. A bare CF-egress-IP allowlist is insufficient
  (CF IPs are shared across tenants → spoofable). Rotate the secret; inject at runtime like
  the existing Pinata JWT (Secret Manager → Cloud Run env → nginx).
- **Fail-closed**: under allowlist, unknown country (XX) and any edge rule-evaluation
  failure → deny. Occupied regions (Crimea/Donetsk/Luhansk, often mislabeled RU/UA) →
  conservative subdivision-granular treatment as denied.

**Rationale**: Satisfies FR-007/FR-008's "can't be bypassed" property using only existing
components (Cloudflare + nginx + Cloud Run). The verifier confirmed Global-LB frontend
mTLS *is* GA and would be the strongest crypto origin-lock, **but** it requires adding an
external ALB + Certificate Manager — new infra outside the footprint — so it is recorded as
future hardening, not the v1 mechanism.

**Alternatives**: Cloud Armor as the geo gate (sees the CF edge IP, not the user; can't
emit 451); bare IP allowlist (spoofable); global AOP (shared cert, doesn't prove "your
account"); app-code 451 (sees CF IP, wastes origin). Rejected for v1.

Sources: Cloudflare WAF custom-rules (block/allow by country, create-dashboard custom
response 400-499/Pro+), Transform Rules (Set static, 30 headers/rule), HTTP headers
(CF-IPCountry/CF-Connecting-IP), IP-ranges (shared); Cloud Run ingress / serverless NEG /
frontend-mTLS docs (for the documented future-hardening path).

---

## R5. No-backend consent-of-record & evidence (replaces the GCP WORM/BigQuery tier)

**Decision**: Because no backend may be added, the **public chain is the WORM store** for
consent records, and the **existing Cloudflare/Cloud Run request logs** are the geo/IP
evidence tier.

- **Membership purchase/upgrade** records the accepted T&C version hash on-chain + emits an
  event (dated by block timestamp).
- **Wager creation** binds the version via AAD (R3) and is itself an on-chain tx.
- **Key registration** (`KeyRegistry`) dates the deterministic eligibility signature by its
  block timestamp; a light event references the generic Terms.
- **Fail-closed** is intrinsic: a reverted tx grants no consent and leaves no partial
  record (no separate audit write to fail). **Idempotency** is intrinsic: re-submitting
  converges to the same contract state; a dropped tx is reconciled against chain state
  before retry. **Completeness/ordering/immutability** are provided by the chain — no
  hash-chaining layer needed. **Queryability by address** is via the chain + the subgraph.
- **Non-consenting visitors** (geo/sanctions-blocked, declined) leave **no** on-chain
  record; their evidence is the edge request logs (country, IP, timestamp, decision),
  retained per Cloud Logging retention and minimized. On-chain records carry **no** IP/UA
  (privacy); off-chain PII stays only in the edge logs.

**Rationale**: This is the only footprint-preserving way to get tamper-evident, fail-closed,
queryable consent records, and it is arguably stronger than a GCS bucket-lock (public,
independently verifiable). The earlier GCP WORM/BigQuery research (GCS Bucket Lock,
`ifGenerationMatch=0`, Log Router → BigQuery, hash-chaining) is **recorded but not used** —
it assumed a backend, which the constraint forbids; kept here only as the rejected
alternative and as the blueprint **if** a backend is ever permitted.

**Alternatives (rejected under the constraint)**: backend `/api/attest` → GCS Bucket-Lock
WORM + BigQuery (needs a backend); Cloud Logging as the record of record (async/best-effort,
not WORM). Both require new compute.

**Risks**: entry-modal acceptance has no durable server record — accepted; its legal weight
is the downstream on-chain consents + versioned docs (documented in the spec). Address-keyed
querying may need a small subgraph addition for consent/version events.

Sources: `contracts/privacy/KeyRegistry.sol`, `deployments/polygon-chain137-v2.json`,
GCP Bucket-Lock / Log-Router docs (for the rejected backend alternative).

---

## R6. Versioned legal documents (FR-017…FR-030)

**Decision**: Serve Terms, Risk Disclosure, **and Privacy Policy** from the SPA; store each
**version** (not each event) in-repo under `frontend/src/legal/` and pin it to **IPFS/Pinata**;
the version id is the SHA-256 of the canonicalized bytes (R3 canonicalization). A small
`legalDocs.js` exposes the current version + hash, the version manifest (prior versions
retrievable by hash), and the operator-set **materiality flag** (separate from the hash) that
drives re-consent at the next consequential act (FR-030). The displayed "Last updated ·
Version" header is populated with the hash on publish.

**Rationale**: Footprint-preserving (SPA + existing Pinata), independently re-verifiable
(re-hash the served bytes), and the hash is exactly what gets recorded on-chain at each
consent — closing the "which text did they accept" loop without a backend.

**Alternatives**: content-addressed-per-event / on-chain doc anchor (rejected by the user —
too heavy; signature is the anchor); server/WORM hosting (no backend).

Sources: spec clarifications (Q2 no per-event artifact; Q3 wager-bound governance;
materiality flag), existing Pinata/IPFS usage (`Dockerfile`, `cloudbuild.yaml`).
