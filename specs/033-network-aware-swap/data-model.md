# Phase 1 Data Model: Network-Aware Swap Provider

This feature adds **configuration shapes**, not persisted data. The "entities" are the in-memory
config objects in `frontend/src/config/networks.js` and the context value exposed by `DexContext`.
No database, no migration, no on-chain state change.

---

## Entity: DexProvider (new)

A network-level descriptor of the DEX provider the swap routes through and presents.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | User-facing provider name. Allowed values today: `"ETCswap"`, `"Uniswap"`. |
| `url` | string (URL) | yes | Canonical provider web-app URL for the "open DEX" link. |

**Placement**: declared at the **network level** (sibling of `dex`, not nested under it), so it is
available even when `dex === null` (unconfigured DEX). See research R5.

**Validation rules**:
- `name` MUST be non-empty and MUST match the provider that actually applies to the network
  (FR-001/FR-002): ETC-family → `"ETCswap"`; all others → `"Uniswap"`.
- `url` MUST be an absolute `https://` URL.
- A network MAY omit `dexProvider` (→ `null`) only when it never offers swaps (e.g. Hardhat `1337`).

**Mapping rule (FR-001)** — encoded by per-network declaration, documented in a comment:
- `61` (ETC mainnet) → ETCswap
- `63` (Mordor) → ETCswap
- `137` (Polygon) → Uniswap
- `80002` (Amoy) → Uniswap
- `1337` (Hardhat) → none

---

## Entity: Network DEX Binding (existing `networks.js` entry — extended)

Each `NETWORKS[chainId]` object already binds a chain to its DEX deployment, stablecoin, wrapped
native, explorer, and capabilities. This feature **adds** `dexProvider` and adds a full entry for
chain `61`.

Fields relevant to this feature (others unchanged):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `chainId` | number | yes | e.g. `61`. |
| `name` | string | yes | e.g. `"Ethereum Classic"`. |
| `isTestnet` | boolean | yes | `61` → `false`. |
| `selectable` | boolean | yes | `61` → `true` (surfaces in Network-tab selector). |
| `nativeCurrency` | `{ decimals, name, symbol }` | yes | `61` → `{ 18, "Ethereum Classic", "ETC" }`. |
| `rpcUrl` | string | yes | `61` → `VITE_RPC_URL_ETC \|\| "https://etc.rivet.link"`. |
| `explorer` | `{ name, baseUrl }` | yes | `61` → `{ "Blockscout", "https://etc.blockscout.com" }`. |
| `subgraphUrl` | string\|null | yes | `61` → `null` (no ETC indexer). |
| `stablecoin` | `{ address, symbol, name, decimals }` | yes | `61` → USC `0xDE09…c52a`, `USC`, `Classic USD`, `6` (env `VITE_ETC_USC`). |
| `dex` | `{ factory, swapRouter, quoter, positionManager, wnative } \| null` | yes | `61` → verified ETCswap V3 addresses (env `VITE_ETC_ETCSWAP_*`, `VITE_ETC_WETC`). |
| **`dexProvider`** | `DexProvider \| null` | **new** | `61`/`63` → ETCswap; `137`/`80002` → Uniswap; `1337` → `null`. |
| `resources` | `{ faucet? }` | optional | `resources.dexUrl` **removed** (consolidated into `dexProvider.url`, research R6); `faucet` retained where present. |
| `capabilities` | getter `{ polymarketSidebets, dex, friendMarkets }` | yes | `61` → `polymarketSidebets:false`, `dex:Boolean(this.dex)`, `friendMarkets:true`. |

**State / availability semantics** (unchanged invariants, restated):
- `isDexAvailable(chainId) === Boolean(getNetwork(chainId)?.dex)`. Missing required DEX addresses →
  `dex` is `null` → swap disabled (no mock). Honest-State.
- `dexProvider` is **independent** of `dex` availability so disabled-state copy can still name the
  provider (FR-006).

---

## Derived accessor: `getDexProvider(chainId)` (new helper in `networks.js`)

| Aspect | Definition |
|--------|------------|
| Input | `chainId: number` |
| Output | `DexProvider \| null` — the active network's `dexProvider`, or `null` if none/unknown |
| Behavior | `getNetwork(chainId)?.dexProvider ?? null`; resolves the same fallback chain as `getNetwork` |
| Scope guarantee | Pure per-chain lookup; identity never leaks across chains (FR-009) |

---

## Context exposure: `DexContext` value (extended)

`DexProvider` (the React context, not the entity) already returns
`{ ..., isDexAvailable, chainId, network }`. This feature adds:

| Key | Type | Source |
|-----|------|--------|
| `dexProvider` | `DexProvider \| null` | `network?.dexProvider ?? null` (derived from active chain) |

Consumers (`SwapPanel`) read `dexProvider.name` for all provider labels/messages and
`dexProvider.url` for the provider-app link. `network.name` supplies the network name used in
disabled-state copy.

---

## No-change surfaces (explicitly)

- `wagmi.js` — chain `61` already defined and wired.
- `blockExplorer.js` — chain `61 → etc.blockscout.com` already present.
- `contracts.js` — unchanged; ETC mainnet has no project contracts (wager-legacy). Capability tags
  other than "swap" correctly read as not-deployed on `61`.
- Swap mechanics (`getQuote`/`swap`/`wrapNative`/`unwrapNative` in `DexContext`) — unchanged; both
  providers are Uniswap-V3-compatible (FR-008).
