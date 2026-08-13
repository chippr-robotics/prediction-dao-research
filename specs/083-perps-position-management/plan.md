# Implementation Plan: Perps Position Management

**Branch**: `claude/perps-position-management-phase1` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/083-perps-position-management/spec.md`

## Summary

Turn the spec-082 read-only Perps view into a **position management surface**: close, reduce,
protect (stop-loss / take-profit), open, and recover stuck orders on **Gains Network** and
**GMX v2**, all through bottom sheets with smart defaults. Hyperliquid stays read-only with an
honest "manage on the venue" link (research D12).

The defining architectural fact: **no Solidity ships.** Both EVM venues assign position ownership
from `msg.sender` with no owner parameter, so any FairWins contract in the path would own the
member's position (research D1). Every call is therefore **member-direct**: the member's own wallet
is `msg.sender`, FairWins builds calldata and nothing else. Fees ride each venue's **own**
mechanism — GMX's `uiFeeReceiver` and (when HL ships) Hyperliquid's builder codes — at
**5 bps of notional**, computed by the venue *at execution* so a cancelled order carries no fee
(research D2/D3).

On-chain work is two transactions, not a deployment: register `perps.hyperliquid.builder` on the
Polygon FeeRouter (already in the launch table, registered nowhere) and call `setUiFeeFactor` on
GMX's Arbitrum DataStore to self-register FairWins' UI fee. Decision log: [research.md](research.md).

## Technical Context

**Language/Version**: JavaScript ESM — Node ≥20 (gateway), Node ≥22 + React 19 (frontend)

**Primary Dependencies**: **none new.** Venue calldata is built against hand-maintained ABI
fragments with ethers v6 `Interface` (research D13 — the GMX SDK is BUSL-1.1 and would also touch
the lockfile and bundle). Chain reads go through the existing `getReadProvider` / spec-069 endpoint
resolution; writes through the existing `WalletContext.sendCalls` rail selector.

**Storage**: none persistent beyond the existing synced-object conventions; the jurisdiction
attestation records a versioned acknowledgement in device-scoped storage alongside the entry-gate
record.

**Testing**: Vitest + Testing Library + vitest-axe (frontend); node:test/Vitest with injected fetch
(gateway); Cypress fast-tier for the close path and honest-absence; the spec-081 Playwright capture
harness for the actor-critic visual pass.

**Target Platform**: frontend SPA (Vite) + the existing relay-gateway read proxy.

**Project Type**: web application — `frontend/` + `services/relay-gateway/`; **no `contracts/`
changes**, no subgraph changes.

**Performance Goals**: a member can close a position in ≤30s with one signature (SC-001); venue
state reads are cached and per-venue isolated so one slow venue never blocks a sheet.

**Constraints**: member is always `msg.sender` (FR-001); never report execution on inclusion
(FR-007); exits never gated (FR-014/FR-015/SC-004); fee only via venue rails, computed at execution
(FR-010); no hardcoded bps and each rate read from its enforcing contract (FR-011/FR-024); zero rate
⇒ no fee line (FR-012); Hyperliquid presents no dead management control (FR-021); terms name
leveraged derivatives before enablement (FR-025).

**Scale/Scope**: ~2 venue calldata modules, ~6 supporting lib modules, ~3 hooks, ~4 sheet/list
components, gateway position-reference passthrough, admin fee surface, 2 ops transactions, docs,
and the test + visual suites.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` — PASS.*

- **I. Security-First Smart Contracts**: PASS — and the strongest possible form of it: `contracts/`
  is untouched, so there is no new value-bearing surface at all. The research established that the
  contract we might have written would have been a custody bug (D1); the plan encodes that as a
  forbidden pattern with a grep-able test (SC-005). The two on-chain actions are a one-shot service
  registration and a self-registration of our own fee receiver, both on audited existing contracts.
- **II. Test-First and Comprehensive Coverage**: PASS — calldata-ownership assertions, unit
  conversions at venue ceilings, every terminal state transition, exit-reachability under every
  restriction, sheet states, axe, and an e2e close path. Failure and edge paths (frozen, timed-out,
  partial fill, wrong index space) are first-class test cases.
- **III. Honest State**: PASS — the async state machine (D7/D8) is the centrepiece: inclusion is
  never execution, pre-execution values are labelled, venue reasons are surfaced verbatim, degraded
  venues are named, and Hyperliquid's absence of management is stated rather than stubbed.
- **IV. Fail Loudly in CI**: PASS — new suites join existing gates; no `continue-on-error`.
- **V. Accessible, Consistent Frontend**: PASS — reuses the canonical `.asset-sheet-*` shell with
  its focus/dismissal semantics, axe in both themes, and the existing style-kit tokens.

