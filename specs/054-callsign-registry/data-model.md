# Data Model: Callsign Naming Registry (spec 054)

## On-chain state (`CallsignRegistry`, UUPS proxy)

Storage is append-only with a trailing `__gap` (constitution / specs 025+027 rule).
`SignerIntentBase` contributes ERC-7201 namespaced nonce storage (no sequential slots).

### CallsignRecord

Keyed by `callsignHash = keccak256(bytes(canonicalCallsign))`.

| Field | Type | Meaning |
|---|---|---|
| `owner` | `address` | Bound account = resolution target (single binding, research R4). `address(0)` = never registered or fully released. |
| `callsign` | `string` | Canonical form (3–20 chars, `a-z0-9` + interior single hyphens). Stored once for reverse display. |
| `registeredAt` | `uint64` | Registration timestamp (current owner). |
| `pendingOwner` | `address` | Repoint target; `address(0)` when no repoint pending. |
| `repointEffectiveAt` | `uint64` | When a pending repoint may be finalized (request time + `repointDelay`). |
| `suspended` | `bool` | Moderator suspension (stops resolution/display; ownership untouched). |
| `verified` | `bool` | Business/notable verification marker. |

### Registry-level mappings & params

| Name | Type | Meaning |
|---|---|---|
| `records` | `mapping(bytes32 => CallsignRecord)` | Callsign records by hash. |
| `callsignHashOf` | `mapping(address => bytes32)` | Reverse index; `0x0` = no callsign. Invariant: `records[callsignHashOf[a]].owner == a` (FR-008 forward/reverse integrity). |
| `quarantinedUntil` | `mapping(bytes32 => uint64)` | Callsign unregistrable and non-resolving until this time (set on release/change/lapse-reclaim). |
| `reserved` | `mapping(bytes32 => bool)` | Curator-maintained reserved terms (FR-004). |
| `commitments` | `mapping(bytes32 => uint64)` | Commit–reveal: commitment hash → commit time (research R3). |
| `lastChangeAt` | `mapping(address => uint64)` | Change-cooldown anchor per account (FR-020). |
| `membershipRole` | `bytes32` | The membership role whose active tier is checked for eligibility; default `WAGER_PARTICIPANT_ROLE` — the only user-purchasable role (research R5). Admin-settable. |
| `minTier` | `IMembershipManager.Tier` (uint8) | Minimum eligible tier for register/change; default `Gold` (3), admin-settable but hard-bounded so it can never drop below `Gold` (research R5/R10). |
| params | `uint64` each | `minCommitmentAge` (60 s), `maxCommitmentAge` (24 h), `quarantinePeriod` (90 d), `changeCooldown` (30 d), `repointDelay` (48 h), `lapseGrace` (365 d) — admin-settable within hard bounds (research R10). |

### Roles (AccessControl, least privilege — none can reassign a callsign)

| Role | Powers |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Param tuning (bounded), membership role + `minTier` (bounded ≥ Gold), role admin. |
| `UPGRADER_ROLE` | UUPS upgrades (from `UUPSManaged`). |
| `REGISTRY_CURATOR_ROLE` | Reserved-term list add/remove. |
| `MODERATOR_ROLE` | Suspend / unsuspend callsigns. |
| `VERIFIER_ROLE` | Set / clear verification marker. |

## Resolution status (view-level, computed — never stale)

`resolve(callsign)` and `statusOf(callsignHash)` derive status from record + clock:

| Status | Condition | Value-bearing use |
|---|---|---|
| `NONE` | No record, or released and quarantine expired | ✗ ("no such callsign", FR-010) |
| `ACTIVE` | Owner set, not suspended, no pending repoint, within Gold-membership grace | ✓ (resolves to `owner`) |
| `REPOINTING` | `pendingOwner != 0` and `now < repointEffectiveAt`… and until finalized | ✗ ("address changing", FR-022) |
| `QUARANTINED` | `now < quarantinedUntil[callsignHash]` | ✗ ("callsign no longer active", FR-019) |
| `SUSPENDED` | `suspended == true` | ✗ (FR-026) |
| `LAPSED_RECLAIMABLE` | `getActiveTier(owner, membershipRole) < minTier` AND `now > max(membership.expiresAt, registeredAt) + lapseGrace`, not yet reclaimed. (Observable state only. The grace anchor is `max(expiresAt, registeredAt)`: an active-but-downgraded membership is honored until its `expiresAt`, then grace runs; the ownership `registeredAt` anchor covers the fresh-owner case where per-address membership has `expiresAt == 0`. Because `finalizeRepoint` requires the incoming owner to be Gold-eligible and re-stamps `registeredAt`, this cannot be abused to hoard a name across wallets without a real Gold membership — research R5, FR-021.) | ✗ for new value-bearing use; `reclaimLapsed` callable by anyone (FR-021) |

## State transitions

```
(unregistered) --commit + register--> ACTIVE
ACTIVE --requestRepoint--> REPOINTING --finalizeRepoint (after delay, new owner must be Gold; clears verified)--> ACTIVE (new owner addr)
                             |--cancelRepoint (owner)--> ACTIVE (unchanged)
ACTIVE --release / change--> QUARANTINED --(quarantinePeriod elapses)--> (unregistered)
ACTIVE --(membership lapse + grace elapses)--> LAPSED_RECLAIMABLE --reclaimLapsed--> QUARANTINED
ACTIVE --suspend (moderator)--> SUSPENDED --unsuspend--> ACTIVE
```

Guards: register requires — valid canonical callsign, not reserved, not registered, not
quarantined, caller has no callsign, active **Gold-tier-or-above** membership
(`getActiveTier(caller, membershipRole) >= minTier`), sanctions-clear, valid aged
commitment. `change` = release(old, quarantine) + register(new) under one cooldown check
(same tier guard). Repoint of a held callsign skips the tier guard (FR-022).
Every transition emits a dedicated event (`CallsignRegistered`, `CallsignReleased`, `CallsignRepointRequested`,
`CallsignRepointCancelled`, `CallsignRepointFinalized`, `CallsignReclaimed`, `CallsignSuspended`, `CallsignUnsuspended`,
`CallsignVerificationSet`, `CallsignReserved`) — the FR-023 audit trail.

## Client-side model (`frontend/src/lib/callsigns/`)

| Item | Shape | Notes |
|---|---|---|
| `normalizeCallsign(input)` | `string` | Trim, strip leading `%`, lowercase; throws on invalid chars/length (mirror of on-chain rules — single source list shared with tests). |
| `formatCallsign(callsign)` | `%<callsign>` | Display convention (FR-015). |
| Forward resolution result | `{ address, status, verified, callsign }` | From `resolve`; consumers refuse non-`ACTIVE` for value-bearing actions (FR-011/FR-022). |
| Reverse result (`useCallsign`) | `{ callsign, verified } \| null` | Short-TTL cached; errors → `null` so the display chain falls through (FR-013). |

Display-name priority (extends spec 040 `useOpponentName`):
`addressBook > callsign > ens > generated`. Address book entries continue to store
addresses, never callsigns (spec assumption — capture-safety).
