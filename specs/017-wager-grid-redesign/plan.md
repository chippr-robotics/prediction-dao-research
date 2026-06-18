# Implementation Plan: My Wagers — Card Grid Redesign

**Branch**: `claude/my-wagers-grid-redesign-kucfye` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-wager-grid-redesign/spec.md`

## Summary

Replace the table-based "My Wagers" list (`MarketsTable` inside `MyMarketsModal`)
with a responsive, expandable **card grid** matching the "Wager Grid" mockup,
while keeping the surface a **modal** and **retaining** the existing full detail
view behind a "View details" affordance (per Clarifications 2026-06-18). The
change is **frontend-presentation only**: it reuses the current data layer
(`useMyWagers` / `WagerRepository`), the decryption hooks, the activity watcher
badges, and every on-chain action handler already wired in `MyMarketsModal`
(accept, resolve, claim, refund, reclaim, respond-to-draw). The new grid is
introduced as `WagerCardGrid` (+ `WagerCard`) that consumes the **same prop
contract** the current `MarketsTable` receives, so call sites and behavior are
preserved; a compact/comfortable density toggle and pill-style tabs are added to
the existing header/toolbar.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 function components + hooks, JSX

**Primary Dependencies**: React 18, Vite; existing app modules only — `useMyWagers`,
`useLazyMarketDecryption`, `useLazyIpfsEnvelope`, `useWagerActivity(Optional)`,
`FriendMarketsContext`, `Badge`, `ethers` v6 (already used by action handlers).
No new runtime dependencies.

**Storage**: None persistent. Density preference is **session-scoped** (in-memory
component state, mirrored to `sessionStorage` so it survives reopening the modal
within a session). No contract, ABI, subgraph, or backend changes.

**Testing**: Vitest + React Testing Library (`frontend/src/test/`), Cypress E2E
(`frontend/cypress/e2e/{fast,full}`). Accessibility via existing axe/Lighthouse CI.

**Target Platform**: Modern web browsers, desktop + mobile widths; WCAG 2.1 AA.

**Project Type**: Web frontend (React + Vite) — single `frontend/` app.

**Performance Goals**: Smooth (≈60fps) expand/collapse and tab switches; no added
network calls on render (decrypt stays lazy/on-demand as today); existing
pagination (`useMyWagers`, 25/page) unchanged.

**Constraints**: Honest state (real token symbols/values, network-scoped data, no
implied finality); no `continue-on-error` on lint/test/build; ESLint clean;
keyboard-operable; reuse generated contract/network artifacts (no hardcoding).

**Scale/Scope**: One view (`MyMarketsModal`) across 4 tabs (Participating, Created,
Arbitrating, History), each paginated; per-user wager counts (tens, occasionally
hundreds).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Security-First Smart Contracts | No `contracts/` changes; no new on-chain calls or changes to authorization/fund-movement. Action handlers reused verbatim. | ✅ N/A |
| II. Test-First & Coverage | Frontend Vitest tests updated alongside the DOM change (table → cards); the 40 existing `MyMarketsModal` tests migrated; new tests for expand/collapse, decrypt-in-card, density, "View details", and per-state action visibility. Cypress fast/full flows that touch My Wagers updated. | ✅ Plan commits |
| III. Honest State, No Mocks | Mockup's mock data + "USDC" are reference-only; cards render real token symbols and live values from the existing data layer. Network scoping preserved (active-chain filter retained). Pending/expired/timeout states surfaced truthfully via existing status mapping. | ✅ |
| IV. Fail Loudly in CI | No `continue-on-error` added; lint/test/build remain blocking. | ✅ |
| V. Accessible, Consistent Frontend | WCAG 2.1 AA: tabs/cards/actions keyboard-operable with roles/labels; status conveyed by text+color (not color alone); axe/Lighthouse must pass. Contract/network config still sourced from generated artifacts. | ✅ |

**Result**: PASS — no violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/017-wager-grid-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (view-model shapes)
├── quickstart.md        # Phase 1 output (validation guide)
├── contracts/           # Phase 1 output (component prop contracts)
│   └── wager-card-grid.contract.md
├── design/
│   └── wager-grid.dc.html   # reference mockup (already present)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
frontend/src/
├── components/fairwins/
│   ├── MyMarketsModal.jsx        # MODIFY: header pills + toolbar (density), swap
│   │                             #   <MarketsTable/> → <WagerCardGrid/>; keep
│   │                             #   MarketDetailView, ResolutionModal, helpers
│   ├── WagerCardGrid.jsx         # NEW: grid container; same prop contract as
│   │                             #   MarketsTable; owns expand/collapse state
│   ├── WagerCard.jsx             # NEW: single collapsed/expanded card + actions
│   ├── MyMarketsModal.css        # MODIFY/extend: card grid + pill tabs + density
│   └── WagerCard.css             # NEW (optional): card-scoped styles
├── hooks/
│   └── (reused as-is: useMyWagers, useEncryption, useIpfs, useWagerActivity)
└── test/
    ├── MyMarketsModal.test.jsx   # MODIFY: table→card DOM expectations
    └── WagerCard.test.jsx        # NEW: card expand/decrypt/action-visibility units
```

**Structure Decision**: Single existing `frontend/` React app. The grid is
extracted into `WagerCardGrid` + `WagerCard` (mirroring how `MarketsTable` is a
sibling component in the same module today) so the 2,600-line `MyMarketsModal.jsx`
does not grow unbounded and the card logic is unit-testable in isolation. The new
grid accepts the **identical prop set** currently passed to `MarketsTable`
(markets, onSelect, status/time/outcome formatters, the action callbacks
`onAccept/onResolve/onClaim/onRefund/onClearExpired/...`, `claimingId/refundingId`,
errors, `statusFilter`, `account`, `showActions/showOutcome/showResolveCountdown`),
plus a `density` prop. `onSelect` (already wired to open `MarketDetailView`) backs
the new "View details" affordance, satisfying the "retain detail view" decision
with no new plumbing.

## Complexity Tracking

> No constitution violations — section intentionally empty.
