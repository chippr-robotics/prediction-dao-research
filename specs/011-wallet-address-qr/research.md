# Phase 0 Research: Wallet Address QR Display & Sharing

**Feature**: `011-wallet-address-qr` | **Date**: 2026-06-09

Research was performed as a parallel sweep over the codebase (QR scanning, QR
generation, Account Center structure, copy/share patterns, branding/theming,
preference storage, wallet state, testing conventions) plus an ecosystem survey
of styled-QR libraries, followed by an adversarial verification pass on the
library choice and a completeness critique against the spec. All decisions
below are final inputs to Phase 1 design.

## D1. QR rendering library — reuse `qrcode.react@4.2.0`, no new dependency

**Decision**: Render the address QR with the already-installed
`qrcode.react@4.2.0` (`QRCodeSVG`) through a new thin `AddressQRCode`
component. Do **not** add `qr-code-styling` or any other QR library. Do **not**
embed a center logo.

**Rationale**:
- `qrcode.react` is already a production dependency (ISC license, React 19
  compatible, ~6 KB gzip in use) and supports everything the spec needs:
  `fgColor`/`bgColor` accept any CSS color; error-correction level `H` already
  in use.
- An adversarial verification pass refuted the initial "add
  `qr-code-styling`" recommendation: it is CJS-only under Vite (weak
  tree-shaking), its npm release is stale (1.9.2, Apr 2025, 113 open issues),
  it duplicates installed capability, and its flagship feature (embedded
  logo) is exactly what caused the production mobile-webview broken-QR defect
  that spec 009 removed. Spec 009's contract G4 (no embedded `<image>` in QR)
  is enforced by existing tests and stays binding.
- "FairWins stylized" is delivered by the frame, not the modules: white
  quiet-zone card, brand-corner accents (`::before`/`::after` pattern already
  used in `ShareModal.css`), FairWins wordmark below the code, and the curated
  foreground color (D2). Zero bundle growth, zero scannability risk from
  module reshaping.

**Alternatives considered**:
- `qr-code-styling@1.9.2` (rounded/dot modules, gradients, logo) — rejected:
  stale releases, CJS-only, +14 KB for capability not required by the spec,
  logo feature conflicts with spec 009 G4.
- `react-qrcode-logo`, `react-qr-code` — rejected: redundant with the
  installed library.
- Extending `WagerQRCode` with color props — rejected in favor of a separate
  `AddressQRCode`: `WagerQRCode` is contractually pinned to
  `#0E141B`-on-`#FFFFFF` by spec 009 tests (G3); a separate component keeps
  that contract untouched and keeps wager-share surfaces fixed-color (see D9).

## D2. Curated color palette — 4 dark-on-white options, contrast computed

**Decision**: Offer exactly four named foreground colors on a **fixed
`#FFFFFF` background**, stored by palette id:

| Id | Name | Hex | Contrast vs #FFFFFF | Notes |
|----------|----------|-----------|---------------------|-------|
| `midnight` | Midnight | `#0E141B` | 18.51:1 | Default; identical to the spec 009 wager-QR foreground |
| `forest` | Forest | `#14532D` | 9.11:1 | Dark member of the FairWins green family |
| `ocean` | Ocean | `#1E3A8A` | 10.36:1 | Dark member of the Odds Blue family |
| `plum` | Plum | `#581C87` | 10.88:1 | Accent option; deliberately non-red |

**Rationale**:
- ISO 18004 scanning floor is ~3:1; WCAG AA is 4.5:1; ecosystem research
  recommends much higher for camera reliability. Every offered option is
  ≥ 7:1 (computed WCAG relative-luminance ratios above), satisfying FR-006
  and SC-002 by construction — the user cannot select an unscannable
  combination.
- The flagship brand green `#36B37E` measures **2.66:1** on white — below
  both the WCAG floor and reliable-scan thresholds — so it is explicitly
  **excluded**; `forest` is the brand-adjacent substitute.
