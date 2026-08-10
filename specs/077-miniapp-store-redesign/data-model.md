# Data Model: Mini-App Store UX Redesign (spec 077)

No new persisted data, no on-chain changes, no schema changes. The model below is
presentation state plus the release artifacts the byte-gate resolution touches.

## Presentation entities (host frontend, in-memory)

### StoreView

The Apps section's sub-view, carried on the existing `?view=` query parameter.

| Value | Meaning | Source of truth |
|---|---|---|
| *(absent)* / `market` | Full grouped catalog (default) | `useSearchParams` |
| `mine` | Favorited apps only ("My Apps") | `useSearchParams` |
| `search` | Search-focused catalog view | `useSearchParams` |
| `submit` | Developer submission surface (pre-existing) | `useSearchParams` |

Rules: unknown values fall back to market; `submit` keeps its existing exclusive rendering;
the store bar marks the active view with `aria-current`. All views read the SAME
`listing` object — sub-views never re-fetch or re-derive trust state.

### CuratedArtwork

Host-side map entry, keyed by app slug (the registry client's `appSlug(name)`).

| Field | Type | Notes |
|---|---|---|
| slug (key) | string | e.g. `token-mint`, `clearpath` |
| art | inline SVG component | theme-aware (currentColor / CSS vars), `aria-hidden` |

Fallback: a single generic app illustration for any slug not in the map (including
null slugs). The map is never consulted for trust decisions.

### Listing (pre-existing, read-only)

`fetchCatalog` outcome → `{ apps, verified, fetchedAt, ageMs }` as today. The redesign adds
no fields. `verified === true` is the ONLY condition under which the trust banner renders.

### FavoriteApp (pre-existing)

`lib/miniapps/favorites` entries `{ id, slug, name }` — the "My Apps" membership set.
Unchanged; the view is a filter of `listing.apps` by favorited id.

## Release artifacts (byte-gate resolution)

### Mini-app output baseline

`specs/075-monorepo-workspaces/baseline-miniapp-builds.json` — sha256 per
`{app}/{entry.js,manifest.json,style.css}`. Re-recorded once, in the same change as the
toolchain bump. The gate compare must FAIL against the old baseline before re-record
(proof the move was detected, never silent).

### Package version ↔ bytes pairing

| Package | Version before | Version after | Why |
|---|---|---|---|
| `@fairwins/miniapp-token-mint` | 1.0.0 | 1.0.1 | toolchain-only byte move (patch) |
| `@fairwins/miniapp-clearpath` | 1.0.0 | 1.0.1 | toolchain-only byte move (patch) |

`manifest.version` is read from each package.json at build time, so the version bump is
itself part of the recorded byte move. Enforced by
`scripts/release/check-miniapp-versions.js` (spec 076 FR-007b, both directions).

### Toolchain alignment (FR-015 skew gate: one range everywhere)

| Package | Manifests declaring it | Range after |
|---|---|---|
| `vite` | frontend, token-mint, clearpath, miniapp-build (peer) | `^8.2.1` |
| `@vitejs/plugin-react` | frontend, token-mint, clearpath | `^5.2.0` |
| `vitest` / `@vitest/coverage-v8` / `@vitest/ui` | frontend (+ vitest in both mini-apps) | `^4.1.10` |

### On-chain records (NOT changed by this feature)

`MiniAppRegistry` entries still commit to the previous published bytes until curators run
the re-publish (IPFS) + `approveApp(id, expectedManifestHash)` flow per the updated runbook.
The repo is explicit about that lag; nothing renders the new bytes as live.
