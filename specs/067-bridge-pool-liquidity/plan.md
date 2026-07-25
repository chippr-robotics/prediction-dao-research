# Implementation Plan: Transfer — Cross-Chain Bridge & Earn — Pool Liquidity

**Branch**: `claude/fairwins-bridge-liquidity-c5yq38` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/067-bridge-pool-liquidity/spec.md`

## Summary

Ship two member surfaces over **Across Protocol V3** (bridging + bridge liquidity) and **Uniswap V3**
(trading liquidity), governed by two new per-network UUPS routers that are simultaneously the
platform-fee path and the operator control surface — the same shape spec 066's `StakingRouter` already
proved.

- **Transfer → Bridge.** Rename the `paytransfer` section's *label* to "Transfer" (tab id untouched),
  add a Bridge tab. A member quotes a route through a new relay-gateway `bridge/` module (Across
  suggested-fees), then submits through **`BridgeRouter.bridgeWithFee`**, which skims the
  `bridge.transfer` fee to the treasury and calls `SpokePool.depositV3` with **`depositor` set to the
  member** so an unfilled deposit refunds to *them*, not to the router. In-flight state lives in the
  client ledger store and reconciles on load.
- **Earn → Pool.** Replace the disabled "Bridges" tile with a live **Pool** area listing two curated
  kinds. Uniswap full-range positions mint through **`LiquidityRouter.mintFullRangeWithFee`** (fee
  charged; the NFT goes straight to the member via `MintParams.recipient`). Across HubPool deposits go
  **direct and fee-free** — `addLiquidity` has no recipient parameter, so routing them would take
  custody of the LP tokens.

Three research findings shaped this plan more than the spec anticipated, and each is a safety property
rather than a preference: the **`depositor` refund address** (R2), the **absent `recipient` on
`addLiquidity`** (R3), and the **existing wager-pool feed label already reading "Pool"** (R6). See
[research.md](./research.md).

Both routers hold their surface's route/pool curation, limits, and emergency pause on-chain, gated by a
new `LIQUIDITY_ADMIN_ROLE` (config) and the existing `GUARDIAN_ROLE` (pause), emitting an event per
change. Two new role-gated AdminPanel tabs drive them. The member app reads config at runtime and falls
back to honest-unavailable — never invented availability — when a router is undeployed or unreachable.

## Technical Context

**Language/Version**: Solidity ^0.8.x + Hardhat (contracts); JavaScript ES2022, React 18 + Vite
(frontend); Node ES modules (relay-gateway).

**Primary Dependencies**: OpenZeppelin upgradeable (`UUPSManaged`, `PausableUpgradeable`,
`ReentrancyGuardUpgradeable`, `EnumerableSet`); spec-060 `FeeRouter` (rate + treasury source of truth);
Across V3 `SpokePool` + `HubPool` (external, per-network addresses held in router config); Uniswap V3
`NonfungiblePositionManager` + `UniswapV3Factory` (already in `networks.js` `dex` config); the existing
AdminPanel role model, unified activity ledger (spec 051), notification profiles (spec 059), and
`ISanctionsGuard`. **No new npm or Solidity dependencies** — Across and Uniswap are reached through
minimal local interfaces, not vendored SDKs.

**Storage**: on-chain router state (route/pool registries as `EnumerableSet`, protocol addresses,
limits, paused flag, `FeeRouter` reference) recorded per network in `deployments/`; in-flight bridge
tracking in the existing client ledger store (`data/ledger/ledgerClientStore.js`), which travels in the
spec-032 encrypted backup. No new backend datastore — the gateway stays stateless.

**Testing**: Hardhat unit + **fork tests** for both routers against real Across/Uniswap contracts
(constitution II requires fork tests where external protocols are involved), Slither + Medusa on both
new contracts; Vitest + Testing Library + vitest-axe for the two member surfaces, the two admin tabs,
fee disclosure, and honest-unavailable states; relay-gateway tests for the bridge quote module.

**Target Platform**: Ethereum mainnet (1) and Polygon (137) at launch — see the availability matrix in
[research.md](./research.md) R8. Every other configured network self-discloses unavailable.

**Project Type**: Solidity contracts + web frontend + Node service module + deploy/ops scripts + docs.

**Performance Goals**: member surfaces reflect a config/pause change within one refresh (≤ the existing
60s earn poll); bridge quotes refresh inside their validity window; admin actions confirm in a normal tx.

**Constraints**: value-bearing contracts → checks-effects-interactions, `nonReentrant`, **transient-only
custody** (never hold member funds or LP tokens across transactions), append-only storage + `__gap`
with `check:storage-layout` gating; fee rate stays the single `FeeRouter` source of truth (never
duplicated, never hardcoded); `maxFeeBps` is a hard ceiling; honest state everywhere (a bridge is never
"complete" before destination delivery); per-network isolation with no testnet/mainnet bleed; Bitcoin
network ids must never reach EVM-only code paths; WCAG 2.1 AA; addresses/ABIs from generated sync
artifacts only.

**Scale/Scope**: 2 new UUPS contracts (~250–350 lines each, modeled on the 252-line `StakingRouter`);
1 new role; 2 new AdminPanel tabs; 2 new member surfaces (~1 tab + ~1 Earn view); 1 new gateway module;
2 new ledger classes + 2 notification domains + 1 label correction; deploy + fee-service registration +
sync + storage-check wiring; 3 content pieces + 2 docs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Security-First Smart Contracts** | Two new value-bearing contracts. Both follow checks-effects-interactions, `nonReentrant`, and transient-only custody. Highest-risk surfaces reasoned about explicitly: (a) the **`depositor` refund address** — a router that names itself strands every unfilled bridge, so `depositor = member` is a contract-level invariant with a dedicated fork test (R2); (b) **no LP-token custody** — Across `addLiquidity` is left out of the router entirely rather than wrapped (R3); (c) fee skim is bounded by an immutable 250 bps cap and a member-supplied `maxFeeBps`. Slither + Medusa gating, security-agent review before merge. Targets EthTrust-SL L2. | **PASS** |
| **II. Test-First and Comprehensive Coverage** | Fork tests are mandatory here, not optional: both routers integrate external protocols. The expiry-refund fork case is explicitly non-negotiable — the happy path cannot detect the `depositor` bug class. Frontend logic (quote staleness, state machine, honest-unavailable, fee disclosure) is Vitest-covered. Contract interface changes update their tests in the same PR. | **PASS** |
| **III. Honest State, No Mocks or Placeholders** | This is the feature's dominant design pressure. A bridge is never shown complete before destination delivery (FR-009); the requires-attention state is real and bounded (~90 min post-`fillDeadline`); the launch availability matrix is asymmetric and the copy says so rather than implying uniform coverage; a gateway outage hides the Bridge surface rather than faking a quote; retired pools stay visible and withdrawable. No mock data in any shipped path. | **PASS** |
| **IV. Fail Loudly in CI** | No `continue-on-error` added. New gates: `check:storage-layout` extended to both routers; Slither/Medusa on both; fork tests in the existing fork job. | **PASS** |
| **V. Accessible, Consistent Frontend** | New surfaces reuse the Earn card/InfoTip/disclosure patterns and the AdminPanel tab pattern; vitest-axe on all new components; addresses and ABIs from `sync:frontend-contracts` only. | **PASS** |

**Additional constraints**: no new core technology introduced. Upgradeable-contract rules honored — both
routers inherit `UUPSManaged`, use `initialize` (no constructor state), keep storage append-only with a
trailing `__gap`, and register with `check:storage-layout`.

**Post-Phase-1 re-check**: **PASS, with one deliberate simplicity trade recorded in Complexity
Tracking** (two routers rather than one).

## Project Structure

### Documentation (this feature)

```text
specs/067-bridge-pool-liquidity/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — R1–R10
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── bridge-router.md
│   ├── liquidity-router.md
│   ├── admin-and-runtime.md
│   └── fee-integration.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
contracts/
├── bridge/
│   ├── BridgeRouter.sol          # NEW — UUPS: bridge.transfer fee skim + depositV3, route registry, pause
│   └── IBridgeRouter.sol         # NEW
├── liquidity/
│   ├── LiquidityRouter.sol       # NEW — UUPS: liquidity.deposit fee skim + Uniswap V3 full-range mint,
│   │                             #       curated-pool registry (both kinds), pause
│   └── ILiquidityRouter.sol      # NEW
└── interfaces/external/
    ├── IAcrossSpokePool.sol      # NEW — minimal depositV3 surface
    ├── IAcrossHubPool.sol        # NEW — minimal addLiquidity/removeLiquidity/exchangeRateCurrent (reads + client calls)
    └── INonfungiblePositionManager.sol  # NEW — minimal mint/increaseLiquidity/decreaseLiquidity/collect

