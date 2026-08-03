# UI Contract: Unified My Account view

The externally observable behavior of `/wallet?tab=account`. Consumed by the
Vitest suites named per item; IDs referenced from tasks.md.
Amended 2026-08-03 (post-launch feedback): Portfolio is the default view, the
breakdowns moved to Stats, and the feed grew filter/search tools (F*).

## URLs

- **U1** `/wallet?tab=account` (and bare `/wallet`) → unified view,
  **Portfolio** view active (amended — was Activity).
- **U2** `/wallet?tab=account&view=activity` → Activity view active
  (`&view=portfolio` stays a valid explicit link to the default).
- **U3** `/wallet?tab=account&view=stats` → Stats view active.
- **U4** `/wallet?tab=account&view=<unknown>` → Portfolio view (fallback, no
  blank panel; amended — was Activity).
- **U5** `/wallet?tab=portfolio` → replaced-history redirect to U2.
- **U6** Drawer Quick Access "Portfolio" → navigates to U2's URL
  (`pathForNavItem('portfolio') === PORTFOLIO_PATH`).
- **U7** Switching views rewrites `?view=` with `replace`; the default view
  removes the param.

## Carousel (C)

- **C1** One card per `useAccountSwitcher().accounts` entry, in order
  (personal first, vaults, then recovered), inside a labelled
  `role="listbox"`; each card is a `role="option"` with
  `aria-selected={isActive}`.
- **C2** Card content: blockies avatar, label, kind chip
  (Personal/Multisig/Recovered), shortened address; vault cards add the
  network name from strict `NETWORKS[chainId]` lookup (`Chain <id>` when
  unknown).
- **C3** Selecting a non-active personal/vault card calls `choose(acc)`
  exactly once; selecting the already-active card does not call `choose`.
- **C4** Selecting a recovered card calls `choose(acc)` (which opens the
  unlock dialog via `unlockEntry`); the dialog's `onClose` clears it without
  switching; `onUnlocked` completes the switch.
- **C5** With >1 account: previous/next arrows (desktop) and one dot per
  account render; with exactly 1 account neither renders.
- **C6** The active marker follows `currentId` even when the switch happened
  in the WalletButton dropdown (both read the same hook).
- **C7** (amended) The ACTIVE card shows the portfolio total (`Total
  balance`) once the shared portfolio instance is `ready`; no balance line
  renders while loading (never a fabricated $0), and non-active cards carry
  none.
- **C8** (amended) Cards use theme surface tokens with a per-kind accent
  (light + dark aware); position dots are minimal (≈6px visual) with a padded
  touch target, pinned against the app-wide button/tap-target CSS.

## Views (V)

- **V1** Activity view = FreshnessIndicator + RecentActivityFeed (ledger
  entries), preserving the existing unsupported-network and no-activity
  EmptyStates. (Amended: the breakdowns moved to V3.)
- **V2** Portfolio view = existing `PortfolioPanel` (its own loading/error/
  disconnected states, asset detail sheet, disclosures), fed the view-owned
  portfolio instance.
- **V3** Stats view = FreshnessIndicator + SummaryTiles + PnlChart +
  ActivityBreakdowns (amended: by-status / by-token / by-resolution live
  here) with the same EmptyStates as V1.
- **V4** Wallet utilities (QR / disconnect) render below every view.
- **V5** Exactly one view switcher is visible at any width: SectionIconNav
  (≤768px, fed `ACCOUNT_VIEWS` while the Account tab is active) or the
  in-panel `role="tablist"` strip (>768px, hidden by CSS below).

## Acting account (A)

- **A1** When `useEffectiveAccount().isActingAccount`, MyAccountView passes
  `{ accountAddress }` to `useAccountStats`; otherwise it passes nothing.
- **A2** `useAccountStats({ accountAddress })` scopes wager list, ledger
  entries, stable balance, and summary math to that address.
- **A3** With an acting override, the Wallet Balance tile's native amount
  comes from a direct `provider.getBalance(accountAddress)` read — never the
  wallet context's connected-wallet balance.
- **A4** Changing the effective address clears held balances before the next
  load (no cross-account stale figures).

## Feed tools (F) — amended 2026-08-03

- **F1** The class filters (All activity / Wagers / Transfers / Earn / Pools /
  Membership) live behind a Filter button: `aria-haspopup="menu"`, options as
  `role="menuitemradio"` with `aria-checked`; picking one closes the menu and
  the active class shows on the button.
- **F2** A Search icon toggles a search field (focused on open) that matches
  entries by kind/label, class, token symbol, amount (raw or USD-formatted),
  tx hash, status, or failure reason; collapsing the field clears the query.
- **F3** A filter/search combination with no matches shows a "no matching
  activity" state distinct from the no-history empty state.

## Portfolio freshness (P) — amended 2026-08-03

- **P1** A remount for an account+scope already read this session hydrates
  the last real snapshot immediately (status `ready`, original `lastUpdated`)
  while a background refresh runs.
- **P2** Snapshots are keyed by account + scan scope: switching accounts or
  toggling testnet visibility can never render another key's data.
- **P3** The cache is session-memory only (bounded, LRU-ish); a reload starts
  cold.

## Accessibility (X)

- **X1** axe: no violations on the unified view with populated stats (ports
  the AccountDashboard axe gate).
- **X2** Arrows, dots, cards, tabs, and bottom-nav items are buttons with
  accessible names; the tab strip uses `role="tablist"`/`role="tab"`/
  `aria-selected`; view panels are `role="tabpanel"` with labels.
