# Phase 0 Research: Mask Sensitive Values (Tilt-to-Hide)

All unknowns from Technical Context resolved below. This is a frontend-only
feature; no contract, subgraph, or service research applies.

## R1. Detecting "laid flat" vs "viewing" from device orientation

**Decision**: Use the browser `DeviceOrientationEvent` `beta` (front–back tilt,
−180…180°) and `gamma` (left–right tilt, −90…90°). Classify **flat/hidden** when
the screen faces up or down — i.e. the screen normal points near-vertical — which
is when *both* `|beta|` and `|gamma|` are small (screen-up flat) OR `|beta|` is
near 180° (screen-down flat). Classify **viewing** otherwise. This naturally
handles landscape viewing (large `|gamma|` → not flat) and portrait viewing
(mid-range `|beta|` → not flat).

**Rationale**: `beta`/`gamma` are available on both iOS and Android and need no
extra math. Using the "screen normal near vertical" rule (rather than only
"beta≈0") avoids two failure modes: false-hide in landscape, and false-reveal
when the phone is face-down on a table.

**Hysteresis (anti-flicker, FR-005)**: two thresholds, not one. Transition to
`hidden` only when inclination-from-horizontal drops **below** `ENTER_FLAT`
(e.g. ≤ 20° from flat) and to `viewing` only when it rises **above** `EXIT_FLAT`
(e.g. ≥ 35° from flat). The dead-band between them, plus a short settle delay
(~150–250 ms of sustained state) prevents rapid toggling from hand tremor or
walking. Exact angles are tunable constants in `lib/privacy/tilt.js`.

**Alternatives considered**:
- `devicemotion` `accelerationIncludingGravity` (gx,gy,gz): flat ⇒ `|gz|≈9.8`,
  gx,gy≈0. Robust, but a second permission surface and more noise-prone; kept as a
  documented fallback, not the primary path.
- CSS `(orientation: portrait|landscape)` media query (existing
  `useMediaQuery.useOrientation`): this is *screen aspect ratio*, not physical
  tilt — cannot detect "flat." Rejected.

## R2. Motion permission model (iOS 13+) and support detection

**Decision**: On iOS 13+ Safari, `DeviceOrientationEvent.requestPermission()`
exists and must be invoked from a **user gesture**, returning `'granted'` /
`'denied'`. Flow: when the member enables tilt-to-hide in Preferences (a tap =
gesture), if `typeof DeviceOrientationEvent?.requestPermission === 'function'`
call it and subscribe only on `'granted'`. On other platforms (Android Chrome),
subscribe directly to `deviceorientation`. Treat the device as **unsupported** if
the API is absent, permission is `'denied'`, or no `deviceorientation` event with
non-null `beta` arrives within a short probe window (~1–2 s) — in all these cases
show values normally (FR-008/FR-009) and reflect the state in Preferences.

**Rationale**: Matches Apple's gesture-gated permission requirement and the
spec's mobile-only, degrade-to-shown clarification. Probing for actual events
covers desktop browsers that expose the API but never fire it.

**Alternatives considered**: requesting permission on app load — rejected (no
user gesture; iOS throws / auto-denies). Gating purely on `useIsMobile()`
(≤768px) — rejected: screen width ≠ sensor availability; event-probe is the
honest signal.

## R3. Permissions-Policy header blocks the sensor in production (BLOCKER)

**Decision**: Change the `Permissions-Policy` response header in
`frontend/nginx.conf` and `frontend/nginx.conf.template`. Both currently send:

```
Permissions-Policy: accelerometer=(), camera=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), browsing-topics=()
```

`accelerometer=()` and `gyroscope=()` are **empty allowlists = feature disabled
for every origin, including self**. `DeviceOrientationEvent` is gated by these
features, so orientation events will **not fire in production** even though they
work in local dev (which has no such header). Update to
`accelerometer=(self), gyroscope=(self)` (leave the other, unrelated features as
they are).

**Rationale**: Without this, the feature ships "working in dev, dead in prod" —
exactly the kind of honest-state / fail-loudly gap the constitution warns
against. This is why it is called out as a first-class task, not an afterthought.

