# UI Contract: Address QR Display & Sharing

**Feature**: `011-wallet-address-qr` | **Date**: 2026-06-09

Observable guarantees that Vitest suites assert. Follows the format of
`specs/009-fix-qr-share/contracts/qr-ui-contract.md`; guarantees here apply to
the **new** components only — spec 009's contract over `WagerQRCode` remains
in force, untouched.

## Component: `AddressQRCode` (`frontend/src/components/ui/AddressQRCode.jsx`)

### Props

| Prop | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `value` | `string` | yes | — | The wallet address, EIP-55 casing preserved |
| `paletteId` | `string` | no | `'midnight'` | One of the `QR_COLOR_PALETTE` ids; unknown ids render as `'midnight'` |
| `size` | `number` | no | `240` | Pixel size of the SVG |
| `ariaLabel` | `string` | no | derived | Accessible name for the QR image |
| `className` | `string` | no | — | Pass-through for layout |

### Guarantees

- **C1 (render)**: With a non-empty `value`, renders exactly one `<svg>`
  element (qrcode.react `QRCodeSVG`).
- **C2 (encoding)**: The QR encodes `value` verbatim — the plain address
  string, checksummed casing intact, no URI scheme, no whitespace.
- **C3 (colors)**: The SVG foreground equals `QR_COLOR_PALETTE[paletteId].fg`
  and the background equals `#FFFFFF`. Background is never any other value
  and never `transparent`.
- **C4 (no embedded image)**: The rendered SVG contains **no** `<image>`
  element; `imageSettings` is never passed. (Inherits spec 009 G4 — the
  mobile-webview broken-image defect class stays dead.)
- **C5 (robust encoding params)**: `level="H"` and `marginSize={2}` (quiet
  zone) are always set.
- **C6 (empty value)**: Empty/falsy `value` renders `null` — never a QR of an
  empty string, never a placeholder.
- **C7 (palette validity — tested at the palette, applies to every render)**:
  every `QR_COLOR_PALETTE` entry has WCAG contrast ≥ 4.5:1 against `#FFFFFF`
  and is darker than the background; every entry has a non-empty `name`.
