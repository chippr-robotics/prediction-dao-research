# Research: Mini-App Store UX Redesign (spec 077)

## R1 — Where per-app artwork can live without moving committed bytes

**Decision**: Curated artwork is a host-side module — inline SVG illustrations keyed by app
slug (`frontend/src/components/miniapps/appArtwork.js`, components in `appArt.jsx`), with a generic fallback entry.

**Rationale**: Nothing in the registry record, manifest schema, or host object carries an icon
today (`grep icon frontend/src/lib/miniapps` → nothing). Adding one on-chain or in package
manifests would (a) change the manifest schema every published package commits to, (b) move
package bytes, and (c) hand vendors a self-served image channel into the catalog — a new
review surface. Host-curated art is a pure presentation concern, ships with the host, and an
unknown slug degrades honestly to the generic illustration (never a fabricated identity).
Inline SVG (not image files) keeps the art theme-aware via CSS variables and avoids new asset
pipeline/CSP considerations.

**Alternatives considered**: on-chain icon URL field (schema + trust surface change, rejected);
IPFS icon in package (byte moves + vendor-controlled imagery, rejected); generated blockies
from vendor address (no functional identity value, fails the issue's "visually represents its
core function" requirement — kept only as inspiration for the generic fallback).

## R2 — In-section navigation vs. the host's global navigation

**Decision**: The store navigation (Market / My Apps / Search) is presentation state inside
`CatalogPanel`, carried on the existing query-string seam (`?view=`, already used by
`view=submit`), rendered as a persistent store-bar (bottom-anchored on small viewports, inline
tab-style on wide viewports).

**Rationale**: Spec 069 fixed navigation ownership: `NAV_GROUPS` and the account button own
global navigation, and the Apps section is one tab of the wallet app. The concept art's
bottom nav (Market, My Apps, Search, Profile) is an app-store-native idiom; mapping it to a
second global nav would conflict with the host's. Using `?view=` matches the existing
`view=submit` mechanism, keeps browser Back semantics, stays bookmarkable, and requires no
route changes. "Profile" is deliberately satisfied by the host's existing account controls
(documented in spec Assumptions).

**Alternatives considered**: new routes `/apps/market|mine|search` (route churn, breaks the
tab seam, rejected); React state only (not bookmarkable, Back broken, rejected); global
bottom nav (conflicts with spec 069/073 nav ownership, rejected).

## R3 — "My Apps" definition

**Decision**: My Apps = the member's favorited (Quick Access) apps, from the existing
`lib/miniapps/favorites` store, rendered with the same `AppCard` and identical launch rules.

**Rationale**: Favorites are the platform's only per-member app relationship; there is no
install concept. The favorites store already has subscribe semantics used by the nav drawer,
so the view is a pure filter over the verified listing — launch rules and honest states are
inherited rather than reimplemented.

## R4 — The byte gate: what binds, and the vite 8 reality

**Decision**: Absorb the deferred vite major (closed Dependabot #1061 item) as vite
`^7.2.4 → ^8.2.1` across ALL manifests that declare it, with the companion bumps the peer
graph requires. Rebuild packages, let the gate detect the move, re-record the baseline, bump
both mini-app package versions (patch), and document the re-publish/re-approve steps.

**Facts established** (from npm registry + repo gates):

- `vite@latest = 8.2.1`; vite 8 is **rolldown-based** (`dependencies: rolldown ~1.2.1`, no
  rollup) — mini-app output bytes will change substantially, which is exactly the absorbed
  move. Node engine `^20.19.0 || >=22.12.0` — satisfied (repo runs Node 22).
- `@vitejs/plugin-react@5.2.0` adds `^8.0.0` to its vite peer range (5.1.x tops out at ^7);
  plugin-react 6.x requires rolldown-plugin-babel and a config shift — **stay on ^5.2.0**.
- `vitest@4.0.18` depends on `vite ^6 || ^7` — incompatible with vite 8. `vitest@4.1.10`
  accepts `^8`. So the vitest family (`vitest`, `@vitest/coverage-v8`, `@vitest/ui`) must move
  to `^4.1.10` wherever declared (frontend + both mini-app packages).
- **FR-015 version-skew gate** (`check:deps`): disagreeing ranges across manifests FAIL CI.
  A mini-app-path-only vite bump (miniapps ^8, frontend ^7) is therefore not landable — the
  bump must align `frontend/package.json`, both `frontend/miniapps/*/package.json`, and
  `tools/miniapp-build` `peerDependencies` in one change.
- `check:deps` also asserts `@rollup/rollup-linux-x64-gnu` exists in the lockfile
  (npm/cli#4828 guard). With vite 8 dropping rollup, that entry may leave the tree; the guard
  must then be updated to the binary the build actually needs
  (`@rolldown/binding-linux-x64-gnu` for rolldown) — same defect class, new binary. Verify
  against the post-reinstall lockfile rather than assuming.
- Install discipline: dependency changes recover ONLY via `npm run deps:reinstall`, then
  `npm run check:deps` (monorepo-workspace skill, spec 075 rule 1).
- Byte gate flow (issue #1024 scoping comment + `record-build-digests.js`): stamp before
  building (`--since`), `npm run build:miniapps`, compare against
  `specs/075-monorepo-workspaces/baseline-miniapp-builds.json`, expect a REPORTED diff, then
  re-record with `--out`. Turbo's `@fairwins/miniapp-build#build` inputs hash the preset files
  and `package-lock.json` is a global dependency, so the toolchain bump busts the cache by
  construction (#1046 fix).
- Version pairing (`scripts/release/check-miniapp-versions.js`, spec 076 FR-007b): baseline
  digests moved ⇒ each affected package's `package.json` version MUST move in the same change
  (both directions checked). Toolchain-only rebuild = **patch** bump: `1.0.0 → 1.0.1` for
  `@fairwins/miniapp-token-mint` and `@fairwins/miniapp-clearpath`. The version feeds
  `manifest.version` via each package's `vite.config.js` (read from its own package.json), so
  the bump itself is part of the byte move — consistent by construction.

**What is NOT in scope**: the other 17 bumps from the closed #1061 sweep (chai, typescript,
eslint majors, etc.) — they do not feed the mini-app build path and stay ordinary dependency
work; and the on-chain re-publish/re-approve itself, which is a curator operation this change
documents but cannot execute (Polygon registry currently lists 0 apps; Mordor lists 3 — the
live re-approvals happen on Mordor first, per the runbook).

## R5 — Trust badge honesty

**Decision**: The "on-chain verified" banner renders only on a verified listing
(`listing.verified === true`); the stale-snapshot and unreachable states keep their warning
treatments and never inherit the badge.

**Rationale**: Constitution III (honest state). The badge is a factual claim — "this list is
what the chain says, and packages are hash-checked before code runs". On a stale snapshot that
claim is false. The existing four-state rendering (loading / not-deployed / unreachable /
verified) is preserved; the redesign restyles, it does not re-decide.

## R6 — Theming and accessibility approach

**Decision**: All new styles extend `frontend/src/components/miniapps/miniapps.css` using the
established pattern — `var(--token, literal-fallback)` theme variables, everything scoped
under `.miniapp-catalog` / new `.miniapp-store-*` classes; artwork SVGs use `currentColor` and
CSS variables so light/dark/tenant themes apply; decorative art gets `aria-hidden`, meaningful
icons get labels. Category headers, badge, and state blocks stay distinguishable without
colour alone (WCAG 1.4.1), matching the file's existing discipline. The store bar is keyboard
operable (real links/buttons), with `aria-current` on the active sub-view.

**Rationale**: Constitution V (WCAG 2.1 AA, axe audits in CI), spec 072 (no hardcoded tenant
identity — the badge/title come from copy, not tenant brand assets), and the existing CSS
file's scoping rules.
