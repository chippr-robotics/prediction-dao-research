# Interface Contracts: Mask Sensitive Values (Tilt-to-Hide)

This is a frontend feature. The "contracts" are the module/component/UI
interfaces the feature exposes internally, so integration points are stable and
testable. No network API, Solidity ABI, or subgraph schema is involved.

---

## 1. `lib/privacy/tilt.js` — pure orientation classifier

Device-free, DOM-free, deterministic. The only place tilt math lives.

```text
classifyOrientation(reading, prevOrientationState, options?) -> 'viewing' | 'hidden'
  reading:  { beta: number|null, gamma: number|null }   // DeviceOrientationEvent angles (deg)
  prevOrientationState: 'viewing' | 'hidden'             // for hysteresis
  options?: { enterFlatDeg?, exitFlatDeg?, ... }         // default tunables

  Rules:
  - null/NaN beta ⇒ return prevOrientationState unchanged (no data, no flip).
  - Compute inclination of the screen from horizontal.
  - Face-up flat (|beta|,|gamma| small) OR face-down (|beta|→180) ⇒ candidate 'hidden'.
  - Enter 'hidden' only if inclination ≤ enterFlatDeg; enter 'viewing' only if ≥ exitFlatDeg;
    otherwise keep prevOrientationState (dead-band).

TILT_DEFAULTS = { enterFlatDeg, exitFlatDeg, settleMs }   // exported constants
```

**Contract guarantees**: pure (same inputs → same output); never throws on
null/garbage input; `enterFlatDeg < exitFlatDeg`.

**Tests**: face-up→hidden, face-down→hidden, portrait-viewing→viewing,
landscape-viewing→viewing, dead-band holds previous state, null reading holds
state.

---

## 2. `PrivacyProvider` / `usePrivacy()` — live viewing-state context

```text
usePrivacy() -> {
  hidden: boolean,            // effective mask-now (see data-model effective rule)
  enabled: boolean,           // tiltToHide preference value
  support: 'unknown'|'supported'|'unsupported',
  permission: 'unknown'|'prompt'|'granted'|'denied',
  requestMotionPermission(): Promise<'granted'|'denied'|'unsupported'>,  // call from a user gesture
}
```

**Behavior**:
- Reads `tiltToHide` from `useUserPreferences()`; when `false`, `hidden` is always
  `false` and no listener is attached.
- When `true`: attaches a throttled `deviceorientation` listener (coalesced to
  ~animation-frame / ~100 ms), feeds readings to `classifyOrientation`, derives
  `hidden`. Detects `unsupported` when the API is missing or no valid event
  arrives within the probe window.
- iOS: exposes `requestMotionPermission()` that calls
  `DeviceOrientationEvent.requestPermission()`; must be triggered by a gesture.
- Cleans up the listener on unmount and when the preference flips off.

**Contract guarantees**: never masks when `enabled` is false, `support` is
`unsupported`, or `permission` is `denied` (FR-008); listener always removed on
cleanup (no leak).

---

## 3. `<SensitiveValue>` — masking primitive

```text
<SensitiveValue
    as?            // element/tag or component, default 'span'
    className?     // forwarded (e.g. .account-tile-value for width/style)
    revealLabel?   // accessible name to use for the underlying value when shown
    hiddenLabel?   // accessible name when masked, default "hidden"
>
    {formattedValueString}   // e.g. formatUsd(n), `${stake} ${symbol}`
</SensitiveValue>
```

**Behavior when `usePrivacy().hidden === true`**:
- Renders a fixed neutral placeholder (e.g. `••••`) whose width does **not**
  encode the original digit count (FR-012).
- The real value string is **absent** from rendered DOM text (not just visually
  hidden), so it cannot be copied (FR-013).
- `aria-label` / accessible name is `hiddenLabel` ("hidden"), not the value, so
  assistive tech does not announce it (FR-013, WCAG).
- Layout stays stable — same box the revealed value occupied (FR-014).

**Behavior when `hidden === false`**: renders children unchanged (identical to
today's output — honest exact value, FR-011).

**Contract guarantees**: display-only (never mutates the passed value); toggling
reproduces the exact original string; no flash — masked from first paint when
`hidden` is already true (FR-007).

---

## 4. `UserPreferencesContext` extension

```text
preferences.tiltToHide: boolean   // NEW, default true
setTiltToHide(next: boolean): void // NEW; persists via saveUserPreference(account,'tilt_to_hide',Boolean(next),true)
```

Mirrors the existing `showZeroBalances` / `setShowZeroBalances` shape exactly;
loaded in `loadPreferences`; added to the default state object as `true`.

---

## 5. UI contract — Preferences "Privacy" panel

`PrivacyPreferencesPanel` rendered in `WalletPage` Preferences tab under a new
`Privacy` group heading:

- A `role="switch"` / `aria-checked` toggle (reusing `PortfolioPreferencesPanel`'s
  `PrefSwitch`) bound to `tiltToHide` / `setTiltToHide`. Default shows **on**.
- Descriptive sub-text: "Balances hide when you lay your phone flat and show when
  you hold it up."
- When `support === 'unsupported'` (desktop / no sensor): the toggle communicates
  the feature is mobile-only and currently inactive (FR-008, FR-015).
- When iOS `permission` is `prompt`/`denied`: enabling triggers
  `requestMotionPermission()` from the tap gesture; a denied result is surfaced.

---

## 6. Deployment contract — Permissions-Policy

`frontend/nginx.conf` and `frontend/nginx.conf.template` MUST send a
`Permissions-Policy` that allows the sensor for self:

```
accelerometer=(self), gyroscope=(self)
```

(replacing the current `accelerometer=()`, `gyroscope=()`), leaving the other
directives unchanged. Without this, `deviceorientation` never fires in
production (R3).
