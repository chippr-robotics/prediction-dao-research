# Native release channels (spec 102)

FairWins ships on three channels — iOS, Android, and the web/PWA — from one
codebase. The native apps are Capacitor shells (`frontend/ios/`,
`frontend/android/`) serving the **bundled** production build of
`frontend/dist`; nothing is served from a remote origin
(`specs/102-capacitor-channels/research.md` R1).

## The rules that bind every change here

- **Seam-only native logic.** UI code never asks "am I native" itself:
  `frontend/src/lib/native/runtime.js` is the ONE runtime/capability seam, and
  the four native gaps are bridged inside existing seams — the passkey
  ceremony inside `lib/passkey/credentials.js`, Ledger BLE inside
  `lib/hardware/ledgerAdapter.js`, app-lock lifecycle via
  `lib/native/lifecycle.js` feeding the existing `lib/applock/appLock.js`
  events, deep links via `lib/native/deepLinks.js`. Contracts:
  `specs/102-capacitor-channels/contracts/native-runtime-seams.md`.
- **Lockfile discipline (spec 075).** Capacitor packages are pinned EXACT and
  installed only via `npm run deps:reinstall`; `check:deps` + both byte gates
  arbitrate every dependency change.
- **Version fields are sync-only.** `scripts/native/sync-native-config.js`
  writes `capacitor.config.ts` and the native version fields from the tenant
  manifest + `scripts/release/version.js`; `check-native-versions.js` fails CI
  on a hand edit.
- **One tenant, one app id.** The `native` block in `tenants/<id>/manifest.json`
  is the identity source; an unknown tenant or a tenant without the block
  fails the native build loudly — never a fallback to another tenant.
- **CSP is per-platform, never widened globally.** The web nginx policy is
  untouched; the native build injects its own CSP meta (research R7) and a
  parity gate keeps the shared directives in agreement.
- **Honest degradation.** Every native capability gap renders an in-place,
  named reason (`nativeCapability(...)` three-state) — never a silent hide,
  never a broken control.

## Build and run

See `specs/102-capacitor-channels/quickstart.md` for the full validation
guide. Short form:

```bash
npm run build --workspace frontend
node scripts/native/sync-native-config.js
cd frontend && npx cap sync android && npx cap run android   # or: ios
```

## Boot fixes log (US1)

Fixes made to let the production bundle boot in the Capacitor WebView are
recorded here as they land, each with its reasoning.

- **Pipeline proven, no code fixes needed so far**: `vite build` →
  `node scripts/native/inject-native-csp.js` → `npx cap sync android` lands
  the bundle (CSP meta included) in `android/app/src/main/assets/public/`,
  with `@capacitor/app` detected as a plugin. Runtime boot on a device is
  arbitrated by the CI smoke tier; anything it surfaces gets recorded here.
- **Mini-apps need no change for the SW-less iOS WebView (research R6
  confirmed)**: the package cache lives entirely inside `public/sw.js` as
  fetch interception — `lib/miniapps/loader.js` just calls `fetch()` and
  verifies keccak(manifest) + sha256 of every executed byte AFTER retrieval,
  so with no service worker the loader's path is simply the network path,
  same invariant. SW registration itself is guarded
  (`serviceWorkerUpdate.js`: `if (!('serviceWorker' in navigator)) return`),
  so a WebView without SW support boots clean.

## Release chain

The spec-076 release workflow builds and digest-records the `.aab`, the iOS
archive, and the web bundle per tag; store publication is an operator
ceremony — `docs/runbooks/native-release-operations.md`.
