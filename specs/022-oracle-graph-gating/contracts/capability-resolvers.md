# Contract: Per-Chain Capability Resolvers

Internal module contracts (the "interfaces" this frontend feature exposes to its own
consumers). Both resolvers are **pure and synchronous** — no network calls — so they
are safe to call during render and trivial to unit test.

## `hasOracleSupport(chainId): boolean`

**Module**: `frontend/src/lib/network/oracleSupport.js`

**Purpose**: Single source of truth for "this network can settle a wager by oracle"
(FR-001). Consumed by the dashboard oracle quick-action gate and by
`FriendMarketsModal` (replacing its inline `anyOracleEnabled`).

**Signature**
```js
export function hasOracleSupport(chainId: number): boolean
```

**Behavior**
- Returns `true` when ANY of the following holds for `chainId`:
  - `getNetwork(chainId)?.capabilities?.polymarketSidebets === true`
  - `getContractAddressForChain('chainlinkDataFeedAdapter', chainId)` is a valid address
  - `getContractAddressForChain('chainlinkFunctionsAdapter', chainId)` is a valid address
  - `getContractAddressForChain('umaAdapter', chainId)` is a valid address
- Returns `false` for unknown/undefined `chainId` or when none of the above hold.
- Address validity uses the existing `0x` + 40 hex check (mirror
  `networkCapabilities.js` `isDeployed`).
- MUST NOT apply the `VITE_ORACLE_MODELS` display filter (that gates individual tabs
  in the picker, not network capability — R1).

**Consumers**
- `Dashboard.jsx` → `create-1v1-oracle` tile `disabled = !hasOracleSupport(chainId)`.
- `FriendMarketsModal.jsx` → `anyOracleEnabled = hasOracleSupport(chainId)` (the
  per-type `oracleAvailability`/locked-tab map stays for individual tab reasons).

**Test expectations** (Vitest)
- Polygon mainnet (137) and Amoy (80002) → `true` (adapters configured).
- Mordor (63) → `false` (core-only, no adapters, `polymarketSidebets:false`).
- A chain with only `umaAdapter` set → `true`.
- Unknown chainId / `undefined` → `false`.
- Result equals `FriendMarketsModal`'s computed `anyOracleEnabled` for the same chain
  (no drift).

## `isGraphConfigured(chainId): boolean` and `getSubgraphUrl(chainId): string`

**Module**: `frontend/src/config/subgraph.js`

**Purpose**: Make "configured to the graph" a meaningful per-chain runtime predicate
(FR-006), backward compatible with the single build-time `VITE_SUBGRAPH_URL`.

**Signatures**
```js
export function getSubgraphUrl(chainId: number): string   // '' when none
export function isGraphConfigured(chainId: number): boolean
```

**Behavior**
- `getSubgraphUrl(chainId)` resolves, in order:
  1. `import.meta.env['VITE_SUBGRAPH_URL_' + chainId]` (per-chain override), else
  2. `import.meta.env.VITE_SUBGRAPH_URL` IF `chainId === ACTIVE_CHAIN_ID`
     (`VITE_NETWORK_ID`) — back-compat for existing single-URL builds, else
  3. `''`.
- `isGraphConfigured(chainId) = Boolean(getSubgraphUrl(chainId))`.
- Pure/synchronous — no fetch. A configured-but-unreachable endpoint is a *runtime*
  error handled by the data layer, NOT a `false` here (FR-015, R3).

**Consumers**
- `TaxReportsPanel.jsx` → gate report generation; show "requires indexing" when
  `false` (FR-007/FR-008/FR-009).
- `useAccountStats` / `AccountDashboard.jsx` → choose `StatsMode` advanced vs basic
  (FR-007/FR-010/FR-012).
- (Optional cleanup) `reportDataSource.js`, `useSiteStats.js`, `SubgraphSource.js`,
  `drawProposalScan.js` may migrate their direct `VITE_SUBGRAPH_URL` reads to
  `getSubgraphUrl(chainId)`; existing single-URL behavior is preserved either way.

**Test expectations** (Vitest, `vi.stubEnv`)
- `VITE_SUBGRAPH_URL_80002` set → `isGraphConfigured(80002) === true`,
  `isGraphConfigured(137)` depends only on its own resolution.
- Only `VITE_SUBGRAPH_URL` set + `VITE_NETWORK_ID=137` → `isGraphConfigured(137) ===
  true`, `isGraphConfigured(63) === false`.
- Nothing set → all chains `false`.
- Per-chain override takes precedence over the back-compat single URL.
