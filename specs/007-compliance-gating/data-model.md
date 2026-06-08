# Data Model: Compliance & Legal Gating Layer

Data lives across three tiers (no database): **on-chain** (Polygon — records of record),
**client/IPFS** (documents, encrypted wager metadata, client gate state), and **edge logs**
(Cloudflare/Cloud Run request logs — geo evidence). No backend store.

---

## On-chain

### SanctionsGuard (new contract — `contracts/access/SanctionsGuard.sol`)
| Field / item | Type | Notes |
|---|---|---|
| `sanctionsOracle` | `IChainalysisSanctionsOracle` | injectable; `address(0)` where no oracle (Amoy) → guard relies on deny-list only |
| `_denied[address]` | `mapping(address=>bool)` | discretionary deny-list (FR-020); O(1) read |
| `SANCTIONS_ADMIN_ROLE` | `bytes32` | deny-list mutation role (floppy-keystore admin) |
| `DEFAULT_ADMIN_ROLE` | `bytes32` | oracle-config role |
| **Views** | `isAllowed(address)→bool`, `checkBlocked(address)` | fail-closed: oracle revert/empty-return ⇒ not allowed |
| **Events** | `DenyListUpdated(account, denied, actor, reason)`, `SanctionsOracleUpdated(oracle)` | the deny-list admin audit trail (FR-020/SC-018) |

**Validation/rules**: reject `address(0)`; deny-list short-circuits before the oracle call;
guard never writes on the hot path (read-only during Checks). Network-scoped (per `chainId`).

### WagerRegistry (modified)
| Item | Change |
|---|---|
| `sanctionsGuard` + `setSanctionsGuard` | new injectable ref (DEFAULT_ADMIN_ROLE) |
| `createWager` | first Check: `sanctionsGuard.checkBlocked(msg.sender)`; **store** the bound `termsVersionHash` (bytes32) with the wager + emit it |
| `acceptWager` | Checks: `checkBlocked(msg.sender)` **and** `checkBlocked(w.creator)` (counterparty) |
| `Wager` struct | add `bytes32 termsVersionHash` (governing T&C version at creation — FR-056) |
| events | `WagerCreated` extended with `termsVersionHash` (address-keyed query of governing terms) |
| exit paths | `claimRefund`/`claimPayout`/`batchExpireOpen` **stay ungated** (recover own funds) |

### MembershipManager (modified)
| Item | Change |
|---|---|
| `sanctionsGuard` + `setSanctionsGuard` | new injectable ref (DEFAULT_ADMIN_ROLE) |
| `purchaseTier` / `upgradeTier` | first Check: `sanctionsGuard.checkBlocked(msg.sender)`; record accepted `termsVersionHash` |
| `Membership` record | add `bytes32 acceptedTermsHash` + `uint64 acceptedAt` (block ts) |
| events | `MembershipPurchased`/`Upgraded` extended with `acceptedTermsHash` (FR-039/FR-045) |

### KeyRegistry (light modification)
| Item | Change |
|---|---|
| registration event | add an `EligibilityAcknowledged(address, bytes32 termsRef)` event so the on-chain key registration dates the eligibility signature (FR-043) without a date in the signed payload |

---

## Client / IPFS

### Legal Document Version (`frontend/src/legal/` + IPFS pin)
| Field | Type | Notes |
|---|---|---|
| `docType` | enum | `terms` \| `risk` \| `privacy` |
| `content` | canonical text (NFC, LF, UTF-8, trimmed) | the bytes that are hashed |
| `versionHash` | `sha256(content)` hex | the version id; recorded on-chain at consent; shown in "Last updated · Version" |
| `material` | bool (operator-set) | re-consent trigger (FR-030), **independent** of the hash |
| `ipfsCid` | string | per-version pin (not per-event) |
| `supersededBy` | versionHash? | prior versions remain retrievable by hash |

### Encrypted Wager Metadata v1.1 (`schemas/encrypted-metadata-v1.1.json`)
Adds an authenticated `termsVersion` to the existing envelope (optional on read):
| Field | Type | Notes |
|---|---|---|
| `version` | enum (+`"1.1"`) | schema version |
| `algorithm` | enum | `x25519-chacha20poly1305` / `xwing-chacha20poly1305` |
| `content` | `{ nonce, ciphertext }` | sealed with `aad = "FairWins-TC|"+schemaVersion+"|"+termsVersion.hash` |
| `keys[]` | per-recipient DEK wraps | unchanged (no AAD) |
| `termsVersion` | `{ id, hash }` | **NEW**, optional; absence ⇒ legacy (no AAD), governed by launch version (FR-057) |

**Rule**: tampering with `termsVersion.hash` breaks AEAD auth on decrypt (tamper-evident,
FR-056). `termsVersion` never enters key derivation (FR-041).

### Client gate state (localStorage)
| Field | Notes |
|---|---|
| `acknowledgedVersions` | `{terms, risk}` hashes acknowledged at the entry gate (FR-031); drives the entry-skip only — **not** a binding consent (binding consent is on-chain) |
| `membershipAttestationTicks` | the discrete checkbox selections captured at purchase confirmation (reflected in the on-chain tx) |

---

## Edge logs (Cloudflare / Cloud Run request logs — existing)

### Edge Enforcement Log Entry (no new store; existing Cloud Logging)
| Field | Source | Notes |
|---|---|---|
| `country` | `CF-IPCountry` | country-of-record (XX=unknown, T1=Tor) |
| `ip` | `CF-Connecting-IP` | client IP |
| `timestamp`, `decision` | edge/nginx | allow / 451-geo-block; geo evidence tier (FR-009/FR-051) |
| retention | Cloud Logging retention window | minimized fields; Privacy Policy discloses (FR-051/FR-052) |

---

## Restricted-Jurisdiction Configuration (Cloudflare WAF + nginx, not a DB)
| Bucket | Where | Notes |
|---|---|---|
| comprehensively-sanctioned (locked) | Cloudflare WAF rule | Cuba/Iran/NK/Syria + Crimea/Donetsk/Luhansk; never removable w/o logged change (FR-003) |
| United States | Cloudflare WAF rule | posture decision (FR-004) |
| tunable prohibited | Cloudflare WAF rule | gambling/PM bans (FR-005), operator-editable |
| posture | Cloudflare WAF rule | allowlist (default) / denylist (FR-002) |

---

## Relationships (text)

`SanctionsGuard` ←consulted by→ `WagerRegistry` & `MembershipManager` (and read advisory by
the frontend). `Legal Document Version.versionHash` →recorded in→ `Membership.acceptedTermsHash`
and `Wager.termsVersionHash` and →bound into→ Encrypted Wager Metadata `termsVersion`/AAD.
`KeyRegistry` event dates the `Key-Generation Signature`. Edge log entries are correlated to
on-chain consents by time + (where present) wallet address — never merged on-chain (privacy).
