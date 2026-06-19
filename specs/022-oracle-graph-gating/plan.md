# Implementation Plan: Oracle & Graph Network Gating

**Branch**: `claude/oracle-graph-network-gating-3r55fg` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-oracle-graph-gating/spec.md`

## Summary

Gate three frontend surfaces on per-network capability so users never enter a flow
their network cannot complete:

1. **Oracle wager quick action** — the "Oracle Settles (1v1)" tile on the dashboard
   quick-select menu is disabled (shown, with an explanatory reason) on networks
   with no oracle resolution support.
2. **Reporting & advanced metrics** — the tax-report panel and the history-dependent
   sections of the account-stats dashboard are gated on whether the active network is
   configured for the indexing subgraph; on un-indexed networks they show a clear
   "requires indexing" explanation instead of an error or infinite spinner.
3. **Basic stats via direct chain reads** — on un-indexed networks the stats view
   still shows a bounded set of basic stats read directly from the chain (RPC),
   clearly labeled as basic, reusing the existing subgraph→RPC fallback pattern.

Technical approach: extract two small, pure, per-chain capability resolvers
(`hasOracleSupport(chainId)` and `isGraphConfigured(chainId)`) into the existing
config layer, then consume them in the dashboard quick actions, the
create-wager modal (so the button gate and the modal's oracle tabs share one
source of truth), the tax-report panel, and the account-stats hook/dashboard. No
smart-contract, ABI, or subgraph-schema changes.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18, Vite

**Primary Dependencies**: React, react-router-dom, wagmi (chain id), ethers v6
(direct RPC reads), The Graph (subgraph, existing). No new dependencies.

**Storage**: None added. Reads on-chain state via RPC and indexed state via the
existing subgraph. Module-scoped in-memory caches already used by `useSiteStats`.

**Testing**: Vitest + Testing Library (`npm run test:frontend`); axe/Lighthouse
accessibility checks in CI.

**Target Platform**: Browser SPA (frontend only).

**Project Type**: Web application — frontend (`frontend/`). No backend/contract work.

**Performance Goals**: Gating decisions are synchronous, config-only (no chain
calls) so they are free during render. Basic-stat RPC reads bounded to a single
cheap call (`nextWagerId()`) per chain, cached for 60s (existing `useSiteStats`
pattern); honest progress/empty state within a few seconds (SC-004).

**Constraints**: All gating and stats MUST be scoped to the active network with no
cross-network leakage (constitution III). UI MUST NOT imply finality the chain has
not reached and MUST distinguish "not configured" from "temporarily unavailable".
Disabled controls MUST meet WCAG 2.1 AA (constitution V).

**Scale/Scope**: 4 supported chains today (137, 80002, 63, 1337). ~3 user stories,
~16 functional requirements. Touches the dashboard quick actions, create-wager
modal, tax-report panel, and account-stats hook/dashboard, plus two new config
resolvers and their tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)**: No `contracts/` changes —
  this is frontend-only gating. The oracle-resolution path itself is unchanged; we
  only prevent the UI from launching it where no adapter is configured. **PASS (N/A
  for on-chain code).**
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)**: New pure
  resolvers and gated components get Vitest unit/integration coverage, including the
  enabled/disabled and indexed/un-indexed branches and the RPC-fallback path.
  **PASS.**
- **III. Honest State, No Mocks/Placeholders**: Basic stats come from real on-chain
  reads (no mocks); gating reflects real per-chain configuration; stats are scoped
  to the active chain (reusing the per-chain cache pattern). "Not configured" is
  distinguished from "temporarily unavailable" so the UI never implies finality or
  coverage it lacks. **PASS — and central to the design.**
- **IV. Fail Loudly in CI**: No `continue-on-error` added; lint/test/build/a11y
  gates remain enforcing. **PASS.**
- **V. Accessible, Consistent Frontend**: The disabled oracle tile uses real
  `disabled` semantics with an accessible name/`aria-disabled` and a discoverable
  reason; the "requires indexing" and basic-stats states use honest, labeled empty
  states. Chain config/addresses come from the synced config layer, never
  hardcoded. axe/Lighthouse must pass. **PASS.**

**Result**: All gates pass. No deviations → **Complexity Tracking not required.**

Post-Phase 1 re-check: design adds only two pure config resolvers and reuses
existing UI/state patterns (capability gates, `useSiteStats` fallback). No new
architecture, no new dependencies, no constitution conflicts. **Still PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/022-oracle-graph-gating/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── capability-resolvers.md   # hasOracleSupport / isGraphConfigured contracts
│   └── basic-stats-source.md     # RPC basic-stats read contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── config/
│   │   ├── networks.js                 # source of truth for chains + capabilities
│   │   ├── contracts.js                # getContractAddressForChain (oracle adapters)
│   │   ├── networkCapabilities.js      # per-chain feature descriptors (oracle tags)
│   │   └── subgraph.js                  # NEW: getSubgraphUrl(chainId)/isGraphConfigured(chainId)
│   ├── lib/
│   │   └── network/
│   │       └── oracleSupport.js        # NEW: hasOracleSupport(chainId) shared resolver
│   ├── hooks/
│   │   ├── useAccountStats.js          # EDIT: graph-vs-RPC mode, basic-stats path
│   │   ├── useSiteStats.js             # REUSE: existing subgraph→RPC fallback pattern
│   │   └── useChainTokens.js           # REUSE: active chainId + capabilities
│   ├── components/
│   │   ├── fairwins/
│   │   │   ├── Dashboard.jsx           # EDIT: disable oracle quick action + reason
│   │   │   └── FriendMarketsModal.jsx  # EDIT: consume shared hasOracleSupport
│   │   ├── account/
│   │   │   └── AccountDashboard.jsx    # EDIT: basic-vs-advanced rendering + labels
│   │   ├── wallet/
│   │   │   └── TaxReportsPanel.jsx     # EDIT: gate report generation on indexing
│   │   └── ui/
│   │       └── ChainCapabilityGate.jsx # REUSE: pattern for capability-gated regions
│   └── test/
│       ├── network/                    # NEW: resolver unit tests
│       ├── account/                    # EDIT/ADD: basic-vs-advanced stats tests
│       └── reports/                    # EDIT/ADD: indexing-gate tests
└── .env.example                        # EDIT: document per-chain subgraph resolution
```

**Structure Decision**: Web application, frontend-only. New logic lands as two
small pure modules in the existing `config/` and `lib/network/` layers so it is unit
-testable in isolation and reused by every consumer (dashboard, modal, reports,
account stats), preventing the gating logic from drifting between surfaces.

## Complexity Tracking

> No constitution violations — section intentionally empty.