test/
├── bridge/BridgeRouter.test.js           # NEW — unit
├── liquidity/LiquidityRouter.test.js     # NEW — unit
└── fork/
    ├── bridgeRouter.fork.test.js         # NEW — incl. MANDATORY expiry-refund-to-member case
    └── liquidityRouter.fork.test.js      # NEW — full-range mint, NFT lands on member

frontend/src/
├── components/
│   ├── wallet/
│   │   ├── BridgeView.jsx                # NEW — Transfer → Bridge tab
│   │   ├── BridgeQuoteCard.jsx           # NEW — itemized costs + staleness
│   │   ├── BridgeStatusList.jsx          # NEW — in-flight / delivered / refunded / attention
│   │   └── PayTransferPanel.jsx          # EDIT — add Bridge tab, relabel section copy
│   ├── earn/
│   │   ├── PoolView.jsx                  # NEW — Earn → Pool area (both kinds)
│   │   ├── PoolCard.jsx                  # NEW
│   │   ├── PoolSupplySheet.jsx           # NEW — fee line + IL / rebalance disclosure gate
│   │   └── EarnPanel.jsx                 # EDIT — "Bridges" disabled tile → live "Pool" area
│   └── admin/
│       ├── BridgeTab.jsx                 # NEW — routes, addresses, limits, pause, in-flight ops
│       ├── PoolTab.jsx                   # NEW — curated pools, caps, pause, fee (read-only)
│       └── adminNav.js                   # EDIT — add both under a "Liquidity" group
├── lib/
│   ├── bridge/
│   │   ├── bridgeRouter.js               # NEW — router reads + call builder
│   │   ├── acrossQuotes.js               # NEW — gateway quote client + staleness
│   │   ├── bridgeStatus.js               # NEW — state machine + reconciliation
│   │   └── bridgeCopy.js                 # NEW — InfoTips + disclosures
│   ├── liquidity/
│   │   ├── liquidityRouter.js            # NEW — router reads + mint call builder
│   │   ├── uniswapPositions.js           # NEW — full-range ticks, position reads
│   │   ├── acrossLpPositions.js          # NEW — direct HubPool reads/calls (fee-free)
│   │   └── liquidityCopy.js              # NEW — InfoTips + IL disclosure
│   └── fees/feeQuote.js                  # EDIT — add BRIDGE_TRANSFER + LIQUIDITY_DEPOSIT service ids
├── data/
│   ├── ledger/
│   │   ├── constants.js                  # EDIT — add LEDGER_CLASS.BRIDGE + .LIQUIDITY
│   │   └── sources/
│   │       ├── bridgeLedgerSource.js     # NEW — capture + reconcile (single logical entry)
│   │       └── liquidityLedgerSource.js  # NEW
│   └── notifications/domains.js          # EDIT — add bridge + liquidity; relabel pools → "Wager Pool"
├── lib/notifications/deliveryPreferences.js  # EDIT — two new categories
└── config/
    ├── networks.js                       # EDIT — per-network `bridge` block (Across addrs, routes)
    └── contracts.js                      # EDIT — bridgeRouter / liquidityRouter address keys

