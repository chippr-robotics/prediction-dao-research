# Phase 0 Research: Oracle & Graph Network Gating

All Technical Context items are known (frontend-only, existing stack). The open
questions are design choices about *where the gating signals come from* and *how to
reuse existing patterns* rather than unknown technologies. Each decision below is
grounded in the current codebase.

## R1 — Source of truth for "network has oracle support"

**Decision**: Add a single pure resolver `hasOracleSupport(chainId)` in
`frontend/src/lib/network/oracleSupport.js` that returns `true` when at least one
oracle resolution type is usable on the chain, using the *same* rule the
create-wager modal already applies:

```
hasOracleSupport(chainId) =
     (polymarketSidebets capability is true on chainId)            // Polymarket CTF reachable
  || isDeployed(getContractAddressForChain('chainlinkDataFeedAdapter', chainId))
  || isDeployed(getContractAddressForChain('chainlinkFunctionsAdapter', chainId))
  || isDeployed(getContractAddressForChain('umaAdapter', chainId))
```

The modal's `anyOracleEnabled` (FriendMarketsModal.jsx:290) will be refactored to
call this resolver so the dashboard button gate and the modal's locked-tab logic
cannot diverge. The resolver does NOT account for the `VITE_ORACLE_MODELS` *display*
filter (`isOracleModelExposed`) — that hides individual oracle *types* from the
picker but does not change whether the network can settle by oracle at all; the
button should reflect network capability, and the modal keeps applying the display
filter to individual tabs.

**Rationale**: The modal already encodes the correct "can this chain settle by
oracle" rule via per-adapter address checks plus the `polymarketSidebets`
capability (FriendMarketsModal.jsx:193-222, 258-290). Reusing it as one exported
function satisfies FR-001/FR-002 and the constitution's "honest state" principle
(config-driven, no hardcoding) while eliminating drift. Polymarket is gated on the
`polymarketSidebets` capability rather than the `polymarketAdapter` address because
that is how the modal itself decides Polymarket availability.

