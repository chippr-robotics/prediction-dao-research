# Phase 1 Data Model: Fix QR Share & Scan Rendering

This is a UI-rendering fix with no persistence and no on-chain data changes. The "entities" below are the UI value objects and the props contract of the shared component; they exist to make the requirements testable, not to model storage.

## Entity: Share Link

The URL a QR encodes and the copy-link control exposes.

| Field | Type | Rules |
|-------|------|-------|
| `url` | string (absolute URL) | Derived at render time from the wager/market (e.g. acceptance/market URL). MUST be identical to the value shown in the surface's copy-link input (FR-005). MUST be non-empty before a QR is rendered; if it cannot be produced, the surface shows an explicit message instead of a QR (FR-008). |

State: ephemeral (computed on open). No transitions.

## Entity: QR Surface

A UI location that displays a QR for a Share Link. Three instances, all rendered through `WagerQRCode`.

| Instance | Component | Link source |
|----------|-----------|-------------|
| Create-wager success | `FriendMarketsModal` success step | `getMarketUrl(createdMarket)` |
| Share Wager modal | `ShareWagerModal` | `url` prop |
| Market Share modal | `ShareModal` | `marketUrl` or `\`${origin}/market/${market.id}\`` |

Invariants (all instances): renders a scannable QR with dark modules on a solid white quiet-zone background; never renders a broken-image placeholder; encoded payload equals the displayed link; carries an accessible name.

## Entity: WagerQRCode (shared component props contract)

| Prop | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `value` | string | yes | — | The Share Link URL to encode. |
| `size` | number | no | 200 | Pixel size of the QR. |
| `ariaLabel` | string | no | `"QR code"` | Accessible name (WCAG). |
| `className` | string | no | — | Optional wrapper class for surface-specific spacing. |

Fixed internal policy (not props, to guarantee consistency): `level="H"`, `bgColor="#FFFFFF"`, `fgColor` = brand-dark (e.g. `#0E141B`), **no `imageSettings`** (no embedded center logo), white-padded container providing the quiet zone.

## Entity: QR-Scan Affordance

The button beside the Opponent Address field that opens the camera scanner.

| Field | Type | Rules |
|-------|------|-------|
| icon | inline SVG | MUST render with explicit non-zero dimensions (immune to global `svg { height: auto }`) and an icon color ≥3:1 contrast against the button background in **both** themes (FR-012, WCAG 1.4.11). |
| accessible name | string | `"Scan QR code"` (already present) — keep. |
| action | callback | Activating opens `QRScanner`; a successfully scanned `0x…` address populates `opponent` + `opponentResolved` (FR-013). |

State: `qrScannerOpen` (bool), `qrScanTarget` (`'opponent' | null`) — existing local state in `FriendMarketsModal`; unchanged by this fix.
