# Unified My Account view (spec 074)

The Account tab body (`/wallet?tab=account`, rendered by
`frontend/src/components/account/MyAccountView.jsx`) is the unified home for a
member's view of their accounts and assets: an **account card carousel** on
top and **one of three views** below — Activity, Portfolio, Stats.

## The account card carousel

`frontend/src/components/account/AccountCardsCarousel.jsx` renders one card
per account the member can act as — the personal wallet, every custody vault,
and every recovered legacy account.

- **Single source of truth**: the card list, the active marker, and the
  switch action all come from `useAccountSwitcher()` — the same hook the
  WalletButton dropdown uses. Both surfaces write through
  `CustodyContext` (`operateAsPersonal` / `operateAsVault` /
  `operateAsLegacy`), so they can never disagree. Do not build a second
  account list for a new surface; read this hook.
- **Recovered accounts unlock first** (spec 062): selecting a Recovered card
  routes through `choose(acc)` which opens `LegacyUnlockDialog`; only a
  successful unlock switches. Cancel/failure leaves the selection unchanged.
- **Mechanics**: native horizontal scroll + CSS `scroll-snap` — no carousel
  dependency. Arrows are the desktop/keyboard affordance (hidden ≤768px);
  dots track the nearest card. The card button itself is the
  `role="option"` inside a labelled `role="listbox"` — don't reintroduce an
  interactive wrapper (axe nested-interactive).
- **Theme-aware, and pinned against global button CSS**: cards render on the
  theme surface tokens with a per-kind accent edge (light + dark). The dots
  and cards use two-class selectors deliberately — App.css's mobile rule
  `button:not([role="switch"]) { min-width/min-height: 44px; padding: … }`
  outranks a single class and once inflated the dots into page-dominating
  circles. The dot is a 6px visual inside a ~22px `background-clip:
  content-box` touch target.
- **Cards show identity plus one number**: avatar, label, kind chip, short
  address, vault network (strict `NETWORKS[chainId]` lookup) — and on the
  ACTIVE card only, the portfolio total (`activeTotalUsd`), rendered only
  when the shared portfolio instance is `ready` (never a fabricated $0 while
  loading). Full balances still have one home — the views below.

## The three views

Defined once as `ACCOUNT_VIEWS` in `frontend/src/config/appNav.js`
(`portfolio` — default, `activity`, `stats`) and driven by `?view=` on the
Account tab (the PayTransferPanel idiom): `/wallet?tab=account&view=stats` is
a direct link; unknown values fall back to Portfolio via
`accountViewFromParam()`.

- **Portfolio** (default) — the existing `PortfolioPanel` (own honest states,
  asset detail sheet, disclosures), fed MyAccountView's shared portfolio
  instance via its optional `portfolio` prop (it self-loads without one).
- **Activity** — `FreshnessIndicator` + `RecentActivityFeed`: a clean feed.
  Class filters live behind the Filter button (menu of `menuitemradio`
  options) and search behind the Search icon (matches kind, token, amount,
  tx hash, failure reason); no matches → an honest "no matching activity"
  state.
- **Stats** — `SummaryTiles` + `PnlChart` + `ActivityBreakdowns` (the
  by-status / by-token / by-resolution groups are stats, not a log).

**Portfolio freshness**: `usePortfolio` keeps a snapshot cache keyed by
account + scan scope — session memory first, mirrored to device storage
(`fw_portfolio_snapshots_v1`, BigInt-safe, bounded, figures only — never key
material). A remount OR a page reload hydrates the last real snapshot
immediately (original `lastUpdated` intact, disclosed as "Updated … ago" in
the panel header) while a fresh read runs in the background; the 60s poll
keeps it current. Snapshots never cross accounts or the testnet-visibility
boundary. A genuinely cold load renders `PortfolioSkeleton` (the page's bones
with shimmer placeholders, aria-hidden behind a visually-hidden loading
status) rather than a bare loading line. MyAccountView mounts ONE portfolio
instance for the card total and the Portfolio view together, and it starts
warming as soon as My Account opens, whichever view is showing.

**Frozen account selection**: the carousel and desktop tab strip live in
`.my-account-sticky`, pinned below the site header while only the view
content scrolls. The offset is measured at runtime from the header's live box
(the header's height is not a constant). Two load-bearing details:
`.wallet-page` clips with `overflow: clip` and `.App` with
`overflow-x: clip` — switching either back to `hidden` creates a scroll
container and silently kills the stick.

The switcher renders exactly once per width: WalletPage feeds
`SectionIconNav` (the mobile bottom bar) the `ACCOUNT_VIEWS` items while the
Account tab is active, and MyAccountView's own `role="tablist"` strip is
hidden ≤768px in CSS. If you add a view, add it to `ACCOUNT_VIEWS` — both
switchers and the URL contract read that one list.

## Acting-account data

Every view follows the account the member is **acting as**:

- Portfolio already resolves `useEffectiveAccount()` internally (spec 063).
- Stats/Activity: `useAccountStats({ accountAddress })` — MyAccountView
  passes the acting address only when `isActingAccount`. The override scopes
  the wager list, ledger read, stable balance, and summary math to that
  address, reads the acting account's **native balance directly** via
  `provider.getBalance` (the wallet context's native balance belongs to the
  connected wallet), and clears held balances whenever the effective address
  changes — a switch must never show the previous account's figures.

## The Portfolio tab redirect

The standalone `?tab=portfolio` no longer exists: it lives in WalletPage's
`TAB_REDIRECTS` and lands on `PORTFOLIO_PATH`
(`/wallet?tab=account&view=portfolio`). `pathForNavItem('portfolio')` returns
the same path, so the drawer's Quick Access entry and any saved link agree.
Never link `?tab=portfolio` in new code — use `PORTFOLIO_PATH` from
`config/appNav.js`.

## Tests

```text
frontend/src/test/account/AccountCardsCarousel.test.jsx    # cards, selection, unlock gate
frontend/src/test/account/MyAccountView.test.jsx           # views, deep links, acting pass-through
frontend/src/test/account/MyAccountView.axe.test.jsx       # WCAG gate (ports the spec-020 axe gate)
frontend/src/test/account/useAccountStats.acting.test.jsx  # acting override honesty
```

Contract: `specs/074-unified-my-account/contracts/my-account-ui-contract.md`.
