# Design Brief: "My Account" Stats Dashboard — Wireframe Prompt

> **Hand-off prompt for the wireframe/design agent.** Everything the designer
> needs to know about FairWins, its data feeds, brand, and constraints is
> self-contained below. No repo access required.

---

## 1. The ask (one paragraph)

When a user opens the **My Account** page in FairWins, they should land on a
**stats dashboard** that makes their activity and balances feel alive: real-time
numbers, a **time-series graph** of their performance over time, and a few
high-signal summary tiles. Today this page is barely more than a wallet address
plus "Show QR Code" / "Disconnect Wallet" buttons (see *Current state* below).
We want to turn the default **Account** tab into a personal dashboard that is
**visually interesting, glanceable, and updates in near-real-time**, while
keeping the existing tabbed structure (Account / Membership / Network / Security
/ Preferences / Reporting / Swap) intact.

Deliver: a wireframe (and visual mock if you do those) for the **Account tab as a
stats dashboard**, responsive for **mobile-first** (the app is heavily used on
phones — see screenshot) and scaling up to desktop.

---

## 2. What FairWins is (context for the designer)

FairWins is a **peer-to-peer (P2P) wager / prediction platform**. Users connect
a Web3 wallet and stake crypto on **1-vs-1 wagers**: a *creator* proposes a wager
with a stake, an *opponent* accepts by matching a stake, and the outcome is
settled by an **oracle** (Polymarket, Chainlink, or UMA) or by mutual draw. The
winner claims the pooled payout. It's a real-money product, so honesty and
clarity matter — we never show fabricated numbers.

Key nouns the dashboard talks about:
- **Wager** — a single bet. Has a *creator* and *opponent*, two stakes, a token,
  a status, timestamps, and (once settled) a *winner*.
- **Stake** — the amount each side puts up (in a token like USDC or native MATIC).
- **Status** — `open` (awaiting opponent), `active` (both staked, live),
  `draw_proposed`, `resolved` (settled, has winner), `drawn`, `refunded`,
  `cancelled`, `declined`.
- **Balance** — what's in the user's connected wallet right now (native token +
  stablecoin + any other tokens).
- **Membership / Roles** — tiered access (Bronze/Silver/Gold/Platinum) to create
  and accept wagers.

The brand is **FairWins** — a **four-leaf-clover** logo, optimistic
"winning"/luck theme. Primary accent is a confident green; loss/risk is red.

---

## 3. Current state (what exists today)

Attached screenshot shows the live page at `fairwins.app/wallet`:
- Header: clover logo, dark/light toggle (moon icon), notification bell, avatar.
- Avatar (blockies) + shortened address `0x0e35...c0B2` + a green "connected" dot.
- A "Wallet" card: full address, **Show QR Code** (green) and **Disconnect
  Wallet** (red) buttons.
- A kebab (⋮) menu switches between tabs (Account, Membership, Network, Security,
  Preferences, Reporting, Swap).
- Footer: Terms, Risk Disclosure, Privacy Policy, Account Moderation, © 2026
  ChipprRobotics LLC.

The **Account** tab is the target. Keep the wallet address / QR / disconnect
affordances available (they can move into a compact "wallet" sub-card or a
secondary row), but the **hero of the page becomes the stats dashboard.**

---

## 4. The data we actually have (this is the important part)

Design **only** around data we can really show. Below is the full inventory of
feeds available to the frontend, grouped by what they can power. Field names are
real — use them to label tiles/axes accurately.

### A. Per-user wager history (`useMyWagers`)
Paginated list of the user's wagers (as creator OR opponent). Each item:
- `id`, `status`, `resolutionType` (oracle type)
- `creator`, `opponent` (addresses), `winner` (address or null)
- `creatorStake`, `opponentStake` (token base units), `token` (address)
- `createdAt`, `resolvedAt` (timestamps)
- Tabs/filters already exist: *participating* / *created* / *history*.

