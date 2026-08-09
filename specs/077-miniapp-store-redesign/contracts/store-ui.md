# UI Contracts: Mini-App Store (spec 077)

## 1. Store sub-view contract (`?view=` on the Apps tab)

- URL seam: `/wallet?tab=apps&view=<market|mine|search|submit>`; absent/unknown ⇒ market.
- `submit` keeps its pre-existing exclusive rendering (SubmitAppPanel); the store bar links
  Market / My Apps / Search; "Submit an app" remains a distinct developer entry.
- The store bar: rendered whenever the catalog surface is shown; `<nav>` with an accessible
  name, entries are links (keyboard operable), active entry carries `aria-current="page"`.
- Every sub-view consumes the same fetched listing and the same honest-state branches;
  sub-views MUST NOT fetch independently or re-derive `launchable`/`verified`.
- My Apps = favorites ∩ listing; empty ⇒ honest empty state, never the market grid.
- Search view = market view with search emphasized (autofocused input, filters available);
  same result-count live region.

## 2. Trust banner contract

- Renders ONLY when the current listing is verified (`REGISTRY_STATUS.OK` path).
- Content: stylized verified badge + claim copy (restructured spec-073 facts: on-chain
  review/approval; host re-reads the record and hash-checks the package before code runs).
- Stale snapshot / unreachable / not-deployed states keep their existing warning blocks and
  MUST NOT show the badge.

## 3. Artwork map contract (`appArtwork.js`, components in `appArt.jsx`)

- `artworkFor(slug) → { Art }` — total function: any input (including `null`) returns
  renderable art; unknown slugs get the generic fallback.
- Art is decorative: `aria-hidden="true"`, no title; the card's text carries the name.
- Inline SVG only, themed via `currentColor`/CSS variables; no external fetches, no new CSP
  grants, nothing sourced from packages or the chain.
- Initial entries: `token-mint`, `clearpath`, plus the generic fallback.

## 4. App card contract (redesigned)

Preserved from spec 073 (restyle, not re-decide):

- Launch link only when `launchable && slug`; refusal notes keep their two distinct reasons.
- Vendor shortened with full address as tooltip/copy target; version shown as `v{approved.version}`.
- Favorite star only when launchable with a working slug; `aria-pressed` semantics kept.
- New: artwork panel, contained vendor/version data box, rocket glyph inside the Launch link
  (decorative — accessible name stays "Launch {name}").

## 5. Byte-gate resolution contract

- Stamped compare flow (the false-pass guard is load-bearing):
  `STAMP=$(($(date +%s) * 1000))` → `npm run build:miniapps` →
  `node scripts/miniapps/record-build-digests.js --compare specs/075-monorepo-workspaces/baseline-miniapp-builds.json --since "$STAMP"`
  MUST fail against the old baseline (detected move), then `--out` re-records.
- `npm run check:deps` green after `npm run deps:reinstall` (never incremental
  `npm install`), including the optional-binary guard updated for the rolldown toolchain if
  rollup leaves the lockfile.
- `scripts/release/check-miniapp-versions.js --base <main> --head HEAD` green: baseline
  moved ⇔ both mini-app versions moved.
- Runbook documents: rebuild → publish to IPFS (new CIDs) → `submitApp`/`proposeUpdate` →
  `approveApp(id, expectedManifestHash)` per cohort, and that the chain serves old bytes
  until then.
