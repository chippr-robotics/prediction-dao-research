# Implementation Plan: Polygon membership reference chain + all-chains admin reads

**Branch**: `claude/multi-chain-admin-polygon-membership` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/071-multi-chain-admin-console/spec.md`

## Summary

Stop answering "where does this fact live?" with "wherever the wallet is pointed."

Membership gets one declared home per environment cohort — the **membership reference chain**
(Polygon on mainnet builds, Amoy on testnet builds), derived from constants `config/networks.js`
already holds. Every membership read, and every membership purchase, goes there. Operator views stop
being wallet-scoped and read the whole cohort through one shared estate helper, reporting each chain
as *read*, *not deployed*, or *unreadable* — never collapsing the last two into a zero.

Writes are untouched in character: one transaction, one named chain, wallet required to be there,
authority verified against that chain's own contract.

The approach is **generalization, not invention**. The Bridge and Supply tabs (spec 067 FR-050)
already do all of this for two views; their helper module moves to `lib/`, gets its spec-069
provider bug fixed (research R2), and the fifteen remaining views adopt it.

## Technical Context

**Language/Version**: JavaScript (ES2022+), React 19, JSX. No TypeScript in this codebase.

**Primary Dependencies**: ethers v6 (contract reads), wagmi/viem (wallet transport), React Router.
No new dependency is introduced by this feature.

**Storage**: Browser local storage for the existing per-`(address, chainId)` role cache. The key
already carries a chain dimension, so no migration is required — entries simply exist for more
chains. No server-side or on-chain storage changes.

**Testing**: Vitest + @testing-library/react + vitest-axe (`npm run test:frontend`). Source-level
guard tests in `frontend/src/test/` for rules that must hold across files.

**Target Platform**: Browser SPA (`frontend/`), desktop and mobile viewports.

**Project Type**: Web application — frontend only for this feature.

**Performance Goals**: A view resolves each chain independently and renders as each arrives
(FR-015); no view blocks on the slowest endpoint. Estate reads are bounded by the cohort size
(6 mainnets / 5 testnets today), issued concurrently, and the wallet's own provider is reused for
the connected chain.

**Constraints**:
- No contract changes; no ABI, storage-layout, or deployment change (spec Assumptions).
- Reads must go through `getReadProvider(chainId)` so member endpoint overrides and failover apply
  (spec 069). The current admin helper bypasses this and is fixed here (research R2).
- Reads must never cross the testnet/mainnet cohort boundary (constitution III, FR-002).
- Balances in different units are never summed (FR-022).

**Scale/Scope**: 17 operator views — the tab ids in `components/admin/adminNav.js` — of which 2
(Bridge, Supply) are already converted, leaving 15. Plus 2 membership resolver functions, 1 purchase
flow, ~6,000 lines of admin component code within reach. Cohort size 5–6 chains.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — result unchanged.*

| Principle | Applies? | Assessment |
|---|---|---|
| **I. Security-First Smart Contracts** | Not triggered | No `contracts/` change. No ABI, storage layout, deployment, or access-control logic is altered. The on-chain role model is explicitly out of scope. **PASS (n/a)** |
| **II. Test-First and Comprehensive Coverage** | Yes | Every converted view gets the case set the existing `AdminBridgeTab`/`AdminSupplyTab` suites already prove (scope-off-wallet renders read state; write controls withheld with a reason; unreadable ≠ zero). Resolver and estate-helper unit tests plus a source-level guard (research R9). **PASS** |
| **III. Honest State, No Mocks or Placeholders** | Yes — **central** | This principle *is* the feature. FR-014's three-state read result, FR-004's *unknown* membership, and FR-021–FR-023's per-unit partial-labelled totals all exist to stop unread state rendering as fact. The clause "never leak across testnet/mainnet boundaries" is honoured by cohort filtering (research R7) — see the note below. **PASS** |
| **IV. Fail Loudly in CI** | Yes | No `continue-on-error` added. New tests run in the existing frontend job. **PASS** |
| **V. Accessible, Consistent Frontend** | Yes | New per-chain state and scope selectors follow the existing admin patterns and must pass the axe checks already in CI. Addresses and ABIs continue to come from the generated sync artifacts — the reference chain is derived from `config/networks.js` constants, never a hand-copied address. **PASS** |

### Note on principle III and "read from all chains"

Read naively, "all admin views must read from all chains" collides with *"Network-scoped data
(wagers, membership, balances) MUST be scoped to the active network and never leak across
testnet/mainnet boundaries."*

They are reconciled, not traded off. The principle's concern is **cohort leakage** — a testnet build
showing mainnet money, or the reverse. This feature's concern is **wallet-position coupling** — a
mainnet build showing one mainnet's state because that is where the wallet points. Cohort filtering
(FR-002, the `estate.js` roster) satisfies the first while removing the second. A mainnet build reads
six mainnets and no testnet; a testnet build reads five testnets and no mainnet.

This is recorded as a **passing gate**, not a justified violation. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/071-multi-chain-admin-console/
├── plan.md              # This file
├── research.md          # Phase 0 output — R1..R9, all unknowns resolved
├── data-model.md        # Phase 1 output — entities and state transitions
├── quickstart.md        # Phase 1 output — how to validate the feature
├── contracts/           # Phase 1 output — module interface contracts
│   ├── estate-read.md         # Per-chain read result + estate helper contract
│   ├── membership-chain.md    # Reference-chain resolver contract
│   └── view-scope.md          # Contract every converted operator view honours
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   └── networks.js                    # + MEMBERSHIP_REFERENCE_CHAIN_ID, membershipChainId(),
│                                      #   cohortChainIds()  (research R1, R7)
├── lib/
│   └── chains/
│       ├── estate.js                  # NEW — shared per-chain read helper, promoted from
│       │                              #   components/admin/liquidityAdminCommon.js with the
│       │                              #   spec-069 provider bypass fixed (research R2)
│       └── chainReadResult.js         # NEW — read | not-deployed | unreadable, and the
│                                      #   aggregation rules that refuse cross-unit sums
├── utils/
│   └── blockchainService.js           # membership branch of hasRoleOnChain /
│                                      #   getUserTierOnChain resolves the reference chain;
│                                      #   admin-role branch keeps its explicit chain (R3)
├── contexts/
│   ├── RoleContext.jsx                # estate-wide role sync; records per-chain outcome (R4)
│   └── WalletContext.jsx              # same sync path
├── components/
│   ├── AdminPanel.jsx                 # entry gate + permissions card become estate-wide;
│   │                                  #   fee overview per chain
│   ├── admin/
│   │   ├── liquidityAdminCommon.js    # re-exports from lib/chains/estate.js; Bridge/Supply
│   │   │                              #   keep working unchanged
│   │   ├── MembershipTreasuryOverview.jsx
│   │   ├── FeesTab.jsx  StakingTab.jsx  DenyListAdmin.jsx  CallsignRegistryAdmin.jsx
│   │   ├── ProtocolConfigTab.jsx  OracleAdaptersTab.jsx  MaintenanceTab.jsx
│   │   └── ServiceHealthCard.jsx  PaymasterOpsCard.jsx
│   └── ui/
│       └── PremiumPurchaseModal.jsx   # purchase routed to the reference chain (US5)
└── test/
    ├── chainResolutionGuard.test.js   # doc-comment amended to state the actual rule (R5)
    └── admin/                         # per-view suites, modelled on the two existing ones
```