services/relay-gateway/src/
├── bridge/
│   ├── quotes.js                         # NEW — Across suggested-fees proxy (screening/quota/killswitch)
│   └── status.js                         # NEW — deposit status proxy
└── fees/onchain.js                       # EDIT — register the two new service ids

scripts/
├── deploy/deploy-bridge-liquidity.js     # NEW — deploy both proxies, register fee services
└── check-storage-layout.js               # EDIT — cover both routers

docs/
├── developer-guide/bridge-and-liquidity.md   # NEW
├── runbooks/bridge-liquidity-operations.md   # NEW
└── blog/
    ├── features/02-bridge-and-pool/{blog.md,social.md}  # NEW (FR-055)
    ├── posts/NN-cross-chain-intents-and-lp/{...}        # NEW (FR-056)
    └── knowledge/NN-bridges-and-liquidity/{...}         # NEW (FR-057)
```

**Structure Decision**: follows the repo's existing per-domain layout — contracts under a feature
directory (`contracts/bridge/`, `contracts/liquidity/`) mirroring `contracts/staking/` and
`contracts/fees/`; frontend split across `components/` (surface), `lib/` (logic), `data/` (ledger and
notification wiring); gateway modules under `services/relay-gateway/src/<domain>/` alongside
`polymarket/` and `bitcoin/`. External protocol interfaces are declared minimally under
`contracts/interfaces/external/` rather than vendoring Across or Uniswap packages, keeping the
dependency surface and the audit surface small.

## Complexity Tracking

> Filled because the design adds two contracts where the constitution's simplicity rule (YAGNI) invites
> asking whether one would do.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Two new UUPS routers** (`BridgeRouter`, `LiquidityRouter`) rather than one combined router | The two surfaces have disjoint call shapes (single-token `depositV3` with a cross-chain refund address vs. two-token Uniswap mint returning an NFT), disjoint fee services with independent rates, disjoint admin views (spec FR-040), and disjoint blast radii. Separating them means a bridge pause or a bridge upgrade cannot affect member LP positions, and vice versa. | A single router would put two unrelated external protocol integrations behind one upgrade authority and one pause, so any bridge incident would also freeze pool deposits. It also pushes toward the 24 KB code limit that already forced `WagerRegistry` into a two-facet proxy — paying that complexity here to save one contract is a bad trade. |
| **Across HubPool LP left outside the router** (fee-free, direct member call) | `addLiquidity(address,uint256)` has no recipient parameter, so any wrapper receives the LP tokens and becomes custodian of a position the member could then never exit (research R3). | Routing it for fee symmetry would violate FR-021/FR-023 and repeat exactly what spec 066 already rejected for delegated staking. Shipping the fee here is not worth making a position un-exitable. |

**Not a violation, recorded for reviewers**: the launch availability matrix is asymmetric (Across LP is
Ethereum-only, Uniswap LP is Polygon-only). This is external-protocol reality, surfaced honestly per
constitution III, not a gap to be papered over with a "coming soon" tile.
