# Phase 1 Data Model: Oracle & Graph Network Gating

This feature introduces no persisted storage and no new on-chain or subgraph
entities. It defines a small set of **derived, in-memory view models** computed per
active chain. All are pure functions of existing config + chain/subgraph reads.

## Entities (derived view models)

### NetworkCapabilityProfile

Per-chain capability snapshot consumed by the gated surfaces. Computed synchronously
from config (no network calls).

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `chainId` | number | wagmi active chain / `getCurrentChainId()` | Active network. |
| `hasOracleSupport` | boolean | `hasOracleSupport(chainId)` (R1) | True if ≥1 oracle resolution type usable. |
| `isGraphConfigured` | boolean | `isGraphConfigured(chainId)` (R2) | True if a subgraph endpoint resolves for the chain. |

**Validation / rules**:
- Both booleans MUST be derived only from the *active* chain; switching chains
  recomputes them (FR-004, FR-012).
- `hasOracleSupport` MUST equal the modal's `anyOracleEnabled` for the same chain
  (single shared resolver — R1).
- `isGraphConfigured` is config-only and MUST NOT perform a network request (R3).

### OracleAvailability (existing, reused)

Already computed in `FriendMarketsModal` as `oracleAvailability` + `anyOracleEnabled`
(per-type `{ enabled, lockedReason }`). This feature does not change its shape; it
extracts the "any enabled" reduction into the shared `hasOracleSupport` resolver and
has the modal consume it.

### QuickActionDescriptor (extended)

The dashboard quick-action tile descriptor gains optional gating fields.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Existing (e.g. `create-1v1-oracle`). |
| `disabled` | boolean | NEW. `create-1v1-oracle` ⇒ `!hasOracleSupport(chainId)`. |
| `lockedReason` | string \| null | NEW. Shown when `disabled` (FR-003). |

**State transition**: `disabled` flips on active-chain change (no reload — FR-004).
A disabled tile MUST NOT dispatch its action (FR-005).

### StatsMode

Drives whether the stats view renders advanced (indexed) or basic (RPC) metrics.

| Value | When | Behavior |
|-------|------|----------|
| `advanced` | `isGraphConfigured(chainId)` true | Full reporting + advanced metrics (current behavior). |
| `basic` | `isGraphConfigured(chainId)` false | Basic stats from RPC, labeled basic; advanced sections show "requires indexing" (FR-008/FR-010/FR-011). |

**Rules**:
- Mode is recomputed on active-chain change (FR-012).
- In `basic` mode, the UI MUST visually distinguish basic from advanced (FR-011) and
  MUST NOT present partial data as final (FR-013).

### BasicStats

The bounded basic-stats tier surfaced in `basic` mode (see
`contracts/basic-stats-source.md`).

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `totalWagers` | number | `WagerRegistry.nextWagerId() - 1` | Bounded single call (FR-016). |
| `activeWagers` | number | RPC-backed repository fallback | Member's active count where derivable. |
| `walletBalances` | row[] | wallet context + stablecoin `balanceOf` | Already RPC-sourced today. |
| `lastUpdated` | number\|null | clock at successful read | Honest freshness (FR-013). |
| `source` | `'rpc'` | constant in basic mode | Labels the tier (FR-011). |

**Rules**:
- All values scoped to the active chain and cached per chain (no cross-network
  leakage — constitution III; mirrors `useSiteStats` cache).
- Read failure → honest empty/last-known + non-blocking message, never a hang or raw
  error (FR-013, SC-003).

## Relationships

```
active chainId ──► NetworkCapabilityProfile { hasOracleSupport, isGraphConfigured }
                          │                                │
                          ▼                                ▼
        QuickActionDescriptor.disabled            StatsMode (advanced | basic)
        (create-1v1-oracle)                         │
                                                    ├─ advanced ─► existing reports + advanced metrics
                                                    └─ basic    ─► BasicStats (RPC) + "requires indexing" notes
```

No migrations. No schema changes. No new ABIs.