**Structure Decision**: Existing web-application layout; frontend only. The one new directory is
`frontend/src/lib/chains/`, which follows the established `lib/<domain>/` convention already used by
`lib/custody/`, `lib/relay/`, `lib/network/`, `lib/recovery/`. The shared helper lands in `lib/`
rather than staying under `components/admin/` because non-component callers (role sync in
`contexts/`, purchase preflight) consume it.

## Phase 1 Design Summary

**Entities** — see [data-model.md](./data-model.md). Five: environment cohort, membership reference
chain, chain read result, scoped chain, per-chain authority.

**Module contracts** — see [contracts/](./contracts/). Three, each stating a rule that must hold at a
seam rather than describing an implementation:

- [`estate-read.md`](./contracts/estate-read.md) — every estate read returns a three-state result;
  aggregation refuses cross-unit sums and labels partial totals.
- [`membership-chain.md`](./contracts/membership-chain.md) — one resolver, cohort-derived, not
  runtime-configurable.
- [`view-scope.md`](./contracts/view-scope.md) — the contract each converted view honours: scope
  independent of wallet, writes gated on wallet chain *and* per-contract authority, unreadable never
  rendered as zero.

**Validation** — see [quickstart.md](./quickstart.md).

## Rollout

Sequenced per research R8 so each step ships independently and the incident-response paths convert
last, on a pattern already proven by eight earlier views:

1. Foundation (`lib/chains/`, `membershipChainId()`) — no user-visible change.
2. Console entry + permissions card (US2).
3. Membership resolution + purchase routing (US1, US5).
4. Overview and fee reporting (US3).
5. Read-mostly views, then write-heavy views (US4).
6. Emergency and Account Moderation last.

## Complexity Tracking

> No constitution violations. This section is intentionally empty.

Two simplifications are worth recording, since both remove code rather than add it:

- The estate helper is **moved**, not written. `liquidityAdminCommon.js` keeps re-exporting it, so
  the two converted tabs and their 55 existing tests are untouched.
- Membership resolution changes in **two resolver functions**, not at six call sites, because the
  callers already funnel through them (research R3).
