# Data Model: Wager Tag Naming Registry (spec 054)

## On-chain state (`WagerTagRegistry`, UUPS proxy)

Storage is append-only with a trailing `__gap` (constitution / specs 025+027 rule).
`SignerIntentBase` contributes ERC-7201 namespaced nonce storage (no sequential slots).

### TagRecord

Keyed by `tagHash = keccak256(bytes(canonicalTag))`.

| Field | Type | Meaning |
|---|---|---|
| `owner` | `address` | Bound account = resolution target (single binding, research R4). `address(0)` = never registered or fully released. |
| `tag` | `string` | Canonical form (3–20 chars, `a-z0-9` + interior single hyphens). Stored once for reverse display. |
| `registeredAt` | `uint64` | Registration timestamp (current owner). |
| `pendingOwner` | `address` | Repoint target; `address(0)` when no repoint pending. |
| `repointEffectiveAt` | `uint64` | When a pending repoint may be finalized (request time + `repointDelay`). |
| `suspended` | `bool` | Moderator suspension (stops resolution/display; ownership untouched). |
| `verified` | `bool` | Business/notable verification marker. |

### Registry-level mappings & params

| Name | Type | Meaning |
|---|---|---|
| `records` | `mapping(bytes32 => TagRecord)` | Tag records by hash. |
| `tagHashOf` | `mapping(address => bytes32)` | Reverse index; `0x0` = no tag. Invariant: `records[tagHashOf[a]].owner == a` (FR-008 forward/reverse integrity). |
| `quarantinedUntil` | `mapping(bytes32 => uint64)` | Tag unregistrable and non-resolving until this time (set on release/change/lapse-reclaim). |
| `reserved` | `mapping(bytes32 => bool)` | Curator-maintained reserved terms (FR-004). |
| `commitments` | `mapping(bytes32 => uint64)` | Commit–reveal: commitment hash → commit time (research R3). |
| `lastChangeAt` | `mapping(address => uint64)` | Change-cooldown anchor per account (FR-020). |
| `qualifyingRoles` | `bytes32[]` | Membership roles that satisfy the active-membership gate (research R5). |
| params | `uint64` each | `minCommitmentAge` (60 s), `maxCommitmentAge` (24 h), `quarantinePeriod` (90 d), `changeCooldown` (30 d), `repointDelay` (48 h), `lapseGrace` (365 d) — admin-settable within hard bounds (research R10). |

### Roles (AccessControl, least privilege — none can reassign a tag)

| Role | Powers |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Param tuning (bounded), qualifying-role set, role admin. |
| `UPGRADER_ROLE` | UUPS upgrades (from `UUPSManaged`). |
| `REGISTRY_CURATOR_ROLE` | Reserved-term list add/remove. |
| `MODERATOR_ROLE` | Suspend / unsuspend tags. |
| `VERIFIER_ROLE` | Set / clear verification marker. |

## Resolution status (view-level, computed — never stale)

`resolve(tag)` and `statusOf(tagHash)` derive status from record + clock:

| Status | Condition | Value-bearing use |
|---|---|---|
| `NONE` | No record, or released and quarantine expired | ✗ ("no such tag", FR-010) |
| `ACTIVE` | Owner set, not suspended, no pending repoint, within membership grace | ✓ (resolves to `owner`) |
| `REPOINTING` | `pendingOwner != 0` and `now < repointEffectiveAt`… and until finalized | ✗ ("address changing", FR-022) |
| `QUARANTINED` | `now < quarantinedUntil[tagHash]` | ✗ ("tag no longer active", FR-019) |
| `SUSPENDED` | `suspended == true` | ✗ (FR-026) |
| `LAPSED_RECLAIMABLE` | Membership `expiresAt + lapseGrace < now`, not yet reclaimed | ✗ for new value-bearing use; `reclaimLapsed` callable by anyone (FR-021) |

## State transitions

```
(unregistered) --commit + register--> ACTIVE
ACTIVE --requestRepoint--> REPOINTING --finalizeRepoint (after delay)--> ACTIVE (new owner addr)
                             |--cancelRepoint (owner)--> ACTIVE (unchanged)
ACTIVE --release / change--> QUARANTINED --(quarantinePeriod elapses)--> (unregistered)
ACTIVE --(membership lapse + grace elapses)--> LAPSED_RECLAIMABLE --reclaimLapsed--> QUARANTINED
ACTIVE --suspend (moderator)--> SUSPENDED --unsuspend--> ACTIVE
```

Guards: register requires — valid canonical tag, not reserved, not registered, not
quarantined, caller has no tag, active qualifying membership, sanctions-clear, valid aged
commitment. `change` = release(old, quarantine) + register(new) under one cooldown check.
Every transition emits a dedicated event (`TagRegistered`, `TagReleased`, `TagRepointRequested`,
`TagRepointCancelled`, `TagRepointFinalized`, `TagReclaimed`, `TagSuspended`, `TagUnsuspended`,
`TagVerificationSet`, `TagReserved`) — the FR-023 audit trail.

## Client-side model (`frontend/src/lib/tags/`)

| Item | Shape | Notes |
|---|---|---|
| `normalizeTag(input)` | `string` | Trim, strip leading `%`, lowercase; throws on invalid chars/length (mirror of on-chain rules — single source list shared with tests). |
| `formatTag(tag)` | `%<tag>` | Display convention (FR-015). |
| Forward resolution result | `{ address, status, verified, tag }` | From `resolve`; consumers refuse non-`ACTIVE` for value-bearing actions (FR-011/FR-022). |
| Reverse result (`useWagerTag`) | `{ tag, verified } \| null` | Short-TTL cached; errors → `null` so the display chain falls through (FR-013). |

Display-name priority (extends spec 040 `useOpponentName`):
`addressBook > wagerTag > ens > generated`. Address book entries continue to store
addresses, never tags (spec assumption — capture-safety).