- Inverted (light-on-dark) QR codes are unreliable with many scanner
  libraries and are **excluded**; background is always `#FFFFFF` (this also
  overrides an earlier internal suggestion of a "light" inverted option —
  the ecosystem findings won that conflict).
- Red/orange foregrounds are excluded (camera sensors are weak on red
  wavelengths; red-green confusability affects ~8 % of male users).
- Palette entries carry human-readable names so swatches are never
  differentiated by color alone (WCAG 1.4.1; see D8).

**Alternatives considered**: free-form color picker — rejected; cannot
guarantee scannability or pass FR-006 without runtime contrast rejection UX,
which is more complexity for less usability. Inverted/light option — rejected
per above.

## D3. Entry point and display surface — Account tab button → branded modal

**Decision**: Add a "Show QR" button to the wallet-details block of the
**Account tab** in `frontend/src/pages/WalletPage.jsx` (the tab already renders
the address text + disconnect button). The button opens a new
`AddressQRModal` (`frontend/src/components/ui/AddressQRModal.jsx`) containing:
the QR (`AddressQRCode`, ~240 px desktop / ~200 px mobile), the full address
text, Copy and Share buttons, and the color radiogroup.

**Rationale**:
- SC-001 requires ≤ 2 interactions from the account portal; portal → "Show QR"
  is 1 interaction.
- Modal (vs inline) keeps the QR large and scannable at arm's length, and the
  repo has a mature modal idiom to reuse (`ShareModal.jsx` /
  `ModalSystem.css`: fixed backdrop, `role="dialog"`, `aria-modal="true"`,
  Escape-to-close, focus management, bottom-sheet behavior on mobile).
- The color picker lives **inside the modal** for immediacy — the user sees
  the QR restyle as they pick. The spec's "customize ... in the account
  portal" is satisfied because the modal is part of the Account Center.

**Out of scope (explicit)**: a WalletButton-dropdown shortcut, a Preferences-tab
mirror of the color control, and any change to the `/wallet` route name. These
can be follow-ups; they are not needed for any FR or SC.

## D4. Wallet state and reactivity

**Decision**: Read `address` and `isConnected` from the existing `useWallet()`
hook (`WalletContext`, backed by wagmi `useAccount`). The Account tab is
already gated on `isConnected` (WalletPage renders a connect prompt
otherwise), which satisfies FR-008; the modal additionally renders nothing
(and shows a connect prompt) if `address` becomes falsy while open. Because
`address` flows from context, an account switch re-renders the open modal with
the new address automatically (FR-009) — no manual `accountsChanged` listener
is added.

