# Phase 0 Research: Fix QR Share & Scan Rendering

This phase resolves *why* the QR features are broken and *what* approach the fix takes. All findings are grounded in the current source; the implementation phase will confirm on the running app.

## Evidence gathered

| Surface | File:line | Background | QR colors | Embedded logo (`imageSettings.src`) |
|---------|-----------|------------|-----------|--------------------------------------|
| Create-wager success | `frontend/src/components/fairwins/FriendMarketsModal.jsx:1869` | `.fm-qr-container` = **hardcoded white** | `fg #36B37E`, `bg transparent` | `/assets/logo_fairwins.svg` (**236,966 B**) |
| Share Wager modal | `frontend/src/components/fairwins/ShareWagerModal.jsx:54` | `.share-wager-qr-container` = `var(--bg-primary)` → light `#F7F9FA` / dark `#0E141B` | `fg #36B37E`, `bg transparent` | `/assets/logo_fairwins.svg` (**236,966 B**) |
| Market Share modal | `frontend/src/components/ui/ShareModal.jsx:120` | `.qr-code-frame` inside a dark glassy modal | `fg #36B37E`, `bg transparent` | `/assets/fairwins_no-text_logo.svg` (**236,967 B**) |
| QR-scan button | `frontend/src/components/fairwins/FriendMarketsModal.jsx:1408` | `.fm-scan-btn` bg `var(--bg-primary)` | inline `<svg fill="currentColor">`, color `var(--text-secondary)` | — |

Supporting facts:

- `qrcode.react@^4.2.0` exports `{ QRCodeSVG, QRCodeCanvas }`. `QRCodeSVG` renders `imageSettings.src` as a **nested SVG `<image href>`** element; the browser must fetch and paint that resource. When it fails, the surrounding area shows the browser's broken-image placeholder (the yellow warning triangle in the report).
- `theme.css`: default `:root` = **light** (`--bg-primary #F7F9FA`, `--text-secondary #5A6772`, `--border-color #E3E7EB`); `.theme-dark` overrides to dark. `index.html` applies `theme-<mode>` + `platform-fairwins` to `<html>`, defaulting to `theme-light`. The QR/scan CSS uses **dark fallbacks** (`var(--…, #0E141B)`, `var(--…, #AAB6C2)`), confirming these were built/tested against dark mode.
- `App.css:666`: a global `img, video, svg { max-width: 100%; height: auto; }` rule applies to every inline `<svg>`, including the scan-button icon.

## Decision 1 — Remove the heavy embedded center logo from the QR

**Decision**: Stop passing the 237 KB SVG to `imageSettings.src`. Render the QR with **no embedded center image** (the logo is decorative per FR-004). If a brand mark is still wanted later, it must be a small (≤ a few KB) optimized inline mark — but that is optional and out of scope for the fix.

**Rationale**: The embedded `<image>` is the direct cause of the broken-image triangle on mobile webviews, and removing it guarantees FR-002 (no broken-image placeholder ever) and FR-004 (QR survives a missing logo) by construction. It also reduces render cost and removes an external fetch. YAGNI/simplicity (constitution Development Workflow §4).

**Alternatives considered**:
- *Keep the logo but swap to a tiny optimized asset* — still an external dependency that can fail; reintroduces the failure mode the bug is about. Rejected as the default; allowed later only with proven small footprint + graceful fallback.
- *Catch the image error and hide it* — `QRCodeSVG` gives no per-image error hook; can't reliably intercept. Rejected.

## Decision 2 — High-contrast, theme-independent QR colors

**Decision**: Render QR modules **dark on a solid white background**: `bgColor="#FFFFFF"` and `fgColor` a near-black brand-dark (e.g. `#0E141B`), wrapped in a white-padded container that provides the quiet zone, in **all three** surfaces (regardless of theme).

