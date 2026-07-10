# Implementation Plan: Connected Account Portfolio

**Branch**: `claude/connected-account-portfolio-h26qk3` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/044-connected-account-portfolio/spec.md`

## Summary

Add a **Portfolio** section to **My Wallet → Finance** that shows the connected account's
real on-chain holdings on the active network, grouped under the app's five SEC/CFTC-aligned
taxonomy categories (Digital Commodities, Digital Securities, Payment Stablecoins, Digital
Tools, Digital Collectibles) plus an honest **Unclassified** fallback. Classification is
driven by a layered, per-network **asset taxonomy registry** config module: a hardcoded SEC
commodity baseline (native + wrapped-native coins), curated registry entries (canonical
well-known tokens per chain), and app configuration (the network's stablecoin, the
MembershipVoucher credential NFT). A `usePortfolio` hook reads live balances via the
existing wallet read provider; USD values come from the existing price capability with
strictly honest "price unavailable → partial totals" semantics. Frontend-only: no new
dependencies, no backend, no contract changes.

## Technical Context

**Language/Version**: JavaScript/JSX, React 18 + Vite (existing `frontend/`)

**Primary Dependencies**: Existing stack only — ethers v6 for reads (via
`WalletContext` `provider`), wagmi v3/viem for connection state (never touched directly;
mocked at context level in tests), react-router-dom v7 (existing `/wallet?tab=` deep
links). **No new runtime dependencies.**

**Storage**: None. All portfolio data is derived live from chain reads + bundled config.
No localStorage, no backend.

**Testing**: Vitest (jsdom) + @testing-library/react + vitest-axe, following the repo
convention of mocking wallet state at the context level (see
`frontend/src/test/WalletPage.test.jsx`). Tests run under `VITE_NETWORK_ID=63`,
`VITE_SKIP_BLOCKCHAIN_CALLS=true`.

**Target Platform**: PWA (desktop/mobile browsers). Networks: all `NETWORKS` entries —
Polygon 137, Amoy 80002, Mordor 63, ETC 61, Ethereum 1, Hardhat 1337 — each with its own
registry; a chain without registry entries beyond the native coin still renders honestly.

**Project Type**: Web application (existing `frontend/` of the monorepo).

**Performance Goals**: Categorized holdings visible < 5s on a healthy RPC (SC-001).
Balance reads batched with `Promise.allSettled` (one `getBalance` + one `balanceOf` per
registry asset; registries are ≤ ~8 assets/chain, so no multicall needed — YAGNI).

**Constraints**:
- **Honest state (constitution III)**: no fabricated USD values. The app's price feed is
  MATIC-only (`usePriceConversion` via CoinGecko), so native/wrapped-native USD applies
  only on MATIC-native chains (137/80002); stablecoins value at par $1 (existing
  `useAccountStats` convention); every other asset shows "USD unavailable" and flips
  totals to a visible **partial** state (FR-010). The CoinGecko fallback-rate path
  (`error` set in `usePriceConversion`) is treated as price-unavailable for portfolio
  totals rather than presenting a hardcoded rate as real.
- **Network scoping (constitution III)**: registry resolution and every read is keyed on
  the active `chainId`; a chain switch resets state before reloading.
- **Config from sync artifacts (constitution V)**: app-known addresses resolve through
  `config/networks.js` (`stablecoin`, `dex.wnative`) and
  `config/contracts.js#getContractAddressForChain` (`wmatic`, `membershipVoucher`).
  Curated registry entries (canonical WETH/WBTC/LINK/USDT on Polygon) are new config
  *data* — the same pattern as the canonical Uniswap addresses already declared in
  `networks.js` — documented with provenance and env-override-free (bundled, updated by
  release, per spec Assumptions).

**Scale/Scope**: 1 config module, 1 hook, 1 panel component tree + CSS, 1 nav entry in
`WalletPage.jsx`, 4 test files. No contracts, no subgraph, no scripts.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Security-First Smart Contracts** | N/A — no contract changes. Read-only `balanceOf`/`getBalance` calls from the frontend; no approvals, no writes, no funds moved. ✅ |
| **II. Test-First & Coverage** | Registry (classification, precedence, per-network scoping), hook (load/error/partial/refresh/chain-switch), and panel (all FR-014 states, collapse behavior, unclassified group, disclaimers) each get Vitest coverage; panel gets a vitest-axe audit. ✅ |
| **III. Honest State, No Mocks** | Balances read live per active chain; zero-balance registry assets are not shown as holdings; unpriced assets never render $0.00 and totals are labeled partial; failed reads surface an error/partial state, never zeros; registry-coverage disclosure states that unlisted tokens won't appear; Unclassified group prevents silent hiding. No mock data in shipped paths — the registry is real config data, and the demo-like mockup values are NOT reproduced. ✅ |
| **IV. Fail Loudly in CI** | New tests join the existing Vitest gate; no `continue-on-error`. ✅ |
| **V. Accessible, Consistent Frontend** | Collapsible category sections are keyboard-operable buttons with `aria-expanded`/`aria-controls`; totals and rows carry accessible labels; vitest-axe test included; addresses come from config helpers, not hand-copied into components (curated registry entries live in config with provenance comments). ✅ |
| **Additional: tech stack** | No new core technology; plain co-located CSS; custom hook pattern (`useTransfer`/`useAccountStats` precedent). ✅ |

**Post-Phase-1 re-check**: design introduces no violations — no Complexity Tracking
entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/044-connected-account-portfolio/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── asset-registry.md  # Registry + hook interface contract
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   └── assetTaxonomy.js            # NEW — categories, SEC baseline, curated registry,
│                                   #        getPortfolioRegistry(chainId)
├── hooks/
│   └── usePortfolio.js             # NEW — live balances + USD join + states
├── components/wallet/
│   ├── PortfolioPanel.jsx          # NEW — header total, category sections, rows,
│   │                               #        disclosures, states (FR-014)
│   └── Portfolio.css               # NEW — co-located styles (theme.css tokens)
├── pages/
│   └── WalletPage.jsx              # EDIT — Finance group nav entry + tabpanel block
└── test/portfolio/                 # NEW — central test dir (repo convention)
    ├── assetTaxonomy.test.js
    ├── usePortfolio.test.jsx
    ├── PortfolioPanel.test.jsx
    └── PortfolioPanel.axe.test.jsx
```

**Structure Decision**: Single-page-app extension inside the existing `frontend/`
workspace; mirrors the Pay & Transfer / Custody panel layout (config module + hook +
co-located panel) with tests under `frontend/src/test/portfolio/`.

## Complexity Tracking

No constitution violations — table intentionally empty.
