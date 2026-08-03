# UI Contract: Unified My Account view

The externally observable behavior of `/wallet?tab=account`. Consumed by the
Vitest suites named per item; IDs referenced from tasks.md.

## URLs

- **U1** `/wallet?tab=account` (and bare `/wallet`) → unified view, Activity
  view active.
- **U2** `/wallet?tab=account&view=portfolio` → Portfolio view active.
- **U3** `/wallet?tab=account&view=stats` → Stats view active.
- **U4** `/wallet?tab=account&view=<unknown>` → Activity view (fallback, no
  blank panel).
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

## Views (V)

- **V1** Activity view = FreshnessIndicator + ActivityBreakdowns +
  RecentActivityFeed (ledger entries), preserving the existing
  unsupported-network and no-activity EmptyStates.
- **V2** Portfolio view = existing `PortfolioPanel` unchanged (its own
  loading/error/disconnected states, asset detail sheet, disclosures).
- **V3** Stats view = FreshnessIndicator + SummaryTiles + PnlChart with the
  same EmptyStates as V1.
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

## Accessibility (X)

- **X1** axe: no violations on the unified view with populated stats (ports
  the AccountDashboard axe gate).
- **X2** Arrows, dots, cards, tabs, and bottom-nav items are buttons with
  accessible names; the tab strip uses `role="tablist"`/`role="tab"`/
  `aria-selected`; view panels are `role="tabpanel"` with labels.
