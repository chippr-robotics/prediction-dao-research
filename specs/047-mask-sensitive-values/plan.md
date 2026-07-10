# Implementation Plan: Mask Sensitive Values (Tilt-to-Hide)

**Branch**: `claude/mask-sensitive-values-e6o6a6` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/047-mask-sensitive-values/spec.md`

## Summary

Add **tilt-to-hide**: on a mobile device, all on-screen monetary figures
(balances, portfolio totals, subtotals, per-asset values, stake amounts,
activity-history amounts, pending payouts) are shown while the phone is held at a
normal viewing tilt and are automatically masked the instant it is laid flat.
Lifting it back reveals them. It is a single app-wide setting in **Preferences**,
**enabled by default**, and replaces the earlier manual header toggle.

Technical approach — frontend only, no contract/subgraph changes:

- A pure, device-free **orientation classifier** (`lib/privacy/tilt.js`) turns
  `DeviceOrientationEvent` `beta`/`gamma` readings into a `viewing | hidden`
  state, with **hysteresis** (separate enter/exit angles) to prevent flicker.
- A **`PrivacyProvider`** context subscribes to `deviceorientation`, owns the
  live `hidden` viewing-state, handles the iOS 13+ motion-permission gesture, and
  degrades to "values shown" on desktop / sensor-less / permission-denied devices.
- The persisted on/off preference reuses the existing per-account
  `UserPreferencesContext` (localStorage via `userStorage`, keyed by wallet
  address) — add `tiltToHide` (default `true`) + `setTiltToHide`.
- A single presentational **`<SensitiveValue>`** component (backed by
  `usePrivacy()`) swaps the real formatted string for a fixed-width placeholder
  when hidden, and — critically — replaces the exposed **text content and
  accessible name** so the value cannot be read via copy or screen reader while
  masked. All monetary render sites wrap their formatted output in it.
- A new **`PrivacyPreferencesPanel`** (mirroring the existing
  `PortfolioPreferencesPanel` `role="switch"` pattern) is added to the
  Preferences tab in `WalletPage`, with the enable/disable toggle and a
  motion-permission / unsupported-device affordance.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 19

**Primary Dependencies**: React context + hooks only. Browser
`DeviceOrientationEvent` (`beta`/`gamma`; iOS `requestPermission()`). No new npm
dependency. Existing formatters in `frontend/src/lib/account/format.js`
(`formatUsd`, `formatSignedUsd`, `formatCompact`) and other per-component amount
formatting remain the source of the displayed string.

**Storage**: localStorage via existing `frontend/src/utils/userStorage.js`
(`saveUserPreference`/`getUserPreference`, per-wallet-address, `useLocalStorage=true`).
New key `tilt_to_hide` (default `true`). Because `UserPreferencesContext` resets
to defaults on disconnect, the pre-connect / not-yet-set state naturally resolves
to the `true` default (enabled) — consistent with FR-003. Live viewing-state
(`hidden`) is in-memory only, never persisted.

**Testing**: Vitest + jsdom (`npm run test:frontend`), React Testing Library.
Device orientation is simulated by dispatching synthetic `deviceorientation`
events / stubbing `window.DeviceOrientationEvent` — no physical device needed.

**Target Platform**: Web, mobile-first PWA. Primary: mobile Safari (iOS 13+) and
Android Chrome (motion over HTTPS). Desktop and sensor-less devices are the
graceful "values shown" fallback.

**Project Type**: Web frontend (React + Vite) — `frontend/` only, plus this
feature's docs. No `contracts/`, `subgraph/`, `services/`, or `scripts/` changes.

**Performance Goals**: Mask/reveal reacts within ~1s of a deliberate
flat/viewing transition (SC-001/002); `deviceorientation` handling throttled
(reads are frequent — coalesce to animation frame / ~100ms) so it never janks
scrolling; no added network activity.

**Constraints**: Honest-state (display-only mask; underlying values untouched;
unsupported devices show real values, never fake ones); WCAG 2.1 AA (masked
values not announced; toggle keyboard-operable); no flash of real values on
launch/foreground/navigation while flat (FR-007); placeholder must not encode
digit count (FR-012); respect platform motion-permission model (FR-009).
**Deployment gotcha**: the production `frontend/nginx.conf(.template)`
`Permissions-Policy` header currently lists `accelerometer`/`gyroscope` — if set
to a blocking value, `DeviceOrientationEvent` will never fire in production. The
policy MUST permit `gyroscope=(self)` and `accelerometer=(self)` (or the
feature silently no-ops on real devices while working in local dev).

**Scale/Scope**: 1 new pure lib module, 1 new context/provider, 1 new
`<SensitiveValue>` component, 1 new Preferences panel, extend 1 existing context;
wrap the monetary render sites across the account/portfolio/wallet/wager/activity
components (exhaustive inventory finalized in `/speckit-tasks`). ~5 new files,
~1 extended context, N wrapped render sites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First Smart Contracts | PASS (n/a) | No `contracts/` changes. No funds, access-control, or oracle paths touched. Purely a client-side display concern. |
| II. Test-First & Coverage | PASS | Pure classifier gets exhaustive unit tests (angle → state, hysteresis, face-down, landscape). Provider tested by dispatching synthetic `deviceorientation` events (supported, permission-denied, unsupported). `<SensitiveValue>` tested for masked text + accessible-name + copy suppression and layout stability. Preference setter + default-on + per-account persistence tested. No-flash-on-initial-render test. |
| III. Honest State, No Mocks in Shipped Paths | PASS | Mask is display-only; underlying values never altered (FR-011). On unsupported/denied devices we show the **real** values rather than fake a masked or zero state (FR-008). Masking never renders a misleading `$0.00` (honest zero/unavailable preserved). Preference is per-account and network-agnostic — no cross-network leakage (FR-016). |
| IV. Fail Loudly in CI | PASS | New Vitest specs run in the existing frontend job; ESLint must stay clean. No `continue-on-error` added. |
| V. Accessible, Consistent Frontend | PASS | `<SensitiveValue>` sets an appropriate accessible name when masked (value not announced; a "hidden" label instead) and suppresses copy of the real value. Preferences switch reuses the existing `role="switch"` / `aria-checked` pattern from `PortfolioPreferencesPanel`, keyboard-operable. Respects the platform motion-permission prompt. No contract addresses/ABIs involved. axe/Lighthouse in CI must pass. |

**Post-design re-check (Phase 1 complete)**: PASS — no new violations. No new core
technology (browser API + existing React/Vitest stack). Smallest-change rule
respected: reuse `UserPreferencesContext`/`userStorage` for persistence and the
existing Preferences-panel pattern rather than introducing parallel machinery.

## Project Structure

### Documentation (this feature)

```text
specs/047-mask-sensitive-values/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (module/UI contracts)
│   └── tilt-to-hide.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── lib/privacy/
│   └── tilt.js                         # NEW — pure classifier: {beta,gamma} + prevState + thresholds → 'viewing'|'hidden' (hysteresis, face-down, landscape). No DOM, fully unit-testable.
├── contexts/
│   ├── PrivacyContext.js               # NEW — createContext + hook export (mirrors *Context.js / *Context.jsx split used across contexts/)
│   ├── PrivacyContext.jsx              # NEW — PrivacyProvider: reads tiltToHide pref, subscribes to deviceorientation (throttled), computes `hidden`, motion-permission gesture, support detection, degrade-to-shown
│   ├── UserPreferencesContext.jsx      # CHANGED — add `tiltToHide` (default true) to state, load `tilt_to_hide`, add `setTiltToHide` setter (mirrors setShowZeroBalances)
│   └── index.js                        # CHANGED — export PrivacyProvider / usePrivacy plumbing
├── hooks/
│   └── usePrivacy.js                   # NEW — thin consumer hook for PrivacyContext (mirrors useUserPreferences)
├── components/
│   ├── common/SensitiveValue.jsx       # NEW — <SensitiveValue>{formatted}</SensitiveValue>: masked placeholder + accessible-name + copy suppression + fixed-width, layout-stable
│   └── account/PrivacyPreferencesPanel.jsx  # NEW — "Privacy" section of the Preferences tab: tilt-to-hide switch + motion-permission / unsupported-device state (PrefSwitch pattern)
├── pages/WalletPage.jsx                # CHANGED — add a "Privacy" preferences-group-heading (~line 404) rendering PrivacyPreferencesPanel, alongside Display/Wallet/Portfolio/Notifications groups
├── main.jsx                            # CHANGED — mount <PrivacyProvider> just inside UserPreferencesProvider (it reads the pref) so it wraps the remaining providers + <App/> where money renders
└── <monetary render sites>            # CHANGED — wrap formatted money output in <SensitiveValue> (formatting is DECENTRALIZED — no single <Amount>):
        components/account/SummaryTiles.jsx (.account-tile-value; coordinate with useCountUp.js so masking shows placeholder, not an animated count)
        components/account/{RecentActivityFeed,ActivityBreakdowns,PnlChart,PnlChartCanvas}.jsx (.account-feed-amount etc.)
        components/wallet/PortfolioPanel.jsx (local formatUsdFull; .portfolio-row-usd / .portfolio-row-balance / total) + wallet/AssetDetailSheet.jsx
        components/fairwins/ stake & payout renderers: wagerCardHelpers.js, wagerVm.js, WagerCard.jsx, WagerTable.jsx, TakeChallengePanel.jsx, TradePanel.jsx, LiveStats.jsx
        (exhaustive site list enumerated in tasks.md)

