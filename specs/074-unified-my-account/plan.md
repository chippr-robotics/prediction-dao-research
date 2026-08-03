# Implementation Plan: Unified My Account Experience

**Branch**: `claude/unified-assets-my-account-070n9e` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/074-unified-my-account/spec.md`

## Summary

Reshape the Account tab body (`/wallet?tab=account`) into the unified My
Account experience: an account-card carousel on top (one card per account the
member can act as — personal, multisig vaults, recovered legacy accounts;
selecting a card switches the app-wide acting account through the same seam as
the WalletButton dropdown), and a three-view lower half (Activity / Portfolio /
Stats) switched by a mobile bottom nav / desktop tab strip and deep-linked via
`?view=`. The standalone `?tab=portfolio` deep link redirects into the unified
view. Frontend-only: no contracts, no gateway, no new dependencies.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 + Vite (existing frontend)

**Primary Dependencies**: react-router-dom (URL-driven views), ethers (balance
read in `useAccountStats` override), Recharts (existing, lazy-loaded P&L chart).
No new packages — the carousel is CSS scroll-snap.

**Storage**: none new. Account list sources stay as-is (custody vault
references, encrypted legacy key vault); active account stays per-session in
`CustodyContext` (never persisted).

**Testing**: Vitest + Testing Library + vitest-axe (`frontend/src/test/…`),
scoped runs locally (full suite OOMs locally — CI only, per CLAUDE.md).

**Target Platform**: Web (mobile-first PWA + desktop), light + dark themes,
all tenants (spec 072 — no tenant-identity values hardcoded).

**Project Type**: Web frontend (existing `frontend/` app).

**Performance Goals**: no new polling loops; reuse the existing 60s stats poll
and portfolio poll; carousel scroll is native (no JS animation loops beyond a
rAF-throttled scroll listener).

**Constraints**: honest state everywhere (constitution III): unsupported
network / empty / loading / error states preserved per view; acting-account
figures must never silently fall back to connected-wallet figures; recovered
accounts must unlock before activating (spec 062).

**Scale/Scope**: one page body reshaped; 2 new components + 1 nav-model
extension + 1 hook option; ~6 test files touched/added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-first contracts**: PASS — no `contracts/` changes. The one
  security-adjacent path (activating a recovered account) reuses the existing
  spec-062 unlock dialog and in-memory signer seam unchanged.
- **II. Test-first / coverage**: PASS — Vitest coverage for the new components
  (carousel, unified view), the hook override, the nav-model change, and the
  redirect; existing AccountDashboard/axe coverage is ported, not dropped.
- **III. Honest state**: PASS — each view keeps its existing honest states;
  the stats hook's acting-account override reads the acting account's own
  native/stable balances (never relabels connected-wallet balances); account
  switch clears prior balances instead of showing stale figures.
- **IV. Fail loudly in CI**: PASS — no CI changes.
- **V. Accessible, consistent frontend**: PASS — carousel is a labelled
  listbox with keyboard-reachable cards/arrows/dots; view switcher is a
  `role="tablist"` (desktop) and the established SectionIconNav (mobile); axe
  test included. Styling via existing theme tokens (light-literal fallbacks).

No violations → Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/074-unified-my-account/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (UI contract)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── config/
│   └── appNav.js                          # + ACCOUNT_VIEWS / ACCOUNT_DEFAULT_VIEW /
│                                          #   accountViewFromParam / PORTFOLIO_PATH;
│                                          #   pathForNavItem('portfolio') → PORTFOLIO_PATH
├── components/
│   ├── nav/NavIcon.jsx                    # + 'clock' icon (Activity view)
│   └── account/
│       ├── AccountCardsCarousel.jsx/.css  # NEW — the account card carousel
│       ├── MyAccountView.jsx/.css         # NEW — unified Account tab body
│       ├── AccountDashboard.jsx/.css      # REMOVED (role replaced by MyAccountView)
│       └── index.js                       # barrel updated
├── hooks/
│   └── useAccountStats.js                 # + { accountAddress } acting override
└── pages/
    └── WalletPage.jsx                     # account branch → MyAccountView;
                                           # portfolio tab removed + TAB_REDIRECTS entry;
                                           # bottom SectionIconNav carries ACCOUNT_VIEWS
                                           # while the Account tab is active

frontend/src/test/
├── account/MyAccountView.test.jsx         # NEW — view switching, deep links, acting scope
├── account/MyAccountView.axe.test.jsx     # ports AccountDashboard.axe coverage
├── account/AccountCardsCarousel.test.jsx  # NEW — cards, selection, unlock, sync
├── account/useAccountStats.acting.test.jsx# NEW — accountAddress override
├── AppNavDrawer.test.jsx                  # Portfolio quick-access routes to new path
├── WalletPage.test.jsx                    # account-tab body assertions updated
└── collectibles/walletPageCollectibles.test.jsx  # ?tab=portfolio redirect assertions
```

**Structure Decision**: existing single-frontend layout; all changes live in
`frontend/src` beside the seams they extend.

## Design decisions (from research.md)

- **R1 — carousel data + selection**: `useAccountSwitcher()` is the single
  source (accounts, currentId, choose, unlock plumbing) so the carousel and
  the WalletButton dropdown cannot disagree. `LegacyUnlockDialog` mounts next
  to the carousel exactly as it does next to the dropdown.
- **R2 — scroll mechanics**: native horizontal scroll + CSS `scroll-snap`
  (no swiper dependency); arrows/dots layered on top; rAF-throttled scroll
  listener tracks the nearest card for the indicators.
- **R3 — lower-half views**: `?view=` on the Account tab (PayTransferPanel
  idiom) with ids defined once in `config/appNav.js` (`ACCOUNT_VIEWS`), so
  WalletPage's bottom bar and the panel share one list. Default `activity`.
- **R4 — acting-account stats**: extend `useAccountStats` with
  `{ accountAddress }` mirroring `usePortfolio`; the override also reads the
  acting account's native balance directly (the wallet context's native
  balance belongs to the connected wallet) and clears balances on account
  switch. Portfolio already follows `useEffectiveAccount` (spec 063).
- **R5 — portfolio unification**: `?tab=portfolio` joins `TAB_REDIRECTS`
  (the spec-073 mechanism) → `/wallet?tab=account&view=portfolio`;
  `PORTFOLIO_ITEM` keeps its id and routes there via `pathForNavItem`.
- **R6 — mobile vs desktop switcher**: SectionIconNav (mobile-only by design)
  carries the three views while the Account tab is active; MyAccountView's
  own `role="tablist"` strip is hidden ≤768px so exactly one switcher renders
  at any width.

## Complexity Tracking

No constitution violations; table not required.