**Alternatives considered**: none — this is a required correction, not a choice.

## R4. Where masking is applied — component vs CSS blur

**Decision**: Apply masking with a single presentational component
`<SensitiveValue>` (backed by `usePrivacy()`) that, when `hidden`, renders a
fixed-width neutral placeholder **in place of** the real text and sets an
accessible name like "hidden" — so the real value is absent from the DOM text,
the copy buffer, and the screen-reader tree while masked.

**Rationale**: FR-013 requires the value be non-exposed via text selection/copy
**and** the accessibility accessible name. A CSS `filter: blur()` overlay leaves
the real digits in the DOM — copyable and readable by assistive tech — so it
fails FR-013. Formatting in this app is **decentralized** (no single `<Amount>`
or global formatter — `lib/account/format.js`, `PortfolioPanel`'s local
`formatUsdFull`, and inline template-string stakes all coexist), so a
render-site wrapper is the correct seam; it does not require unifying formatters.

**Alternatives considered**:
- Masking inside the string formatters (`formatUsd`, …): rejected — they are pure,
  context-unaware, and widely unit-tested; they must stay pure.
- Body-level `data-mask` CSS class + `.sensitive` blur: lower-touch but violates
  FR-013 (copy/AT exposure) and can encode digit width. Rejected as the mechanism,
  though a stable placeholder width reuses the same class hooks for layout.

**Interaction note**: `SummaryTiles` animates values via `useCountUp`. When
`hidden`, `<SensitiveValue>` must short-circuit to the placeholder and not run /
not reveal the count-up animation.

## R5. Persisting the on/off setting (per-account) and the live state

**Decision**: Persist the enable/disable flag in the existing per-account
`UserPreferencesContext` (`userStorage`, localStorage keyed by wallet address),
new key `tilt_to_hide`, default `true`, with a `setTiltToHide` setter mirroring
`setShowZeroBalances`. Keep the fast-changing `hidden` viewing-state in a separate
`PrivacyProvider` (in-memory) so orientation updates never write storage or churn
the preferences context.

**Rationale**: The spec's Session-1 clarification keyed the preference **per
connected account**, which `UserPreferencesContext` already provides. Its
reset-to-defaults-on-disconnect behavior yields the correct enabled-by-default
pre-connect state (FR-003). Separating durable setting from live state keeps
writes rare and renders cheap.

**Alternatives considered**: a device-global pref (`saveGlobalPreference` /
Theme-style localStorage) — simpler but contradicts the per-account decision;
noted as the fallback if per-account keying proves undesirable in review.

## R6. Testing device orientation without a device

**Decision**: Add a `DeviceOrientationEvent` / `deviceorientation` mock to
`frontend/src/test/setup.js` (which already mocks `matchMedia`, `ResizeObserver`,
etc. but has no orientation mock). Tests dispatch synthetic events with chosen
`beta`/`gamma` inside `act()` and assert state transitions, mirroring
`frontend/src/test/useMediaQuery.test.js`. The pure classifier in
`lib/privacy/tilt.js` is tested directly with angle inputs — no DOM.

**Rationale**: Reuses the established browser-API-mock test pattern; isolates the
math for exhaustive, fast coverage (hysteresis, face-down, landscape, boundary).

**Alternatives considered**: Cypress e2e with real sensors — not reproducible in
CI; kept manual via `quickstart.md` on a real phone.

## Resolved unknowns summary

| Unknown | Resolution |
|---------|-----------|
| Flat vs viewing detection | `DeviceOrientationEvent` beta/gamma → screen-normal-near-vertical rule, R1 |
| Flicker prevention | Dual-threshold hysteresis + settle delay, R1 |
| iOS permission | Gesture-gated `requestPermission()` on enable; probe for events, R2 |
| Prod sensor availability | Fix `Permissions-Policy` to `(self)` for gyroscope+accelerometer, R3 |
| Masking mechanism | `<SensitiveValue>` content-swap (not CSS blur) for FR-013, R4 |
| Persistence keying | Per-account `UserPreferencesContext`, key `tilt_to_hide` default true, R5 |
| Test strategy | Pure classifier unit tests + synthetic `deviceorientation` events, R6 |