frontend/nginx.conf, frontend/nginx.conf.template   # CHANGED — Permissions-Policy must allow gyroscope=(self) accelerometer=(self) so orientation events fire in prod
frontend/src/test/setup.js            # CHANGED — add a DeviceOrientationEvent / 'deviceorientation' mock (none exists today; matchMedia mock is the template)
frontend/src/test/privacy/            # NEW — tilt.test.js, PrivacyContext.test.jsx, SensitiveValue.test.jsx, PrivacyPreferencesPanel.test.jsx (model on test/useMediaQuery.test.js)
docs/developer-guide/
└── tilt-to-hide.md                    # NEW — how the mechanism works, thresholds, permission model, Permissions-Policy requirement, how to wrap a new monetary value
```

**Structure Decision**: Single web-frontend project; all runtime work under
`frontend/src` plus one developer-guide doc. Persistence layers onto the existing
per-account `UserPreferencesContext`; the live orientation state is a separate,
non-persisted `PrivacyProvider`. Contracts, subgraph, services, and deploy
scripts are untouched.

## Complexity Tracking

No constitution violations to justify. Notable simplicity choices:

- **Reuse existing preference storage** (`UserPreferencesContext` + `userStorage`,
  per-wallet, localStorage) for the on/off setting instead of a new store — the
  per-account keying the spec requires already exists there.
- **Split persisted setting from live state**: the durable on/off lives in
  `UserPreferencesContext`; the fast-changing `hidden` viewing-state lives in a
  dedicated `PrivacyProvider` so frequent orientation updates don't churn the
  preferences context or touch storage.
- **One masking primitive** (`<SensitiveValue>`) applied at render sites rather
  than trying to mask inside the pure string formatters (which are React-context
  unaware and must stay pure/testable) — and rather than a CSS blur, which would
  not satisfy the copy/accessibility non-exposure requirement (FR-013).
- **Pure classifier isolated** in `lib/privacy/tilt.js` so all the angle/hysteresis
  logic is unit-tested without a device or DOM.
