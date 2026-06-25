# Implementation Plan: Network-Aware Swap Provider

**Branch**: `033-network-aware-swap` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/033-network-aware-swap/spec.md`

## Summary

Make the in-app Swap surface name and link the **correct DEX provider** for the active
network: Ethereum Classic networks (ETC mainnet `61`, Mordor `63`) default to **ETCswap**;
all other networks (Polygon `137`, Amoy `80002`) default to **Uniswap**. Swap *routing*
already targets the per-chain DEX deployment, but every user-facing label, message, and link
is hardcoded "Uniswap V3" — misleading on Ethereum Classic.

Technical approach: introduce a small, data-driven, **network-level `dexProvider` descriptor**
(`{ name, url }`) in `frontend/src/config/networks.js`, declared on every supported network so
it is available even when the chain has no configured DEX (for honest disabled-state copy).
Expose it through `DexContext`, and consume it in `SwapPanel` (labels, disabled-state message,
provider link) and `NetworkSettings` (provider link), replacing hardcoded "Uniswap" strings.
Add Ethereum Classic mainnet (`61`) to `networks.js` bound to ETCswap, using the on-chain
verified ETCswap V3 addresses (see [research.md](./research.md)) as env-overridable defaults.
Frontend-only; no backend, no smart-contract changes; reuses the existing Uniswap-V3-compatible
swap/quote/wrap logic unchanged.

## Technical Context

**Language/Version**: JavaScript (ES modules), React 18, Node 20 toolchain

**Primary Dependencies**: Vite, wagmi v2 + viem, ethers v6 (swap/quote calls), Vitest + React
Testing Library (tests). No new dependency is introduced.

**Storage**: N/A — configuration and runtime context only; no persistence. (Balance history is
already in-memory in `DexContext` and is untouched.)

**Testing**: Vitest unit/component tests under `frontend/src/test/`; axe/Lighthouse a11y in CI.

**Target Platform**: Browser SPA (fairwins.app), served by nginx on Cloud Run.

**Project Type**: Web frontend (single `frontend/` app). No backend tier (fixed footprint).

**Performance Goals**: Provider resolution is a pure synchronous config lookup at render time
(O(1) map access); no added network round-trips, no measurable render impact.

**Constraints**: No-backend footprint; honest-state (no mock DEX, real verified addresses,
network-scoped identity); WCAG 2.1 AA for the changed UI; contract/network config flows from
`networks.js` (the established source of truth), never hardcoded in components.

**Scale/Scope**: 5 configured chains (137, 80002, 63, **+61 new**, 1337). ~6 source files +
~3–4 test files touched. No data migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts** | **N/A / PASS** — no `contracts/` changes. The swap is a value-bearing surface but routes through *external* DEX protocol contracts (ETCswap/Uniswap V3), not project contracts. Risk is mitigated by honest-state gating: real, on-chain-verified addresses only; no mock/placeholder DEX; DEX disabled when addresses are absent. |
| **II. Test-First & Coverage** | **PASS** — Vitest tests are added/extended alongside the change: provider mapping (`networks`/`getDexProvider`), `DexContext` exposure, `SwapPanel` provider-correct labels & disabled-state per chain, `NetworkSettings` provider link, and the new `61` network entry. No contract-interface change, so no Hardhat tests required. |
| **III. Honest State, No Mocks** | **PASS (central)** — provider identity is **scoped to the active network** and never leaks; DEX availability stays gated on configured addresses; ETC mainnet uses **on-chain-verified** ETCswap addresses (research.md), never a mock; disabled-state copy names the provider that actually applies to that network. |
| **IV. Fail Loudly in CI** | **PASS** — no `continue-on-error` added; lint/test/build/a11y gates unchanged. |
| **V. Accessible, Consistent Frontend** | **PASS** — changed elements are standard headings/anchors with accessible names (`Open {provider} ↗`, external links keep `rel="noopener noreferrer"`); ESLint clean; network config comes from `networks.js` artifacts, not hand-copied into components. External DEX addresses live in `networks.js` exactly as Polygon's canonical Uniswap addresses already do (precedent), so this is consistent with the "config from the source of truth" rule. |

**Result**: PASS — no violations. Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/033-network-aware-swap/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — verified ETCswap addresses + design decisions
├── data-model.md        # Phase 1 — DexProvider descriptor + Network DEX binding shapes
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/
│   └── dex-provider-interface.md   # Phase 1 — frontend config/context interface contract
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── config/
│   │   ├── networks.js               # ADD networks[61] (ETC mainnet → ETCswap);
│   │   │                             #   ADD network-level `dexProvider` to 61/63/137/80002;
│   │   │                             #   ADD getDexProvider(chainId) helper;
│   │   │                             #   consolidate resources.dexUrl → dexProvider.url
│   │   ├── networkCapabilities.js    # provider-neutral "swap" feature description
│   │   ├── wagmi.js                  # NO CHANGE (chain 61 already wired)
│   │   └── blockExplorer.js          # NO CHANGE (chain 61 already present)
│   ├── contexts/
│   │   └── DexContext.jsx            # expose `dexProvider` in context value
│   ├── constants/
│   │   └── dex.js                    # update comments; (optional) export active provider
│   ├── components/
│   │   ├── fairwins/SwapPanel.jsx    # provider-aware labels, disabled-state, provider link
│   │   └── wallet/NetworkSettings.jsx# provider link from dexProvider
│   └── test/
│       ├── networks.test.js          # NEW — provider mapping + networks[61]
│       ├── SwapPanel.test.jsx        # NEW — provider-correct labels/links per chain
│       ├── DexContext.test.jsx       # NEW — dexProvider exposure per chain
│       └── NetworkSettings.test.jsx  # EXTEND — provider link assertions
└── .env.example                      # ADD VITE_ETC_* (chain 61) overrides block
```

**Structure Decision**: Single existing `frontend/` React app — no new project or module. The
change is localized to chain configuration (`config/`), the DEX runtime context (`contexts/`),
and the two surfaces that present provider identity (`SwapPanel`, `NetworkSettings`). The
provider mapping is data-driven via a per-network `dexProvider` field plus a `getDexProvider`
helper, so future networks opt in by configuration alone (FR-007).

## Complexity Tracking

> No constitution violations — no entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _none_    | —          | —                                    |