**Complexity note**: this plan *removes* the complexity the sprint was expected to add (a UUPS
router, its deploy script, storage-layout gating, and a security review) by establishing that it
was unsafe. No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```
specs/083-perps-position-management/
├── spec.md
├── plan.md
├── research.md
├── tasks.md
├── checklists/requirements.md
├── contracts/
│   ├── venue-calldata.md        # exact calls, ownership fields, approval targets, index spaces
│   ├── order-state-machine.md   # states, events, terminal transitions, what must never be claimed
│   ├── fee-rails.md             # units, ceilings, authorities, disclosure rules
│   └── gateway-perps-api.md     # /v1/perps/* routes + DTOs (supersedes 082's for the response shape)
└── screenshots/                 # actor-critic visual record
```

### Source Code (repository root)

```
frontend/src/
├── abis/perps/{gainsDiamond,gmxExchangeRouter,gmxReader,gmxDataStore}.js   [NEW] fragments only
├── config/perps.js                                   [MODIFY] venue addresses, capabilities, flags
├── lib/perps/
│   ├── venues/gains.js                               [NEW] calldata + decoders + index spaces
│   ├── venues/gmx.js                                 [NEW] calldata + Reader decode + uiFee
│   ├── feeUnits.js                                   [NEW] bps ↔ venue units (D5)
│   ├── orderState.js                                 [NEW] the async state machine (D7)
│   ├── validation.js                                 [NEW] refuse-before-prompt validators
│   ├── defaults.js                                   [NEW] smart default selection
│   ├── attestation.js                                [NEW] versioned jurisdiction/risk record
│   ├── venueStatus.js                                [NEW] live open/close-only/paused per venue
│   ├── format.js / perpsCopy.js / linkouts.js        [MODIFY] new terms + copy
├── hooks/
│   ├── usePerpsTrade.js                              [NEW] submit → pending → terminal
│   ├── usePerpsOrders.js                             [NEW] pending + stuck orders
│   └── usePerpsPositions.js                          [MODIFY] venue refs + GMX Reader reads
├── components/perps/
│   ├── PositionSheet.jsx                             [NEW] manage: close / reduce / protect
│   ├── OpenPositionSheet.jsx                         [NEW] open with smart defaults
│   ├── PerpsPendingOrders.jsx                        [NEW] stuck-order recovery
│   ├── PerpsAttestation.jsx                          [NEW] jurisdiction + leverage risk
│   ├── PerpsView.jsx / PerpsPositions.jsx            [MODIFY] wire the sheets, drop FR-018 note
│   └── Perps.css                                     [MODIFY] sheet styles
├── components/admin/PerpsFeesPanel.jsx               [NEW] both rails, authority named
└── test/perps/*                                      [NEW/MODIFY] suites incl. axe

services/relay-gateway/src/perps/
├── normalize.js                                      [MODIFY] carry venue refs (indices/keys)
└── routes.js                                         [MODIFY] expose refs; venue status passthrough

scripts/ops/
├── register-perps-fee-service.js                     [NEW] one-shot Polygon registration
└── set-gmx-ui-fee-factor.js                          [NEW] GMX self-registration on Arbitrum

frontend/src/legal/                                   [MODIFY] name leveraged derivatives (FR-025)
docs/developer-guide/perps.md                         [MODIFY] management + rails + runbook links
docs/runbooks/perps-operations.md                     [NEW]
```

**Structure Decision**: frontend-led with a thin gateway change. All venue writes are built and
signed client-side because the member must be `msg.sender`; the gateway keeps its read-proxy role
and gains only the venue references the client needs to act on a position.

## Phased Delivery

1. **Foundations** — ABIs, venue calldata modules, fee units, order-state machine, validation,
   defaults, venue status. Pure logic, fully unit-tested, no UI.
2. **Exit first (US1, US4)** — position sheet with close/reduce, pending/stuck order recovery.
   Ships the safety-critical path before anything that creates exposure.
3. **Protection (US2)** — stop-loss / take-profit within the same sheet.
4. **Entry (US3)** — open sheet with smart defaults, attestation gate, screening, fee disclosure.
5. **Administration + ops (US5)** — admin fee surface, the two on-chain transactions, runbook.
6. **Polish** — activity/reporting, docs, e2e, actor-critic visual pass, legal text.

Ordering is deliberate: **exits and recovery ship before entries**, so no member can ever hold a
position this app created but cannot manage.

## Risks

| Risk | Mitigation |
|---|---|
| Gains' two index spaces confused | Distinct named types in `venues/gains.js`, never raw numbers across a boundary; tests assert a trade index is rejected by the recovery builder |
| GMX approval target mistaken for ExchangeRouter | Approval target pinned in config with a comment and asserted in calldata tests |
| Fee unit off-by-10× | Single conversion module, both-direction tests at venue ceilings (D5) |
| ExchangeRouter address churn | Pinned per chain in config, resolved at call time, re-verified on GMX releases (D13) |
| Reporting success on inclusion | The state machine is a tested module, not per-component logic; a test asserts no path maps inclusion to executed |
| Terms not amended before enablement | Feature flag defaults off; enabling is gated on the legal text landing (FR-025) |
