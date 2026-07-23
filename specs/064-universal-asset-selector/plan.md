# Implementation Plan: Universal Asset Selector

**Branch**: `claude/universal-asset-selector-ytlm7v` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/064-universal-asset-selector/spec.md`

## Summary

Replace the narrow asset controls on the home **Pay**, **Request**, and **Wager**
views (native + stablecoin only; Wager hard-locked to USDC) and upgrade the
wallet **Transfer** ("trade") view's plain asset dropdown, with a single reusable
**universal asset selector**. The selector lists any platform-supported asset the
acting account holds across every configured network — the same cross-network
portfolio the Transfer form already assembles — and renders each option with the
Earn page's **nested asset logo** (`AssetLogo`: asset glyph + network sub-badge).
Non-EVM assets (Bitcoin) appear and function where supported (Pay, Request) and
are excluded from EVM-only activities (Wager escrow, Transfer's on-connected-chain
send is already gated). All routing is delegated to the existing `useTransfer`
send engine (which already accepts a full asset descriptor and quotes gasless
per-asset), so this feature adds **no new on-chain behavior, contracts, or network
config** — it is pure frontend presentation + wiring.

The design extracts two shared frontend primitives from the existing
`TransferForm`/`TransferAssetSelect` pair so all four surfaces share one code path:

1. **`useSelectableAssets(options)`** — a hook that builds the activity-scoped,
   acting-account-aware option list from `usePortfolio` / `useAccountAssets` /
   `useChainTokens` / `useBitcoinWallet`, generalizing the `assetOptions` useMemo
   currently inlined in `TransferForm`.
2. **`UniversalAssetSelect`** — a presentational dropdown that renders each option
   with `AssetLogo` (nested badge), symbol, network, balance, and gasless marker;
   a superset of today's `TransferAssetSelect` with the nested logo added.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 + Vite (frontend only).

**Primary Dependencies**: React, wagmi/viem (chain switch), ethers (already used
by the send engine), Vitest + Testing Library. Reused app modules:
`hooks/useTransfer`, `hooks/usePortfolio`, `hooks/useAccountAssets`,
`hooks/useChainTokens`, `hooks/useBitcoinWallet`, `hooks/useActiveAccount`,
`components/wallet/AssetLogo`, `config/assetTaxonomy` (`getPortfolioRegistry`,
`getUnderlyingMeta`), `config/networks`, `config/bitcoinNetworks`
(`isBitcoinNetworkId`).

**Storage**: None new. Reads existing portfolio holdings + network config; writes
nothing persistent. Amount/preference behavior from spec 058 is untouched.

**Testing**: Vitest component/unit tests under
`frontend/src/components/**/__tests__/` and hook tests. Follows existing patterns
(`TransferForm` tests, `AssetLogo` render tests).

**Target Platform**: Web SPA (desktop + mobile home surface), same browsers the
app already targets.

**Project Type**: Web frontend (React). No backend, contract, or subgraph changes.

**Performance Goals**: Selector opens and filters instantly for realistic
portfolios (tens of assets across ~5 networks); option-list assembly is a pure
`useMemo` over already-fetched holdings — no new network round-trips introduced by
the selector itself.

**Constraints**: WCAG 2.1 AA (keyboard + screen-reader operable; nested logo is
decorative and never the sole meaning carrier). Honest-state (Constitution III):
never offer an asset an activity can't act on; never sign against the wrong chain;
balances shown as pending, not fake-zero. No hardcoded addresses/ABIs — all asset
identity comes from existing config/sync artifacts.

**Scale/Scope**: 4 consuming surfaces (Pay, Request, Wager, Transfer); 1 new hook,
1 new presentational component (+ CSS), 1 small capability-profile helper; wiring
edits to `PayPanel`, `RequestPanel`, `CreateChallengePanel`, `TransferForm`;
refactor `TransferAssetSelect` to delegate to (or be replaced by) the new
component.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — ✅ N/A. No `contracts/`
  changes; no new on-chain behavior (FR-016). No Slither/Medusa/security-agent gate
  triggered.
- **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** — ✅ Vitest tests
  ship with the hook, the component, and each rewired panel (option assembly,
  activity scoping, network-switch gating, Bitcoin inclusion/exclusion, fallback
  on invalid selection, a11y roles). No contract interfaces change.
- **III. Honest State, No Mocks/Placeholders** — ✅ Central to the design: assets
  come from real portfolio holdings + network config; unsupported assets are
  excluded per activity so nothing fails silently at submit; balances are pending
  vs. real; per-asset gasless truth comes from the engine's own quote; Bitcoin is
  network-scoped via `isBitcoinNetworkId` and never passed to EVM code.
- **IV. Fail Loudly in CI** — ✅ No `continue-on-error`; ESLint/tests gate as usual.
- **V. Accessible, Consistent Frontend** — ✅ Keyboard/listbox semantics, labels,
  decorative logo (`aria-hidden`) with text carrying meaning; addresses/ABIs/config
  from sync artifacts, never hand-copied. axe/Lighthouse CI unaffected/greened.

**Result**: PASS. No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/064-universal-asset-selector/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (frontend component/hook contracts)
│   └── universal-asset-selector.md
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # From /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── ui/
│   │   ├── UniversalAssetSelect.jsx        # NEW — reusable nested-logo asset dropdown
│   │   └── UniversalAssetSelect.css        # NEW — styles (dark-mode aware, a11y)
│   ├── wallet/
│   │   ├── AssetLogo.jsx                    # REUSED unchanged (nested logo artwork)
│   │   ├── TransferForm.jsx                 # EDIT — use hook + UniversalAssetSelect ("trade" view)
│   │   └── TransferAssetSelect.jsx          # EDIT — thin wrapper over UniversalAssetSelect (or removed)
│   └── fairwins/
│       ├── PayPanel.jsx                     # EDIT — swap <select> for UniversalAssetSelect (US1)
│       ├── RequestPanel.jsx                 # EDIT — swap <select> for UniversalAssetSelect (US2)
│       └── CreateChallengePanel.jsx         # EDIT — USDC-locked → escrow-eligible selector (US3)
├── hooks/
│   └── useSelectableAssets.js               # NEW — activity-scoped, acting-account asset options
├── lib/
│   └── assets/
│       └── assetActivity.js                 # NEW — activity capability profiles + filtering
└── ...
frontend/src/**/__tests__/                   # NEW/EDIT — Vitest coverage
```

**Structure Decision**: Web frontend only. New shared pieces live in `components/ui`
(the reusable selector) and `hooks/` + `lib/assets/` (data + policy), mirroring how
the app already separates presentational UI, data hooks, and pure config/policy.
The four consuming surfaces are edited in place; the existing `TransferForm`
`assetOptions` logic and `TransferAssetSelect` are the extraction source so the
"trade" view keeps identical behavior while gaining the nested logo.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
