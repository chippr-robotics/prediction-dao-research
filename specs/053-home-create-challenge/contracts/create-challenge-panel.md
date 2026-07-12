# UI Contract: CreateChallengePanel + Home/Wagers IA

The interfaces this feature exposes: the extracted create panel, and the navigation/route additions.

## Component: `CreateChallengePanel`

`frontend/src/components/fairwins/CreateChallengePanel.jsx` — the consolidated open-challenge create
panel, extracted from `OpenChallengeModal` so it can render inline (home) or inside the modal.

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `embedded` | boolean | no | `false` | `true` renders inline (no modal backdrop/close chrome), for the home screen; `false` renders for the modal shell. |
| `onClose` | `() => void` | no | — | Dismiss handler (modal mode). |
| `onDone` | `() => void` | no | — | Invoked after a successful create so the host can advance/reset (e.g. "create another" on home, close on modal). |
| `initialResolutionType` | number | no | — | Preselects a resolution path; oracle value opens the market-search step on mount when Polymarket is available. |

### Behavior contract

- Renders the payments-style create UI: amount hero + on-screen pad, wager memo (non-oracle paths),
  resolution selector (self / third-party / oracle), and the path-specific controls (arbitrator for
  third-party; market-search step + market card + side picker for oracle; deadline timeline for
  self/third-party; derived timeline note for oracle).
- The oracle resolution option is **network-gated**: selectable only where Polymarket settlement is
  available; shown locked/greyed with a reason otherwise (FR-005).
- Selecting oracle opens a market-search step and returns to the create view on selection (FR-006).
- Submits via the existing create flow; on success shows the existing claim-code result inline and
  calls `onDone`. Zero amount keeps the create action disabled.
- No smart-contract / escrow / oracle / claim-code behavior changes (FR-014).
- Meets WCAG 2.1 AA (reuses accessible components); non-scrolling at the smallest supported viewport.

### Wrapping

- `OpenChallengeModal` renders the modal chrome (backdrop, header, close) + `CreateChallengePanel`
  (`embedded={false}`), preserving today's modal entry from the Wagers grid.
- `HomeScreen` renders `CreateChallengePanel` (`embedded`) as its primary content.

## Navigation / route contract

### New route (`App.jsx`, under `AppLayout`)

| Path | Component | Notes |
|------|-----------|-------|
| `/app`, `/main`, `/fairwins` | `HomeScreen` | Home = inline create + Accept + My Rewards + ticker. |
| `/wagers` | `WagersPage` | Relocated quick-action grid + its modals. |

### New nav item (`config/appNav.js` + `AppNavDrawer`)

- Add a `Wagers` item: `{ id: 'wagers', label: 'Wagers', icon: <existing NavIcon name>, to: '/wagers' }`
  modeled like `HOME_ITEM` (absolute route, not a `/wallet?tab=` section).
- `pathForNavItem('wagers')` MUST return `/wagers` (special-cased like `home`).
- `AppNavDrawer` MUST render the item and mark it active on `/wagers`.

## Home entry-point contract

| Entry | Opens | Existing flow |
|-------|-------|---------------|
| Accept a challenge | `UnifiedLookupModal` | Phrase lookup / take-a-challenge (unchanged). |
| My Rewards | `MyMarketsModal` (My Wagers) | Claimable payouts + "Claim Winnings" (unchanged). |
| Polymarket ticker item | `CreateChallengePanel` oracle path | Preselect oracle + market search. |
| `?oc=take&code=` deep link | `UnifiedLookupModal` (prefilled, auto-resolve) | Preserved from Dashboard (FR-016). |

## Test contract (Vitest + @testing-library/react)

- **Panel**: renders embedded + modal; self/third-party/oracle paths reachable; oracle pill locked
  off-network, selectable on-network → market step → market + side; submit passes the correct
  settlement config via the mocked hook; success shows the claim-code result + calls `onDone`.
- **HomeScreen**: inline create view is the primary content (no quick-action grid); Accept opens the
  unified lookup; My Rewards opens My Wagers; ticker click routes to the oracle path; `?oc=take` deep
  link opens the prefilled lookup.
- **WagersPage**: every previously-home card is present and launches its flow; quick-access
  visibility toggles still hide/show cards.
- **Nav**: the Wagers drawer item links to `/wagers` and is active there.
