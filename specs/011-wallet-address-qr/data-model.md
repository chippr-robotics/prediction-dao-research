# Data Model: Wallet Address QR Display & Sharing

**Feature**: `011-wallet-address-qr` | **Date**: 2026-06-09

No on-chain, subgraph, or server data is involved. The feature's "data" is the
live wallet address (read-only, from context), one persisted display
preference, and transient UI state.

## Entities

### WalletAddress (read-only, derived)

| Attribute | Type | Source | Rules |
|-----------|------|--------|-------|
| `address` | `string \| undefined` | `useWallet()` → WalletContext → wagmi `useAccount` | EIP-55 checksummed as returned by the wallet; **never transformed** (no lowercase, no re-checksum). `undefined` when disconnected. |
| `isConnected` | `boolean` | `useWallet()` | Gates the entire feature surface (FR-008). |

**Invariants**
- The QR payload, visible text, clipboard payload, and share payload are all
  the identical `address` string (FR-002).
- A falsy `address` must never reach `AddressQRCode` as a renderable value —
  the component returns `null` and the parent shows the connect prompt.
- When `address` changes (account switch), all renders derive from the new
  value on the next React render — no cached/stale copies are kept in
  component state (FR-009).

### QRColorPreference (persisted)

| Attribute | Type | Rules |
|-----------|------|-------|
| `paletteId` | `'midnight' \| 'forest' \| 'ocean' \| 'plum'` | Stored as a plain string in `localStorage` under key `fairwins_qrcolor_v1`. Default `'midnight'`. |

**Validation / state transitions**
- Read: missing key, unknown value, or storage access error → `'midnight'`
  (never throw, never render an out-of-palette color).
- Write: `setQRColorPreference(id)` ignores ids not in the palette; storage
  write failures are caught and logged (`console.warn`), leaving in-memory
  state authoritative for the session.
- Scope: per device, global — **not** wallet-scoped, **not** chain-scoped.

### QRColorPalette (static constant)

Defined once in `frontend/src/utils/qrColorPreference.js` and exported as the
single source of truth for components and tests:

| `id` | `name` (user-visible) | `fg` (hex) | Contrast vs `#FFFFFF` |
|------|------|------|------|
| `midnight` | Midnight | `#0E141B` | 18.51:1 |
| `forest` | Forest | `#14532D` | 9.11:1 |
| `ocean` | Ocean | `#1E3A8A` | 10.36:1 |
| `plum` | Plum | `#581C87` | 10.88:1 |

**Invariants** (enforced by unit test, see contract C7)
- Every entry: contrast(fg, `#FFFFFF`) ≥ 4.5:1 (actual palette ≥ 7:1).
- Every entry: fg is darker than the background (no inverted QR).
- Background is not an attribute — it is fixed `#FFFFFF` everywhere.
- Every entry has a non-empty `name` (a11y: never color-only identification).

### Transient UI state (not persisted)

| State | Owner | Values / behavior |
|-------|-------|-------------------|
| `isQRModalOpen` | `WalletPage` (Account tab) | Opens via "Show QR" button; closes via Escape, backdrop, close button. |
| `copied` | `useClipboard` | `false → true` on successful copy, auto-reset after 2000 ms. |
| `copyError` | `useClipboard` | Set on clipboard rejection/absence; cleared on next attempt; drives inline `role="status"` message. |
| selected swatch | `AddressQRModal` | Initialized from `getQRColorPreference()`; selecting a radio updates the rendered QR immediately and calls `setQRColorPreference`. |

## Relationships

```text
WalletContext ──address──▶ WalletPage (Account tab)
                              │  "Show QR" (only when isConnected)
                              ▼
                        AddressQRModal ──reads/writes──▶ QRColorPreference (localStorage)
                          │     │    │
                          │     │    └─ useClipboard ──▶ navigator.clipboard
                          │     └────── navigator.share (fallback → useClipboard)
                          ▼
                    AddressQRCode (value=address, fgColor=palette[paletteId].fg)
```

## Share payload (derived value)

```text
My FairWins wallet address:
<address>
```

- Built as `` `My FairWins wallet address:\n${address}` ``.
- Passed as `navigator.share({ text })` only — no `url`, no `title` (prevents
  link-preview mangling of the address in messaging apps).
- The same full string is used for the share-fallback copy; the plain
  `address` alone is used for the Copy button.
