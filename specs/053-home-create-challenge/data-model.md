# Phase 1 Data Model: Create-a-Challenge Home Screen

Front-end IA/presentation feature — no persistence or on-chain schema. This captures the UI
surfaces, their composition, and the navigation model. Create/take/rewards state is owned by the
existing components/hooks and reused unchanged.

---

## Surface: HomeScreen (`/app`, `/main`, `/fairwins`)

The landing surface. Primary content is the inline create view; two secondary entries and the ticker
sit around it.

| Element | Source | Notes |
|---------|--------|-------|
| Inline create | `CreateChallengePanel` (embedded) | Open-challenge create: amount hero + pad, memo, resolution (self/third-party/oracle). Primary content. |
| Accept a challenge | opens `UnifiedLookupModal` | Existing take-a-challenge / phrase entry (today's "Enter Words"). |
| My Rewards | opens `MyMarketsModal` (My Wagers) | Existing view with claimable payouts + "Claim Winnings". |
| Polymarket ticker | `PolymarketTickerCrawler` | Clicking a market routes into the create panel's oracle path. |
| Connect/membership gating | existing prompts | Create action gated when disconnected / below tier (FR-013); view still renders. |
| Deep link `?oc=take&code=` | routed to `UnifiedLookupModal` | Preserved from Dashboard (FR-016). |

## Surface: WagersPage (`/wagers`) — NEW route

The relocated quick-action grid. Everything that used to be on the home grid, moved here intact.

| Element | Source | Notes |
|---------|--------|-------|
| Quick-action grid | `QuickActions` (moved from Dashboard) | All create types + actions, filtered by quick-access visibility. |
| Create modals | `FriendMarketsModal`, `GroupPoolModal`, `OpenChallengeModal` | 1v1 friends/oracle, offer, open challenge (incl. oracle path), group pool. |
| Track/share modals | `UnifiedLookupModal`, `MyMarketsModal`, `QRScanner`, `AddressQRModal` | Enter phrase, my wagers, scan QR, share account. |
| Visibility prefs | `quickAccessPreference` util | Unchanged; cards toggle as today. |

## Component: CreateChallengePanel (extracted)

Reusable create panel — the consolidated `MakerPanel` lifted out of `OpenChallengeModal`.

| Prop | Type | Notes |
|------|------|-------|
| `embedded` | boolean | `true` → inline (home), no modal chrome; `false` → inside `OpenChallengeModal`. |
| `onClose` | fn | Modal dismiss (modal mode). |
| `onDone` | fn | Called after a successful create (both modes) for the result/next-action flow. |
| `initialResolutionType` | number? | Preselects a resolution path (e.g. oracle from the ticker). |

**Owned state (unchanged from the consolidated panel)**: `stake`, `description`, `resolutionType`
(self / third-party / oracle), `arbitrator`, oracle `market` + `side` + market-search `step`,
accept/resolve deadlines, `result`. Submits via `useOpenChallengeCreate` (self/third-party pass user
deadlines + optional arbitrator; oracle passes Polymarket type + conditionId + side + derived
deadlines + sealed oracleMeta). Zero-state gating and cents-precision entry unchanged.

**Resolution paths (state → behavior)**
```
Either (self)      → memo + user deadlines
ThirdParty         → memo + arbitrator field + user deadlines
Polymarket (oracle)→ market-search step → market card + side picker + derived timeline
                     (pill network-gated: locked/greyed where Polymarket unavailable)
```

## Model: Navigation

| Item | id | Path | Notes |
|------|----|------|-------|
| Home | `home` | `/app` | Existing `HOME_ITEM`; now renders HomeScreen (inline create). |
| Wagers | `wagers` | `/wagers` | NEW absolute-route nav item (like Home), special-cased in `pathForNavItem`; rendered in `AppNavDrawer`. |
| (unchanged) | portfolio/earn/trade/… | `/wallet?tab=<id>` | Existing Finance/Tools/Apps groups untouched. |

**Route additions (App.jsx, under `AppLayout`)**: `/app`,`/main`,`/fairwins` → `HomeScreen`;
`/wagers` → `WagersPage`. Other routes unchanged.

## Reused flows (unchanged behavior — FR-009/FR-012/FR-014)

- Create: `useOpenChallengeCreate` (open challenge, all three resolution paths), `usePools`
  (group pool), `useFriendMarketCreation` (1v1/offer) — same submitted shapes and outcomes.
- Take a challenge: `UnifiedLookupModal` (phrase lookup).
- Winnings: `MyMarketsModal` → `claimPayout` / `claimRefund` (and pool payout claiming).
- Membership gating + claim-code cryptography: untouched.