**Derivable per-user aggregates** (we can compute these client-side):
- **Total wagered** (sum of the user's stakes)
- **Win / loss record** and **win rate** (resolved wagers where `winner == me`)
- **Net P&L** (payouts + refunds − deposits), per token and overall
- **Active vs. settled** counts by `status`
- **Breakdown by token** (USDC vs MATIC, etc.)
- **Breakdown by oracle / resolutionType** (Polymarket vs Chainlink vs UMA)

### B. Activity & money-movement transfers (`useTaxReport` / transfer data)
Every value-moving event is indexed as a **WagerTransfer**:
- `direction`: `deposit` | `payout` | `refund`
- `amount`, `token` / `tokenTicker`, `usdValue`, `feeNative` (gas)
- `timestamp`, `txHash`, `blockNumber`
- Already aggregated per-token into deposits / payouts / refunds / **net P&L**,
  scoped to **custom or calendar date ranges**.

**This is the gold for the time-series graph** — a chronological stream of
deposits/payouts/refunds with timestamps + USD values lets us plot cumulative
P&L, balance-over-time, or wagered-volume-over-time.

### C. Live wallet balances (`useWalletManagement`)
- `balances.native` (MATIC / ETC), `balances.wrappedNative` (WMATIC),
  `balances.tokens` (e.g. USDC)
- `refreshBalances()`, `getTokenBalance(addr)`
- Plus `chainId`, `isCorrectNetwork`, connection state.

### D. Price conversion (`usePriceConversion`)
- `nativeUsdRate` (MATIC→USD via CoinGecko, **polled every 5 min**, fallback 0.5)
- `convertToUsd()`, `formatPrice()` (compact `$1.2M` / `1.2K` notation)
- Stablecoin (USDC) valued at par ($1.00).

### E. Platform-wide stats (`useSiteStats`) — optional "you vs platform" framing
- `activeAccounts`, `valueWageredUsd`, `wagersResolved`, `totalWagers`,
  `activeWagers`. (60-second cache.) Could contextualize a user's numbers.

### F. Membership / roles (`useWalletRoles`, `useTierPrices`)
- Current role(s), tier, whether membership is active, renewal info.
- Tiers: Bronze ($2), Silver ($8), Gold ($25), Platinum ($100 USDC) with limits
  like `maxConcurrentMarkets`, `durationDays`.

### G. Oracle / market context (`useOracleConditions`, `usePolymarketSearch`)
- For a user's open wagers: `description`, `expectedResolutionTime`, resolved?
- Polymarket markets carry YES/NO probabilities and categories (politics, sports,
  crypto, pop-culture, business, tech). Could show "markets you're exposed to."

### Multi-chain note
The app runs on **Polygon (137)**, **Polygon Amoy testnet (80002)**, **ETC
Mordor testnet (63)**, and local Hardhat. Native symbol and stablecoin differ by
chain — the dashboard must read token symbols/decimals from context, not
hard-code "MATIC"/"USDC".

---

## 5. Real-time behavior (drives the "live" feel)

There are **no websockets** — updates are **polling-based**. Design the UI to
feel live within these cadences (show subtle "updating" affordances, animated
count-ups, relative timestamps like "updated 12s ago"):
- Activity feed: **30s** poll
- Site stats: **60s** cache
- Price (native→USD): **5 min**
- Membership tiers: **5 min**
- Balances: on-demand `refreshBalances()` (design a manual refresh + pull-to-
  refresh on mobile).

Number changes should **animate** (count-up) — the app already does this on its
landing-page stats band, so it's an established pattern. Time-series data should
**stream in / re-poll** without a jarring full-reload.

---

## 6. The required time-series graph

The user explicitly wants a **time-series graph**. Strong candidates (designer
picks the most compelling; we can show a small range toggle: **7D / 30D / 90D /
All**):
1. **Cumulative net P&L over time** (from WagerTransfer deposits/payouts/refunds,
   in USD) — most emotionally resonant; green above zero, red below.
2. **Wagered volume over time** (staked amount per period) — activity intensity.
3. **Wallet/staked balance over time** — money at work.
4. **Win-rate trend** (rolling) — skill narrative.

Recommend #1 (cumulative P&L) as the hero chart with a range selector, and
optionally a secondary sparkline row for the others. Mark **win/loss events** as
points on the line if it doesn't clutter. Note: a real user may have **few data
points** early on — design a graceful **empty / low-data state** (a real-money
product never fabricates a curve).

---

## 7. Suggested dashboard composition (designer owns the final layout)

A possible structure, top to bottom, mobile-first:
1. **Identity strip** — avatar (blockies), short address (tap to copy / QR),
   connected-network chip, dark/light toggle. Compact.
2. **Summary tiles (3–5, animated count-up):** e.g. *Net P&L (USD)*,
   *Win Rate*, *Total Wagered*, *Active Wagers*, *Wallet Balance*. Use color:
   green for positive/active, red for negative/loss. Each tile can carry a tiny
   sparkline + delta vs. last period.
3. **Hero time-series chart** — cumulative P&L with 7D/30D/90D/All toggle,
   "updated Ns ago" indicator, graceful empty state.
4. **Secondary breakdowns** — small charts/lists: *by status* (active vs settled
   donut), *by token*, *by oracle type*, or *recent activity feed* (deposits/
   payouts/refunds with relative time + tx link).
5. **Balances panel** — per-token balances with USD value + manual refresh.
6. **Wallet utilities (de-emphasized)** — full address, Show QR, Disconnect —
   collapsed/secondary so they don't compete with stats.

Keep the existing **tab menu** (Account / Membership / Network / Security /
Preferences / Reporting / Swap) — this dashboard *is* the Account tab.

---

## 8. Brand & design system (use these exact tokens)

The app uses **CSS variables** (not Tailwind/styled-components) with a wired-up
**dark + light mode** (`.theme-dark` on root). Honor both themes. Tokens:

**Brand / semantic**
- `--brand-primary` **#36B37E** (Winning Green) — primary buttons, positive
- `--brand-secondary` **#4C9AFF** (Odds Blue) — secondary actions / active
- `--brand-accent` **#7BDCB5** (Momentum Mint) — highlights
- `--semantic-win` **#2ECC71** · `--semantic-loss` **#E5533D**
  · `--semantic-warning` **#F5A623** · `--semantic-active` **#4C9AFF**

**Chart palette (already defined for exactly this purpose)**
- `--chart-series-a` #36B37E · `--chart-series-b` #4C9AFF
  · `--chart-series-c` #7BDCB5 · `--chart-series-d` #F5A623
  · `--chart-series-e` #9AA6B2

**Neutrals (light → dark)**
- bg-primary #F7F9FA → #0E141B (Porcelain → Midnight Slate)
- bg-secondary #FFFFFF → #141C24 (cards/surfaces)
- text-primary #1F2933 → #E6EDF3 · text-secondary #5A6772 → #AAB6C2
- border #E3E7EB → #23303D

**Shape / motion**
- Radius: 4 / 8 / 12 / full(9999). Shadows: sm / md / lg.
- Transitions: 0.15s fast · 0.3s base · 0.5s slow. Number changes count-up.

**Brand voice:** optimistic, "luck/winning," four-leaf clover. Avoid casino
sleaze — this is fair, transparent P2P. Green = win/positive, red = loss/risk.

---

## 9. Constraints & gotchas (please respect)

- **Mobile-first.** Primary usage is phones (see screenshot). Charts must be
  legible and touch-friendly at ~390px wide.
- **No charting library is installed yet.** Design for a lightweight React chart
  lib (we'll likely add **Recharts**); keep chart styling within the
  `--chart-series-*` palette so it themes cleanly. Don't assume exotic chart
  types we can't build quickly.
- **Honest empty/low-data states are mandatory** — new users have ~zero history.
  Never imply fabricated performance.
- **Respect dark/light mode** for every element, including the chart.
- **Polling, not realtime** — design "live-ish" affordances (relative
  timestamps, subtle pulse/refresh) rather than implying instant streaming.
- **Multi-chain / multi-token** — token symbols and decimals come from context;
  don't hard-code "MATIC" or "USDC" in labels.
- **Privacy-aware** — wager metadata can be encrypted; the dashboard shows the
  user's *own* aggregates, so this is fine, but don't surface counterparties'
  private details.

---

## 10. Deliverables requested from the design agent

1. Mobile + desktop wireframes of the **Account-tab dashboard**.
2. The **time-series chart** treatment (hero), incl. range selector + empty
   state.
3. Summary-tile layout with color/iconography for positive/negative.
4. Notes on responsive reflow and dark/light variants.
5. Any micro-interactions (count-up, refresh, "updated Ns ago") called out.

> Build only on the data feeds in **§4**. If a desired visual needs data not
> listed there, flag it as a follow-up rather than assuming it exists.
