# Tilt-to-Hide (Mask Sensitive Values)

Spec: [`specs/047-mask-sensitive-values/`](../../specs/047-mask-sensitive-values/spec.md)

Tilt-to-hide masks on-screen monetary figures automatically: on a mobile device,
balances show while the phone is held at a viewing tilt and hide the moment it is
laid flat. It is a single app-wide setting in **My Account → Preferences →
Privacy**, enabled by default, and it is display-only — underlying values and
on-chain state never change.

## Architecture

| Piece | File | Role |
|-------|------|------|
| Classifier | `frontend/src/lib/privacy/tilt.js` | Pure `{beta,gamma} → 'viewing' \| 'hidden'` with hysteresis. No DOM. |
| Provider | `frontend/src/contexts/PrivacyContext.jsx` | Subscribes to `deviceorientation`, derives live `hidden`, handles iOS permission + capability detection. |
| Hook | `frontend/src/hooks/usePrivacy.js` | `usePrivacy() → { hidden, enabled, support, permission, requestMotionPermission }`. Safe default (values shown) when no provider. |
| Primitive | `frontend/src/components/common/SensitiveValue.jsx` | Masks a value at its render site. |
| Preference | `frontend/src/contexts/UserPreferencesContext.jsx` | Per-account `tiltToHide` flag (localStorage key `tilt_to_hide`, default `true`). |
| Settings UI | `frontend/src/components/account/PrivacyPreferencesPanel.jsx` | The on/off toggle + mobile-only / permission messaging. |

The persisted on/off flag lives in `UserPreferencesContext` (per connected
account). The fast-changing viewing state lives in `PrivacyProvider`, mounted in
`main.jsx` just inside `UserPreferencesProvider`, so orientation updates never
touch storage.

## How masking is applied

There is no single money formatter in the app, so masking is applied at each
render site by wrapping the formatted string:

```jsx
import SensitiveValue from '../common/SensitiveValue' // adjust relative path

<SensitiveValue className="portfolio-total">{formatUsdFull(total)}</SensitiveValue>
```

- Renders a `<span>` by default; pass `as="strong"` / `as="div"` to match the
  original element.
- When hidden it renders a fixed `••••` placeholder, **removes the real value
  from the DOM** (so it can't be copied) and sets the accessible name to
  "hidden" (so screen readers don't announce it).
- The placeholder is constant, so it never leaks the value's magnitude or digit
  count.

### What to wrap

Wrap **monetary** figures: balances, portfolio total / subtotals, per-asset
amounts and USD values, wager/pool stakes, activity-history amounts, payouts.

Do **not** wrap: participant counts, dates, timers, wager/pool IDs, addresses,
percentages that aren't money, or public market prices/odds (e.g. Polymarket
cents, DEX exchange rates) — those aren't the user's holdings.

Wrap where the value is **rendered** in JSX, not inside pure string helpers
(`wagerCardHelpers.js`, `wagerVm.js`, `lib/account/format.js`) — those stay pure.

For values drawn on a canvas/SVG (e.g. Recharts axis ticks) you can't use the
component; read `usePrivacy().hidden` and substitute a placeholder in the
formatter instead (see `PnlChartCanvas.jsx`).

## Device support & permissions

- Tilt-to-hide needs a motion/orientation sensor. On desktop, sensor-less
  devices, or when motion access is denied, values are simply shown and the
  Preferences panel says the feature is mobile-only. There is no manual fallback.
- **iOS 13+** gates `DeviceOrientationEvent` behind
  `DeviceOrientationEvent.requestPermission()`, which must be called from a user
  gesture. Enabling the toggle triggers the prompt; a denial degrades to
  "values shown".

## Deployment requirement (Permissions-Policy)

`DeviceOrientationEvent` is gated by the `Permissions-Policy` response header.
`frontend/nginx.conf` and `frontend/nginx.conf.template` **must** allow the
sensor for self:

```
Permissions-Policy: ... accelerometer=(self), ... gyroscope=(self), ...
```

If these are set to the empty allowlist `accelerometer=()` / `gyroscope=()`, the
sensor is disabled and tilt-to-hide silently no-ops in production (while still
working in local dev, which sends no such header). Verify after deploy:

```bash
curl -sI https://<host>/ | grep -i permissions-policy   # must show =(self)
```

## Tuning

Thresholds live in `TILT_DEFAULTS` in `lib/privacy/tilt.js`:
`enterFlatDeg` (enter hidden), `exitFlatDeg` (enter viewing), `settleMs`. The gap
between enter/exit is the hysteresis dead-band that prevents flicker.

## Testing

- Unit-test the classifier directly with angle inputs (`test/privacy/tilt.test.js`).
- Simulate orientation with `global.dispatchOrientation({ beta, gamma })` (mock in
  `test/setup.js`); see `test/privacy/PrivacyContext.test.jsx` and
  `test/privacy/tiltHide.integration.test.jsx`.
- `usePrivacy()` returns "values shown" without a provider, so existing component
  tests keep passing without wrapping every render in `PrivacyProvider`.