**Rationale**: matches the repo-wide pattern ("never use raw wagmi hooks in
components; WalletProvider is the single source of truth"), and wagmi's
reactive state already propagates account changes.

## D5. Address casing — EIP-55 passthrough, no transformation

**Decision**: The QR payload, the readable text, the clipboard payload, and
the share payload all use the address **exactly as provided by the wallet
connection** (wagmi returns EIP-55 checksummed). No lowercasing, no
re-checksumming. Tests assert the checksummed form. The QR encodes the **plain
address** (42 chars), not an `ethereum:` URI (per the spec assumption —
maximizes compatibility with general-purpose scanners and with FairWins' own
scanner, whose extraction regex `/0x[a-fA-F0-9]{40}/` accepts it; verified in
`FriendMarketsModal.handleQrScanSuccess`).

**Rationale**: checksummed casing is what other wallets expect to paste;
transforming it would break "exact address" assertions (FR-002) and EIP-55
error detection for recipients. Storage keys elsewhere in the repo lowercase
addresses, but that is a storage concern, not a display/share concern (and the
QR color preference is not wallet-scoped anyway, see D6).

## D6. Color-preference persistence — `fairwins_qrcolor_v1`, plain string, per device

**Decision**: New module `frontend/src/utils/qrColorPreference.js` exporting
the palette (D2) and `getQRColorPreference()` / `setQRColorPreference(id)`,
backed by `localStorage` key **`fairwins_qrcolor_v1`** holding the palette id
as a plain string. Default `midnight` when unset/invalid/storage-unavailable.
Not wallet-scoped, not chain-scoped.

**Rationale**: mirrors the established `viewPreference.js` pattern (plain
string, dedicated module, graceful fallback). A display preference is
per-device UX state — wallet- or chain-scoping it would add complexity with no
user benefit (matches `themeMode` precedent). The `_v1` suffix gives a clean
migration path if customization later expands. Writes wrapped in try/catch and
never throw (private-browsing quota errors degrade to session-only behavior).

## D7. Copy and share behavior

**Decision**:
- New shared hook `frontend/src/hooks/useClipboard.js` returning
  `{ copied, error, copy }`: `copy(text)` uses `navigator.clipboard.writeText`
  with feature detection; on success sets `copied` for 2000 ms (existing
  repo timing); on failure (API missing or promise rejection) sets `error`.
- Copy button: inline state feedback — label/icon swap to "Copied!" on
  success; on failure an **inline, visible error message** ("Couldn't copy —
  select the address text to copy manually") rendered near the button via
  `role="status"` / `aria-live="polite"`. The address text remains visible
  and user-selectable at all times as the manual fallback. **No
  `window.alert`** (improves on the legacy pattern), and no NotificationSystem
  toast — inline state matches the existing share-surface idiom and keeps the
  component self-contained.
- Share button: if `navigator.share` exists, call
  `navigator.share({ text: SHARE_TEXT })` mirroring `ShareModal.jsx`'s
  feature-detection pattern; `AbortError` (user cancelled) is silently
  ignored. If `navigator.share` is absent, the Share button is not hidden —
  it performs the copy path and announces "Address copied" (graceful
  degradation per FR-005).
- **Share payload** (fixed string): `My FairWins wallet address:\n<address>`
  — context line first, address alone on its own line so recipients can
  copy it cleanly. Text-only share (no `url`, no `title`) so messaging apps
  don't mangle the address into a link preview.

**Rationale**: consolidates the three existing copy implementations' idiom
into one tested hook (the repo currently duplicates clipboard logic with
console-only failure handling — FR-004 requires visible failure feedback,
which has no precedent to copy, so this defines the pattern).

## D8. Accessibility design (constitution V gate)

**Decision**:
- Modal: `role="dialog"`, `aria-modal="true"`, labelled by its heading;
  Escape closes; focus moves into the modal on open and returns to the
  trigger on close (existing `ShareModal`/`QRScanner` focus conventions).
- QR: `role="img"` with `aria-label` of the form "QR code for your wallet
  address 0x1234…ABCD".
- Color picker: a **radiogroup** (`role="radiogroup"` with labelled radios or
  native radio inputs) of four named swatches — each swatch shows/announces
  its name (Midnight, Forest, Ocean, Plum), is keyboard-selectable, and shows
  a non-color selection indicator (outline + check) so selection is never
  color-only (WCAG 1.4.1).
- Feedback messages use `aria-live="polite"`.
- `prefers-reduced-motion` disables modal entrance animations.
- A vitest-axe test runs against the open modal (`toHaveNoViolations`),
  joining the existing axe CI job; Lighthouse a11y gate (≥ 0.9) already runs
  in CI.

## D9. Spec 009 contract coexistence

**Decision**: `WagerQRCode.jsx`, its CSS, and `WagerQRCode.test.jsx` are not
modified. The three wager-share surfaces keep fixed `#0E141B`-on-white
forever. `AddressQRCode` is a sibling component with its own contract
(`contracts/address-qr-ui-contract.md`) that inherits spec 009's hard-won
invariants: SVG rendering, fixed white background, `level="H"`,
`marginSize={2}`, **no `imageSettings` / no embedded `<image>` element**,
null render on empty value.

**Rationale**: the completeness critique flagged that parameterizing
`WagerQRCode` would violate or force renegotiation of the spec 009 contract;
a sibling component keeps both specs independently enforceable in CI.

## D10. Scannability verification strategy (SC-002)

**Decision**: two layers, explicitly split:
1. **Automated (CI)**: a unit test computes the WCAG contrast ratio of every
   palette entry against `#FFFFFF` and asserts ≥ 4.5:1 *and* that the
   foreground is the darker color (no inverted entries); plus contract tests
   asserting the rendered SVG uses exactly the palette hex values, `level="H"`,
   and contains no `<image>` element. This makes "every offered color
   preserves scannability" a structural property the suite enforces.
2. **Manual (acceptance gate)**: a documented device matrix in
   `quickstart.md` — scan each of the four colors with iOS Camera, Android
   Camera/Lens, and the FairWins in-app `QRScanner` — executed before merge
   and recorded in the PR. jsdom cannot decode QR images, and adding a
   rasterize+decode pipeline (node-canvas + jsqr) would introduce a native
   system dependency for marginal value over the contrast proof; rejected.

**Rationale**: honest split between what CI can prove (contrast, encoding
inputs, structural invariants) and what only real cameras can prove (optical
decode), with the latter made an explicit, checklisted acceptance step instead
of an unstated hope.

## D11. Testing approach (constitution II gate)

**Decision**: Vitest suites in `frontend/src/test/` (flat convention):
- `qrColorPreference.test.js` — default, round-trip, invalid stored value →
  default, storage-throwing environment → default (no crash).
- `useClipboard.test.jsx` — success sets `copied` then resets after 2 s
  (fake timers); rejection sets `error`; missing `navigator.clipboard` sets
  `error` without throwing. Clipboard mocked via
  `Object.defineProperty(navigator, 'clipboard', ...)` reset in
  `beforeEach` (existing setup.js precedent).
- `AddressQRCode.test.jsx` — palette contrast assertions (D10.1), SVG
  attributes (fg/bg/level/margin), no `<image>`, returns null for empty
  value, aria-label present.
- `AddressQRModal.test.jsx` — open/close + focus + Escape; copy
  success/failure UX; share via `navigator.share` mock
  (`Object.defineProperty` in `beforeEach`, including absence → copy
  fallback); radiogroup keyboard selection updates QR fgColor and persists;
  axe `toHaveNoViolations` on the open modal.
- `WalletPage` integration — Show QR button renders in Account tab when
  connected; modal opens; (existing connect-prompt gating reused when not
  connected). Wallet state mocked at the context level (repo convention:
  mock `WalletContext.Provider` values, not raw wagmi hooks).

Known repo gotchas honored: `vi.hoisted()` for factory-referenced mocks,
identity-stable mock returns, `vi.mock('qrcode.react')` only where the real
SVG is not under test (contract tests use the real renderer).

## Resolved clarifications index

| Open question (from spec/critique) | Resolution |
|---|---|
| New component vs parameterize WagerQRCode | Sibling `AddressQRCode`; spec 009 untouched (D1, D9) |
| Which colors, validated how | 4 fixed dark-on-white options, computed ≥ 7:1; brand green excluded at 2.66:1 (D2) |
| What "FairWins stylized" means | Branded frame + curated fg color; no logo, no module reshaping, no new lib (D1) |
| SC-002 decode verification | CI contrast/structure tests + manual device matrix in quickstart (D10) |
| Copy failure UX | `useClipboard` hook; inline visible error + always-selectable address; no alert (D7) |
| Share payload & API details | `My FairWins wallet address:\n<address>`, text-only `navigator.share`, copy fallback (D7) |
| Entry point / surface | Account tab "Show QR" button → branded modal; 1 interaction (D3) |
| Color control placement & a11y | Radiogroup of named swatches inside the modal; axe-tested (D3, D8) |
| Address casing | EIP-55 passthrough everywhere; tests assert checksummed form (D5) |