**Alternatives considered**:
- *Use `networkCapabilities.js` `polymarketOracle`/`chainlinkOracle`/`umaOracle`
  descriptors directly*: those check adapter addresses but key Polymarket off the
  `polymarketAdapter` address, which diverges from the modal's `polymarketSidebets`
  rule — risking a button that's enabled while the modal shows no usable Polymarket
  tab (or vice-versa). Rejected to keep one rule. (The descriptors stay as-is for
  the Network tab's informational tags.)
- *Inline the check in `Dashboard.jsx`*: duplicates logic already in the modal;
  rejected (drift risk, harder to test).

## R2 — Meaning of "network configured to the graph" at runtime

**Decision**: Add `frontend/src/config/subgraph.js` exporting
`getSubgraphUrl(chainId)` and `isGraphConfigured(chainId)`. `getSubgraphUrl`
resolves a per-chain subgraph endpoint from env, with the existing single
`VITE_SUBGRAPH_URL` retained as the endpoint for the build's active chain
(`VITE_NETWORK_ID`) for backward compatibility:

```
getSubgraphUrl(chainId) =
     import.meta.env[`VITE_SUBGRAPH_URL_${chainId}`]                 // per-chain override
  || (chainId === ACTIVE_CHAIN_ID ? import.meta.env.VITE_SUBGRAPH_URL : '')   // back-compat
  || ''                                                              // unset → un-indexed
isGraphConfigured(chainId) = Boolean(getSubgraphUrl(chainId))
```

`reportDataSource.js`, `useSiteStats.js`, `drawProposalScan.js`, and
`SubgraphSource.js` currently read `import.meta.env.VITE_SUBGRAPH_URL` directly.
Their existing single-URL behavior is preserved (it maps to the active chain), and
they MAY be migrated to `getSubgraphUrl(chainId)` where a chainId is in scope;
migrating them is optional cleanup, not required for this feature.

**Rationale**: `VITE_SUBGRAPH_URL` is a single build-time value, but the app
switches chains at runtime (137↔80002 via wagmi). `.env.example` already documents
"one subgraph per network" with distinct Studio URLs per chain and explicitly says
Mordor (63) should be left unset to use the RPC fallback. A per-chain resolver makes
"configured to the graph" a meaningful *runtime* predicate (FR-006), keeps data
network-scoped (constitution III), and is backward compatible with existing single
-URL deployments.

**Alternatives considered**:
- *Treat `Boolean(VITE_SUBGRAPH_URL)` alone as "configured"*: wrong after a runtime
  switch to a chain the subgraph does not index — it would query one chain's index
  while the wallet is on another, leaking cross-network data. Rejected (violates
  constitution III).
- *Probe the subgraph for the chain's indexed network*: adds a network round-trip
  to a render-time gate and conflates "not configured" with "temporarily
  unreachable" (FR-015). Rejected.

## R3 — Distinguishing "not configured" from "temporarily unavailable"

**Decision**: Configuration gating is decided synchronously by
`isGraphConfigured(chainId)` (no network call) → drives the *disabled* state and the
"requires indexing" copy (FR-007/FR-008). A *runtime* failure when a subgraph IS
configured (HTTP/GraphQL error, unreachable) remains an *error/stale* state surfaced
by the existing data-layer error handling (e.g. `useAccountStats` freshness =
`stale`, `useSiteStats` `isLive=false`), never the disabled state (FR-015).

**Rationale**: The two conditions need different UX: one is permanent-for-this
-network (offer basic stats / hide advanced), the other is transient (retain
last-known, mark stale, allow retry). Keeping the config predicate pure and
synchronous keeps them cleanly separated.

## R4 — Basic-stats source on un-indexed networks

**Decision**: Reuse the established subgraph→RPC fallback already proven in
`useSiteStats.js`: when `isGraphConfigured(chainId)` is false, read bounded basic
stats directly from chain via the WagerRegistry contract (`nextWagerId()` for total
wager count, address resolved by `getContractAddressForChain('wagerRegistry',
chainId)`), cached per chain for 60s. Account-level basic stats (e.g. the member's
own wager count/active count) are derived from the already-RPC-backed
`WagerRepository`/`EventsSource` path that `SubgraphSource` falls back to when no
subgraph is set. The basic-stats contract is documented in
`contracts/basic-stats-source.md`.

**Rationale**: `useSiteStats` already implements exactly this graceful degradation
(subgraph primary, `fetchFromRpc` fallback, per-chain cache, honest zeros) and is
constitution-compliant (real reads, no padding). Extending the *account* stats view
to use the same fallback — instead of today's hard "Network not supported" empty
state in `useAccountStats` (useAccountStats.js:142-144 / AccountDashboard.jsx:50-54)
— is the smallest change that satisfies FR-010 without unbounded scans (FR-016).

**Alternatives considered**:
- *Scan event logs from the deployment block for account stats*: not viable on
  public RPCs (the `reportDataSource` header documents request floods / rate limits
  for genesis scans). Rejected (FR-016). Bounded counters + the existing bounded
  enumerate/scan path are the safe subset.
- *Show nothing (keep "Network not supported")*: contradicts the explicit request
  ("will need to poll rpc directly to get stats"). Rejected.

## R5 — Which surfaces are "reporting and advanced metrics"

**Decision**: Treat as subgraph-dependent (gate on `isGraphConfigured`):
- **Tax/activity reports** — `TaxReportsPanel.jsx` (enumeration requires the index;
  `reportDataSource.enumerateWagers` throws without a subgraph).
- **Advanced account metrics** — the history-dependent sections of
  `AccountDashboard.jsx` rendered from `useAccountStats`: the P&L chart
  (`PnlChart`), activity breakdowns (`ActivityBreakdowns`), and the full valued
  recent-activity feed (`RecentActivityFeed`), which depend on enumerated
  `WagerTransfers` from the index.

Treat as basic (available via RPC on un-indexed networks): total/active wager
counts and wallet balances (summary tiles), labeled as basic.

**Rationale**: These are exactly the views whose data originates from subgraph
enumeration today. Summary counts and balances are derivable from bounded RPC reads,
so they remain available as the "basic stats" tier (FR-010/FR-011).

## R6 — Accessibility of the disabled oracle tile

**Decision**: Extend `QuickActionCard` to accept `disabled` + `lockedReason`. When
disabled, render a real disabled `<button>` (so it is not activatable — FR-005),
expose the reason via `aria-describedby`/`title` and a visible locked affordance, and
keep the accessible name describing the action plus its unavailability (FR-003).
Mirrors the existing locked-tab pattern in `FriendMarketsModal`.

**Rationale**: Satisfies FR-003/FR-005 and constitution V (WCAG 2.1 AA, axe passes)
using the project's existing locked-affordance vocabulary.

## Resolved unknowns

No `NEEDS CLARIFICATION` markers remained from the spec. The one spec-flagged
follow-up (precise "basic stats" list) is resolved in R4/R5: total wager count,
active wager count, and wallet balances form the basic tier; P&L, breakdowns, and
the valued activity feed are the advanced (indexed) tier.
