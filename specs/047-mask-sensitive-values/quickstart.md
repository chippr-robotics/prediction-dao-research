# Quickstart & Validation: Mask Sensitive Values (Tilt-to-Hide)

How to run and prove the feature end-to-end. See [data-model.md](./data-model.md)
and [contracts/tilt-to-hide.md](./contracts/tilt-to-hide.md) for the state shapes
and interfaces referenced here.

## Prerequisites

- Node 20, repo dependencies installed (`npm ci` at repo root and/or in `frontend/`).
- For the real-device check: a phone on the same network (or a deployed build over
  **HTTPS** — `DeviceOrientationEvent` requires a secure context).

## Automated validation (CI-equivalent)

```bash
npm run test:frontend          # Vitest — includes src/test/privacy/*
npm run lint --workspace frontend   # ESLint must stay clean (constitution IV/V)
```

Expected: all privacy specs pass —

- `tilt.test.js` — classifier: face-up→hidden, face-down→hidden,
  portrait/landscape viewing→viewing, dead-band holds state, null reading holds state.
- `PrivacyContext.test.jsx` — supported path masks on synthetic flat event and
  reveals on viewing event; permission-denied and unsupported paths never mask;
  listener removed on unmount / when preference toggled off.
- `SensitiveValue.test.jsx` — when `hidden`: placeholder shown, real string absent
  from DOM text (not copyable), accessible name is "hidden", box width stable;
  when shown: exact original string and no digit-count leak in placeholder.
- `PrivacyPreferencesPanel.test.jsx` — toggle defaults on, flips `tiltToHide`,
  persists per account, surfaces unsupported/denied states.

## Manual validation — real mobile device (the core UX)

1. Serve over HTTPS (deployed build or a local HTTPS tunnel) and open the app on a
   phone. Connect an account that holds a balance so the portfolio/dashboard shows
   monetary values.
2. **Default-on**: without changing any setting, view the Dashboard/Wallet →
   values are visible while holding the phone up.
3. **Lay flat**: set the phone flat on a table (screen up). → Within ~1s every
   balance, total, per-asset value, and stake masks to `••••`; the layout does not
   jump. (SC-001)
4. **Lift up**: raise the phone to a normal viewing angle. → Exact values return
   within ~1s. (SC-002)
5. **No flicker**: hold the phone near the flat/viewing boundary and wobble it. →
   The state does not rapidly toggle. (SC-003)
6. **No flash on launch**: with the phone flat, hard-reload the app. → Values
   render already masked; no frame of real digits appears. (SC-004)
7. **Navigate while flat**: keep it flat and move between Dashboard, Wallet,
   My Wagers. → New screens/values render masked. (FR-006)
8. **iOS permission**: on first enable, accept the motion-access prompt. Deny it
   in a second run → values stay shown and Preferences indicates it can't take
   effect. (FR-009)
9. **Preferences off**: My Account → Preferences → Privacy → turn tilt-to-hide off.
   → Laying flat no longer masks anything, app-wide. Turn back on, reload → setting
   and behavior persist. (User Story 2)

## Manual validation — desktop / unsupported (graceful degrade)

1. Open the app in a desktop browser (no orientation sensor).
2. All monetary values are shown normally; there is no masking and no manual
   hide control. (FR-008, SC-006)
3. My Account → Preferences → Privacy shows the tilt-to-hide setting labelled as a
   mobile-only feature that is currently inactive on this device. (FR-015)

## Production sanity check (Permissions-Policy)

After deploy, confirm the header allows the sensor (R3):

```bash
curl -sI https://<host>/ | grep -i permissions-policy
# must contain: accelerometer=(self)  and  gyroscope=(self)
```

If it still shows `accelerometer=()` / `gyroscope=()`, orientation events are
blocked and tilt-to-hide will silently no-op on real devices — fix
`frontend/nginx.conf(.template)` and redeploy.

## Definition of done (validation)

- All `src/test/privacy/*` specs pass; lint clean.
- Real-device: flat masks / viewing reveals within ~1s, no flicker, no launch
  flash, app-wide while flat.
- Desktop: values shown, Preferences communicates mobile-only.
- Deployed `Permissions-Policy` permits `accelerometer=(self)` + `gyroscope=(self)`.
- Toggling never alters the underlying figures (identical values on reveal).
