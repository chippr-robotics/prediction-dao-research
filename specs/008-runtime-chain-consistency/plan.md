# Implementation Plan: Runtime Chain Consistency Across Frontend Modals

**Branch**: `fix/membership-purchase-chain-aware` (expands PR #643) | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-runtime-chain-consistency/spec.md`

## Summary

Make every user-facing read, display, and transaction path in the frontend resolve its contract address **and** RPC provider from the wallet's *currently-connected* network instead of the build-time `VITE_NETWORK_ID`. The chain-aware primitives already exist (`getContractAddressForChain(name, chainId)`, `getProvider(chainId)`) and are used by `hasRoleOnChain` and (per PR #643) the membership purchase + tier-read flow. This feature generalizes that pattern across all remaining build-bound call sites (audited: ~13 user-facing files), adds an actionable "not available on this network" UI state, scopes locally-cached chain data per network, and adds a CI regression guard so build-bound resolution can't silently return in user-facing paths.

This operationalizes Constitution **Principle III** (network-scoped data must never leak across testnet/mainnet) across the whole UI.

## Technical Context

**Language/Version**: JavaScript (ES2022 modules), React 18, Vite 5

**Primary Dependencies**: React; wagmi/viem (`useChainId`, connector state) surfaced via `useWeb3()`; ethers v6 (`JsonRpcProvider`, `Contract`); Vitest + Testing Library for tests

**Storage**: Browser `localStorage` for cached role/purchase/preference records (currently keyed by wallet address only — must become chain-scoped). No app backend (fixed no-backend footprint).

**Testing**: Vitest (unit/integration), existing 851-test suite; new per-path tests + a regression-guard test/lint rule

**Target Platform**: Web SPA (evergreen browsers), served as static assets behind nginx/Cloud Run + Cloudflare

**Project Type**: Web frontend (single SPA; no backend or subgraph changes in scope)

**Performance Goals**: Chain-scoped displays refresh within 2 s of a network switch (SC-002); no perceptible regression to initial modal open

**Constraints**: No application backend may be added; contract addresses/ABIs/network config come only from generated sync artifacts (Constitution V); new UI states meet WCAG 2.1 AA; ESLint errors block the build (Constitution IV/V)

**Scale/Scope**: ~13 user-facing files identified in the audit (4 hooks, 4 modals/pages, several services), plus the shared resolution rule, the unavailable-network UI state, cache key scoping, and the regression guard. No contract changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Status |
|---|---|---|
| **I. Security-First Smart Contracts** | No changes under `contracts/`; this is frontend-only. | ✅ N/A |
| **II. Test-First & Coverage** | Each migrated path gets/keeps a Vitest test; a regression-guard test enforces the rule. Behavior is not "done" until tests prove the chain-scoped read. | ✅ Planned |
| **III. Honest State / network-scoped** | This feature *is* the enforcement of "network-scoped data MUST be scoped to the active network and never leak across testnet/mainnet." | ✅ Core intent |
| **IV. Fail Loudly in CI** | Regression guard (ESLint rule and/or test) fails the pipeline if a user-facing path uses build-bound `getContractAddress`/argless `getProvider`. No `continue-on-error`. | ✅ Planned |
| **V. Accessible, Consistent Frontend** | New "switch network" states meet WCAG 2.1 AA; addresses still sourced from generated sync artifacts (we change *which chain's* entry is read, never hardcode). ESLint errors block build. | ✅ Planned |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/008-runtime-chain-consistency/
├── plan.md              # This file
├── research.md          # Phase 0 output — resolution-rule decisions + call-site audit
├── data-model.md        # Phase 1 output — Connected Network / Deployment Set / Chain-Scoped Value
├── quickstart.md        # Phase 1 output — manual + automated validation guide
├── contracts/
│   └── chain-resolution.md   # The internal "contract" every chain-scoped path must satisfy
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   └── contracts.js              # getContractAddress (build-bound), getContractAddressForChain (chain-aware),
│                                 #   NETWORK_CONFIG, DEPLOYED_CONTRACTS, ACTIVE_CHAIN_ID  ← resolution surface
├── utils/
│   ├── blockchainService.js      # getProvider(chainId); hasRoleOnChain ✔, getUserTierOnChain ✔ (PR #643),
│   │                             #   purchaseRoleWithStablecoin ✔; remaining build-bound reads to migrate
│   ├── roleStorage.js            # localStorage cache — key must include chainId (FR-007)
│   ├── keyRegistryService.js     # getContractAddress(keyRegistry) → chain-aware
│   └── sanctionsScreen.js        # getContractAddress → chain-aware
├── hooks/
│   ├── useWeb3.js                # already exposes chainId (the runtime signal)
│   ├── useTierPrices.js          # getContractAddress(membershipManager) → chain-aware
│   ├── useRoleDetails.js         # getContractAddress(membershipManager) → chain-aware
│   ├── useTreasuryVault.js       # admin reads → chain-aware
│   ├── useSiteStats.js           # getContractAddress + getProvider() → chain-aware
│   ├── useFriendMarketCreation.js# wager create → chain-aware
│   └── useNullifierContracts.js  # → chain-aware
├── components/
│   ├── ui/
│   │   ├── PremiumPurchaseModal.jsx     # ✔ already migrated (PR #643)
│   │   └── NetworkUnavailableNotice.jsx # NEW — shared "not available on this network" state (FR-006/008)
│   ├── fairwins/
│   │   ├── FriendMarketsModal.jsx       # → chain-aware
│   │   └── MyMarketsModal.jsx           # → chain-aware (5 sites)
│   └── AdminPanel.jsx                   # → chain-aware
├── pages/
│   └── MarketAcceptancePage.jsx         # → chain-aware
└── data/wagers/EventsSource.js          # getContractAddress + getProvider() → chain-aware
frontend/src/test/                       # Vitest specs incl. regression guard
```

**Structure Decision**: Single web frontend (`frontend/`). No backend/`api/` tier (fixed no-backend footprint), no `contracts/` changes. Work is concentrated in `config/contracts.js` (resolution helpers), `utils/` + `hooks/` (chain-aware reads), the listed modals/pages (consume the chainId), one new shared notice component, and `test/` (per-path tests + regression guard).

## Phased Approach (high level — detailed steps come from `/speckit-tasks`)

1. **Resolution rule + helpers** — confirm/extend `getContractAddressForChain` + `getProvider(chainId)` as the single sanctioned path; document the rule in `contracts/chain-resolution.md`. Add a small helper so hooks consistently derive `chainId` from `useWeb3()` and degrade to the build-time default only when disconnected.
2. **Shared UX** — `NetworkUnavailableNotice` (WCAG AA) wired to the existing `switchNetwork()`; standard actionable message naming a supported network.
3. **Migrate read/display paths** — hooks first (`useTierPrices`, `useRoleDetails`, `useTreasuryVault`, `useSiteStats`, `useFriendMarketCreation`, `useNullifierContracts`), then modals/pages that call services directly (`FriendMarketsModal`, `MyMarketsModal`, `MarketAcceptancePage`, `AdminPanel`, `EventsSource`), then services (`keyRegistryService`, `sanctionsScreen`). Each: take `chainId`, resolve via the chain-aware path, re-fetch on `chainId` change, show the notice when the contract is absent on the connected chain.
4. **Cache scoping** — make `roleStorage` (and any other account-keyed chain data) key by `(chainId, account)` so a tier/purchase on one network never surfaces on another.
5. **Regression guard** — ESLint rule (and/or a source-scanning Vitest test) that fails when `getContractAddress(` or argless `getProvider()` appears in user-facing read/display paths (allowlist `config/contracts.js`, the resolver internals, and the disconnected-state fallback).
6. **Validation** — per-path tests + the quickstart manual matrix (each modal × each supported network, plus a switch-refresh pass).

## Complexity Tracking

> No Constitution violations — section intentionally empty.
