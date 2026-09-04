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

### What the CI toolchain must be (learned the hard way)

The native jobs run for the first time on a **push to `main`**, because that is the only trigger
`release.yml` has. So the first time they ever executed — the v1.16.0 attempt on 2026-09-04 — all
four failed, `Publish release` was skipped, and no version could be minted at all. Neither failure
was in product code; both were toolchain facts nothing else in CI exercises.

**Java 21, not 17.** `capacitor-android` (Capacitor 8) declares source/target compatibility 21.
An older JDK answers with `error: invalid source release: 21` at
`:capacitor-android:compileReleaseJavaWithJavac`, which reads like a project misconfiguration and
is not one. Both the artifact job and the emulator smoke job set `java-version: '21'`.

**Ledger over Bluetooth is ANDROID-ONLY.** `@capacitor-community/bluetooth-le@8.3.0` — the newest
published — does not compile against the Capacitor Swift API this app pins
(`capacitor-swift-pm exact 8.5.0`): `CAPPluginCall has no member 'reject'`, and `getString(_:)`
resolving to a two-argument overload. Capacitor has no per-platform plugin exclusion — a plugin in
`package.json` is a plugin on both platforms — so `scripts/native/exclude-ios-spm-plugins.js` runs
after `cap sync ios` and removes exactly that plugin's `.package`/`.product` pair from the
generated `CapApp-SPM/Package.swift`. It **fails loudly** when the entry is not found: either the
plugin left the tree (drop it from `EXCLUDED`) or the CLI changed its output shape (revisit the
script). Both are for a person to decide; neither is a no-op.

The member-facing consequence is honest degradation, not a hidden gap: `lib/native/runtime.js`
reports the BLE transport as unavailable on iOS and `NativeCapabilityNotice` renders the reason in
place, the same as any other capability gap. Revisit when the plugin publishes a build against
Capacitor 8.5 — the exclusion is one entry in one array.