- **A1 (a11y)**: The QR has `role="img"` and an accessible name that includes
  a shortened form of the address (e.g. "QR code for your wallet address
  0x1234…ABCD").

## Component: `AddressQRModal` (`frontend/src/components/ui/AddressQRModal.jsx`)

### Props

| Prop | Type | Required | Notes |
|------|------|----------|-------|
| `isOpen` | `boolean` | yes | Modal renders nothing when `false` |
| `onClose` | `function` | yes | Invoked by close button, backdrop, Escape |
| `address` | `string` | yes | Connected wallet address (EIP-55) |

### Guarantees

- **M1 (gating)**: When `isOpen` is `false`, nothing is rendered. When
  `address` is falsy while open, no QR is rendered — a connect prompt is
  shown instead.
- **M2 (content)**: When open with a valid address: renders `AddressQRCode`,
  the full address text (user-selectable), a Copy button, a Share button, and
  the color radiogroup — all within one dialog. (Satisfied incrementally:
  QR + address in US1, Copy/Share in US2, radiogroup in US3; fully met after
  US3.)
- **M3 (dialog semantics)**: `role="dialog"`, `aria-modal="true"`, labelled
  by the modal heading; Escape closes; focus moves into the dialog on open
  and returns to the trigger on close. (Vitest asserts what jsdom supports —
  `document.activeElement` transitions; full tab-cycle trapping is verified
  manually per quickstart.)
- **M4 (copy success)**: Activating Copy writes the exact `address` string to
  the clipboard and shows visible confirmation ("Copied!") for ~2 s.
- **M5 (copy failure)**: If the clipboard API is missing or rejects, a
  visible inline error message appears (via `role="status"`,
  `aria-live="polite"`) and the address text remains selectable for manual
  copy. No `window.alert`. The button never shows success on failure.
- **M6 (share, native)**: When `navigator.share` exists, activating Share
  calls it with `{ text: 'My FairWins wallet address:\n' + address }` — text
  only, no `url`/`title`. A user-cancelled share (`AbortError`) produces no
  error UI.
- **M7 (share, fallback)**: When `navigator.share` is absent, the Share
  button remains present and copies the **full share payload**
  (`My FairWins wallet address:\n<address>`, matching data-model.md — not
  just the bare address) with visible "copied" confirmation (FR-005 graceful
  degradation).
- **M8 (color selection)**: The radiogroup offers exactly the four palette
  options, each with a visible/announced name; selecting one immediately
  re-renders the QR with that foreground and persists the id via
  `setQRColorPreference`. On next open, the persisted choice is
  pre-selected (FR-007).
- **M9 (selection a11y)**: Swatches are keyboard-operable radios; the
  selected state is indicated by more than color alone (outline/check).
- **M10 (reactivity)**: If `address` prop changes while open, the QR,
  address text, and copy/share payloads all reflect the new value on the
  next render (FR-009).
- **A2 (axe)**: The open modal passes vitest-axe `toHaveNoViolations`.
- **A3 (motion)**: Entrance animations are disabled under
  `prefers-reduced-motion: reduce`. (CSS-only behavior — verified by CSS
  inspection/manual check, not Vitest: the jsdom matchMedia mock always
  reports `matches: false`.)

### Quick variant (post-spec follow-up: Dashboard "Share Account" quick action)

`variant="quick"` renders a clean, minimally branded view for in-person
sharing. Guarantees added by PR #650:

- **V1**: No color options are rendered; the persisted Account-page choice
  (`fairwins_qrcolor_v1`) is applied automatically. The full (default)
  variant is unchanged.
- **V2**: The address text is not shown. The QR, Copy, and Share actions are
  unchanged (M4–M7 payloads identical).
- **V3**: On copy failure the address text is revealed as the manual-copy
  fallback, preserving M5's escape hatch.
- **V4**: Minimal branding — corner accents removed
  (`address-qr-modal--quick` modifier), white quiet-zone card and wordmark
  retained. Dialog semantics (M1, M3, M10) unchanged.

## Utility: `qrColorPreference` (`frontend/src/utils/qrColorPreference.js`)

### Exports

```text
QR_COLOR_PALETTE: [{ id, name, fg }]            // single source of truth (4 entries)
DEFAULT_QR_COLOR_ID: 'midnight'
getQRColorPreference(): string                  // palette id
setQRColorPreference(id: string): void
```

### Guarantees

- **P1**: `getQRColorPreference()` returns `'midnight'` when the key is
  missing, the stored value is not a palette id, or storage access throws.
- **P2**: `setQRColorPreference` round-trips via `localStorage` key
  `fairwins_qrcolor_v1` (plain string, no JSON).
- **P3**: `setQRColorPreference` with an unknown id is a no-op (stored value
  stays valid).
- **P4**: Neither function ever throws (storage failures are caught;
  `console.warn` at most).

## Hook: `useClipboard` (`frontend/src/hooks/useClipboard.js`)

### Shape

```text
const { copied, error, copy } = useClipboard()
// copy(text: string): Promise<boolean>
```

### Guarantees

- **H1**: On successful `navigator.clipboard.writeText`, `copied` becomes
  `true` and auto-resets to `false` after 2000 ms; `copy` resolves `true`.
- **H2**: On rejection or when `navigator.clipboard?.writeText` is absent,
  `error` is set (non-empty), `copied` stays `false`, `copy` resolves
  `false`, and nothing throws.
- **H3**: A new `copy` call clears the previous `error`/`copied` state first.

## Page integration: `WalletPage` Account tab

- **W1**: When connected, the Account tab's wallet-details block renders a
  "Show QR" button (accessible name includes "QR"); activating it opens
  `AddressQRModal` with the connected address. This is 1 interaction from the
  account portal (SC-001).
- **W2**: When not connected, the existing WalletPage connect prompt renders
  and no QR entry point exists (FR-008).
- **W3**: `WagerQRCode.jsx`, `WagerQRCode.css`, and `WagerQRCode.test.jsx`
  are byte-identical to their pre-feature state (spec 009 non-regression).
