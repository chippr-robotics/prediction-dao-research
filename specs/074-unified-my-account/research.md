# Research: Unified My Account Experience

All unknowns were resolved by reading the existing frontend seams; no external
research was required (frontend-only feature, no new dependencies).

## R1 — Account list + switching seam

**Decision**: Source the carousel from `useAccountSwitcher()`
(`frontend/src/hooks/useAccountSwitcher.js`) and switch with its `choose(acc)`;
mount `LegacyUnlockDialog` beside the carousel wired to its
`unlockEntry`/`setUnlockEntry`/`onUnlocked`.

**Rationale**: That hook already composes the exact account list the feature
needs — personal wallet + `useCustodyVaults()` vaults + `useLegacyAccounts()`
recovered accounts — and is what the WalletButton dropdown uses. Both surfaces
reading the same hook and writing through the same `CustodyContext` operations
(`operateAsPersonal` / `operateAsVault` / `operateAsLegacy`) makes FR-004's
"the two surfaces always agree" structural rather than synchronized.
`currentId` gives the active card marker for switches made anywhere.

**Alternatives considered**: a new context or a lifted copy of the account
list — rejected: a second source of truth is exactly how the surfaces would
drift apart; the spec's premise is removing split views.

## R2 — Carousel mechanics

**Decision**: Native horizontal scrolling `<ul>` with CSS
`scroll-snap-type: x mandatory`, cards as snap-aligned `<li role="option">`
buttons inside a labelled `role="listbox"`. Previous/next arrow buttons
(hidden ≤768px, where swiping is natural) and position dots layered on top; a
rAF-throttled scroll listener finds the nearest card for the indicators;
`scrollTo({ behavior: 'smooth' })` with a `scrollLeft` fallback (jsdom).

**Rationale**: No dependency, GPU-composited native scrolling, correct touch
behavior for free, and trivially testable. The repo has no existing carousel
(only orphaned CSS in `MarketPage.css` — nothing imports it); patterns for
tabs/pills exist but not for swipe.

**Alternatives considered**: embla/swiper (new dependency for one surface —
rejected, constitution "simplicity"); transform-based JS carousel (re-implements
what native scroll already does, worse touch behavior — rejected).

## R3 — Lower-half view switching + deep links

**Decision**: Drive the three views by `?view=` on the Account tab, ids
defined once as `ACCOUNT_VIEWS` in `config/appNav.js` with
`accountViewFromParam()` (unknown/missing → `activity`). MyAccountView writes
the param with `setSearchParams(..., { replace: true })`; the default view
deletes the param.

**Rationale**: This is the established idiom (`PayTransferPanel` `?view=`,
"the EarnPanel idiom") — direct links and back/forward work with zero new
routing. Defining the ids in `appNav.js` keeps WalletPage's bottom bar and
the panel from drifting (same reasoning as `WAGERS_VIEW`).

**Alternatives considered**: local component state (not deep-linkable —
violates FR-008); new routes (`/account/portfolio`) — rejected: the page is
`?tab=`-addressed everywhere else and saved-link parity matters here.

## R4 — Acting-account data for Stats/Activity

**Decision**: Add an optional `{ accountAddress }` to `useAccountStats`,
mirroring `usePortfolio`'s existing override: all address-scoped reads (wager
list, ledger entries, stable balance, summary math) use
`accountAddress ?? connectedAddress`. When overriding, additionally read the
acting account's native balance via `provider.getBalance` (the wallet
context's `balances.native` belongs to the connected wallet) and clear held
balances whenever the effective address changes so a switch never shows the
previous account's figures (FR-009). MyAccountView passes the address from
`useEffectiveAccount()` only when `isActingAccount`.

**Rationale**: `usePortfolio({ accountAddress })` set this exact pattern
(spec 063) and `PortfolioPanel` already follows the acting account; the stats
hook was the one surface not migrated. Reads are address-scoped subgraph/RPC
queries, so they work for any address.

**Alternatives considered**: reading `useEffectiveAccount` inside the hook —
rejected: the hook is used in contexts (WalletPage tests, other callers) that
mock at the hook boundary; an explicit option keeps it pure and matches the
portfolio precedent. Leaving stats wallet-bound and disclosing "personal
wallet only" — rejected: FR-009 is the point of the feature.

## R5 — Portfolio tab unification

**Decision**: Remove the standalone `portfolio` entry from `WALLET_TABS`, add
`portfolio: PORTFOLIO_PATH` to WalletPage's `TAB_REDIRECTS`
(`/wallet?tab=account&view=portfolio`), and point `pathForNavItem('portfolio')`
at `PORTFOLIO_PATH` so the drawer's Quick Access entry lands on the unified
view. `PORTFOLIO_ITEM` keeps its id (`portfolio`) and icon.

**Rationale**: `TAB_REDIRECTS` is the established mechanism for "a tab that
left this page" (spec 073's `tokens`/`clearpath`); a redirect with `replace`
keeps Back working and satisfies FR-010 for bookmarks. The nav item keeps its
identity so drawer tests/ordering and tenant gating are untouched.

**Alternatives considered**: keeping `?tab=portfolio` rendering alongside the
account view — rejected: perpetuates the split view the spec removes; alias
via `TAB_ALIASES` — rejected: aliases map tab→tab and cannot carry `?view=`.

## R6 — Mobile bottom nav vs desktop tab strip

**Decision**: While the Account tab is active, WalletPage feeds
`SectionIconNav` (already mounted, mobile-only, ≥2 items) the `ACCOUNT_VIEWS`
items with the current view id; MyAccountView renders its own
`role="tablist"` strip hidden at ≤768px via CSS. Exactly one switcher is
visible at any width (FR-007).

**Rationale**: `groupForTab('account')` is deliberately `null`, so the bottom
bar is unused on the Account tab today — the views slot in without competing
with section siblings. SectionIconNav already implements the pill indicator,
labels, and a11y; the strip reuses the `pt-tabs` pattern.

**Alternatives considered**: a second fixed bottom bar inside MyAccountView —
rejected: two fixed bars (or a bar fighting SectionIconNav's slot) on other
tabs' layouts; a floating pill nav like the reference mock — rejected as new
chrome inconsistent with the app's established bottom-bar pattern.

## R7 — What the cards show

**Decision**: Identity only — avatar (blockies), label, kind chip
(Personal / Multisig / Recovered), shortened address, network name for vault
cards (strict `NETWORKS[chainId]` lookup, `Chain <id>` fallback), and an
Active marker. No per-card balances.

**Rationale**: Balances have one home in the lower half; per-card balances
would mean N accounts × M networks of extra RPC reads on page open, and an
unreachable network would force either a fake zero or a spinner on a card —
both dishonest (constitution III). Vault network naming uses the strict
lookup per the spec-068 rule (never `getNetwork()` fallback).

**Alternatives considered**: per-card stable balance for the active card only
— deferred; the Stats view's Wallet Balance tile already covers it.
