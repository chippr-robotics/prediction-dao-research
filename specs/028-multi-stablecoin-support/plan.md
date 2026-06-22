# Implementation Plan: Multi-Stablecoin Support

**Branch**: `claude/multi-stablecoin-support-rq2baj` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/028-multi-stablecoin-support/spec.md`

## Summary

Let members stake and settle wagers in multiple curated stablecoins (USDC default, plus USDT and a euro-backed coin such as EURC on Polygon mainnet), and let members choose their default and visible stablecoins from the Preferences tab of the My Account view.

**Key technical finding that shapes this plan**: the on-chain escrow (`WagerRegistry`) **already supports multiple ERC-20 stake tokens** via an admin-managed allow-list (`_allowedTokens`, `setTokenAllowed`, `isAllowedToken`, the `TokenAllowed` event, and a per-wager `token` field), and the wager-creation hook already accepts a caller-supplied stake token and reads its `decimals()`/`symbol()` at runtime. Therefore **no Solidity logic change and no contract upgrade are required**. The work is: (1) curate the supported stablecoins in config + seed them into the existing allow-list via the existing admin entrypoint; (2) add a per-network supported-stablecoins list to frontend config; (3) add member default/visible preferences (client-side per wallet); (4) surface a stablecoin selector in wager creation; (5) make all amount displays token-aware and strictly per-currency (no FX). This keeps the change small (YAGNI) and off the highest-risk contract surface.

## Technical Context

**Language/Version**: Solidity ^0.8.x (Hardhat) for contracts (no logic change this feature); JavaScript/JSX on React 18 + Vite for the frontend; Node scripts for deploy/ops.

**Primary Dependencies**: ethers v6, wagmi/viem (chain + signer), The Graph subgraph (wager indexing, already token-aware), existing `WagerRegistry` v2 ABI.

**Storage**: Member stablecoin preferences → browser localStorage, per wallet, via the existing `userStorage` utility and `UserPreferencesContext` (no backend, no on-chain storage). Supported-stablecoin curation → frontend `networks.js` config + deploy constants; on-chain allow-list state lives in the already-deployed `WagerRegistry`.

**Testing**: Hardhat (`test/` unit + `test/integration/`) for multi-token wager flows against the existing allow-list; Vitest for frontend (preferences reducer, selector, token-aware display, report grouping); axe/Lighthouse for the new Preferences UI.

**Target Platform**: Web app on Polygon mainnet (137, primary), Polygon Amoy (80002) and Mordor (63) testnets; supported set is strictly network-scoped.

**Project Type**: Web application (React frontend + Solidity contracts + subgraph) — Option 2 structure.

**Performance Goals**: No new latency budget; token metadata (symbol/decimals) is read once per token and cached, matching today's single-token behavior. Adding stablecoins must not add per-render RPC calls.

**Constraints**: Curated set limited to standard, non-rebasing, non-fee-on-transfer ERC-20 stablecoins (FR-002b) so escrowed amount == staked amount. No FX/price source introduced (FR-013a); amounts are always per-stablecoin. USDC behavior for existing members must be unchanged with zero configuration (SC-004).

**Scale/Scope**: First release adds 2 stablecoins beyond USDC on Polygon mainnet; curated list extensible by config/admin without code changes. Frontend touchpoints: Preferences tab, wager-creation selector, amount-display components, tax/P&L report grouping.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|-----------|--------|
| **I. Security-First Smart Contracts** | No change to `contracts/` logic. Multi-token escrow already exists and was shipped under the existing security review; this feature only **calls the existing `setTokenAllowed` admin entrypoint** to seed curated tokens and adds them to deploy `initialTokens`. No new reentrancy/custody surface. Curation rule (standard ERC-20 only) is the security control and is enforced by process + documented rationale (FR-002b/FR-017). No new Slither/Medusa surface. | PASS |
| **II. Test-First & Coverage** | New Hardhat integration test proving create→accept→claim/refund/draw in a non-USDC allow-listed token (incl. a 18-decimal token) alongside existing allow-list unit tests; Vitest for preferences invariants, selector filtering, token-aware formatting, and per-ticker report grouping. Tests land with the behavior. | PASS |
| **III. Honest State, No Mocks in Shipped Paths** | Real curated token addresses only (Circle/issuer-verified); no mock stablecoins in mainline. Amounts reflect real on-chain token + decimals; non-USD never shown as USD; supported set and preferences strictly network-scoped (degrade to USDC when a stored choice is absent on the active chain). | PASS |
| **IV. Fail Loudly in CI** | No `continue-on-error` added. New tests gate the pipeline. | PASS |
| **V. Accessible, Consistent Frontend** | New Preferences stablecoin manager + wager selector meet WCAG 2.1 AA (axe test), keyboard-operable, ESLint-clean; token addresses come from the generated sync artifacts / `networks.js`, never hand-copied into components. | PASS |
| **Upgradeable-contracts guardrail** | `WagerRegistry` is a UUPS proxy, but this feature ships **no implementation change**, so no upgrade, no storage-layout change, no `__gap` concern. Explicitly NOT adding on-chain allow-list enumeration (would require an upgrade) — the frontend enumerates from curated config, consistent with existing config-driven address resolution. | PASS |

**Result**: All gates PASS. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/028-multi-stablecoin-support/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (interface/UX contracts — no new Solidity)
│   ├── stablecoin-registry.config.md
│   ├── member-preferences.schema.md
│   └── allowlist-seeding.op.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
contracts/
└── wagers/WagerRegistry.sol        # NO CHANGE — already multi-token (allow-list + per-wager token)

scripts/
├── deploy/lib/constants.js         # TOKENS: add USDT + euro coin addresses per network
├── deploy/deploy.js                # seed extra tokens into initialTokens for fresh deploys
└── ops/seed-stablecoins.js         # NEW — admin op: setTokenAllowed for curated tokens on existing deployments

frontend/src/
├── config/
│   ├── networks.js                 # add per-network `stablecoins` curated list (keep `stablecoin` as default)
│   └── stablecoins.js              # NEW — helpers: getSupportedStablecoins(chainId), getDefaultStablecoin(chainId), findStablecoin(...)
├── contexts/UserPreferencesContext.jsx  # add stablecoinDefault + stablecoinVisibility state/actions
├── hooks/
│   ├── useChainTokens.js           # keep (default stable); add useSupportedStablecoins() / useVisibleStablecoins()
│   └── useFriendMarketCreation.js  # already accepts requestedToken — wire selector value through
├── components/
│   ├── account/StablecoinPreferences.jsx   # NEW — Preferences-tab manager (default + visibility)
│   ├── wager/StablecoinSelector.jsx        # NEW — create-wager token picker (visible set, default pre-selected)
│   └── ui/TokenAmount.jsx                   # NEW — render amount + symbol at token decimals (generalizes StableToken)
├── pages/WalletPage.jsx            # mount StablecoinPreferences in the existing `preferences` tabpanel
└── data/reports/
    ├── tokenMeta.js                # add peg currency; keep per-token resolution
    └── reportBuilder.js            # keep strict per-ticker grouping; do not sum non-USD into usdValue

frontend/src/test/                  # Vitest: preferences, selector, TokenAmount, report grouping, networks config
test/integration/                   # Hardhat: multi-token wager lifecycle (non-USDC, 18-decimal)
```

**Structure Decision**: Web-application layout (Option 2). The change is concentrated in frontend config/UI/preferences and deploy/ops scripts; `contracts/` is untouched. New frontend modules are small, composable units (`stablecoins.js` config helpers, `StablecoinPreferences`, `StablecoinSelector`, `TokenAmount`) that reuse existing patterns (`useChainTokens`, `UserPreferencesContext`, `userStorage`, `resolveTokenMeta`).

## Complexity Tracking

> No constitution violations — section intentionally empty.