**Rationale**: QR scanners expect dark modules on a light field with a quiet zone. Brand green `#36B37E` on white is ≈2.3:1 — below reliable scanning and below WCAG 1.4.11 non-text contrast (3:1); green on a dark/transparent modal is worse. Dark-on-white is theme-independent and satisfies FR-003 + SC-002 + constitution V. The create-wager container is already white; ShareWager/Share need an explicit white frame.

**Alternatives considered**:
- *Keep brand green, only fix the background* — green-on-white still fails contrast/scannability. Rejected.
- *Make colors theme-aware (dark modules in light theme, light modules in dark theme)* — unnecessary complexity and risks an inverted (light-on-dark) QR that many scanners reject. A fixed white field is simpler and universally scannable. Rejected.

## Decision 3 — One shared `WagerQRCode` component

**Decision**: Extract a single presentational component `frontend/src/components/ui/WagerQRCode.jsx` that owns the QR rendering policy (size, level, white bg, dark fg, no embedded logo, accessible name) and is consumed by all three surfaces.

**Rationale**: The three call sites duplicated identical (buggy) QR config. Centralizing enforces FR-010 consistency and prevents one surface from drifting/regressing. Small, focused component; aligns with the existing `components/ui/` pattern.

**Alternatives considered**:
- *Fix each call site in place* — three copies to keep in sync; a future surface would re-copy the bug. Rejected for maintainability.

## Decision 4 — Make the scan-button icon always visible

**Decision**: (a) Pin the icon's box in CSS — `.fm-scan-btn svg { width: 20px; height: 20px; }` (or `flex: none` + fixed size) — so the global `svg { height: auto }` cannot collapse it; (b) set an **explicit AA-contrast icon color** for the button that holds in both themes (don't rely solely on `--text-secondary`), targeting ≥3:1 against the button background (WCAG 1.4.11). Review whether the global `svg` rule should be scoped to content media rather than all SVGs.

**Rationale**: The "never present in any case" symptom points to the theme-independent `height: auto` collapse as the primary cause; the dark-authored token is a secondary contrast risk on the light page. Fixing both makes the icon visible across themes (FR-012, SC-007) without touching unrelated icons.

**Alternatives considered**:
- *Only change the color token* — would not fix a collapsed (zero-height) icon. Rejected as insufficient.
- *Remove the global `svg { height: auto }` rule outright* — broad blast radius across the app; prefer a scoped override on the button and a targeted review. Deferred unless the review shows it's safe.

## Decision 5 — Test strategy (test-first, Vitest)

**Decision**: Author/extend Vitest + Testing Library tests before/with the change:
- `WagerQRCode.test.jsx` — renders an SVG QR with the accessible name; encodes the exact URL passed in; uses white bg + dark fg; renders with **no `imageSettings`/embedded `<image>`** (assert no broken-image dependency); renders fine when no logo prop is given (FR-004).
- Per-surface (FriendMarketsModal success step, ShareWagerModal, ShareModal): QR present, encodes the same link shown in the copy field (FR-005), no embedded-image element.
- `FriendMarketsModal` scan button: icon `<svg>` present with explicit non-zero dimensions and an accessible name; clicking opens the scanner; a scanned `0x…` address fills the Opponent field (FR-013).
- Keep the existing axe/Lighthouse CI gates as the accessibility backstop (constitution V).

**Rationale**: Constitution II requires tests alongside behavior; SC-006/SC-007 require automated proof across surfaces. jsdom cannot truly "scan" a QR, so tests assert the structural guarantees that make a QR scannable (correct payload, dark-on-white, no broken image) and visible icon; real-device scannability is verified manually per quickstart.

**Alternatives considered**:
- *Visual/E2E scan test* — no camera in CI; disproportionate. Manual device check in quickstart instead. Rejected for automation.

## Open questions

None blocking. The only deferred choice — whether to reintroduce a *small* center logo later — is optional and explicitly out of scope for this fix (Decision 1).
