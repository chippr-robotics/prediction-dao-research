# Feature Specification: Unified, Customizable Account Cards

**Feature Branch**: `claude/hardware-wallet-protect-ojldc1` (second PR from this branch line)
**Created**: 2026-08-15
**Status**: In progress
**Input**: The "acting as" account does not need a banner for any account type — all types are
treated equally, and the wallet avatar in the header identifies the account. Members customize
account cards (local profile picture, color shade, background pattern) through one consistent
editor, the account card component is standardized across the app, and cards get a soft
glass-morphism treatment so they read as their own layer.

## Why

Acting accounts today are announced twice: the header avatar already shows the acting account,
and a full-width "Operating as …" banner ALSO pushes the whole page down — but only for some
account kinds, which makes vaults feel like a special mode rather than just another account.
Meanwhile every surface draws its own account tile (carousel, switcher rows, vault list,
recovery list), so the same account looks different in each place, and members with several
accounts have nothing but truncated hex to tell them apart.

## What (user-facing)

### US1 — No banner, equal treatment

Operating as a vault, recovered, or hardware account shows NO banner anywhere. The header
wallet button's avatar (which already renders the acting account) is the identity cue, for
every account kind equally. Switching back to the personal wallet lives where it always did —
the account switcher.

### US2 — Customize an account's card

From any account card, the member opens one "Customize" sheet and can:
- set a profile picture from a local image (downscaled on-device; never uploaded anywhere),
- pick a color shade (a fixed palette of tints),
- pick a background pattern (none + a small set of subtle patterns),
- clear any of these back to the defaults (Blockies avatar, neutral card).

The customization applies to that account everywhere it appears, immediately.

### US3 — One card, everywhere

A single `AccountCard` component renders the account tile in every card context (starting with
the portfolio carousel), and a single `AccountAvatar` renders the identity everywhere an avatar
appears (header wallet button, switcher rows, cards, vault/recovery/hardware lists). Kind tags
(Multisig / Recovered / Hardware) remain, as tags — not as different layouts.

### US4 — The card is its own layer

Account cards carry a soft glass-morphism treatment — translucent surface, backdrop blur,
subtle border and highlight — visually distinct from the flat app chrome, in both themes. The
member's chosen tint and pattern render inside the glass.

## Functional Requirements

- **FR-001**: The operating-as banner is removed for ALL acting account kinds; no surface
  renders a persistent banner announcing the acting account.
- **FR-002**: The header wallet avatar renders the ACTING account's identity (image or
  Blockies) for every kind — personal, vault, legacy, hardware, derived.
- **FR-003**: One `AccountAvatar` component resolves identity art everywhere: member-set image
  first, Blockies fallback; sizes are props, behavior identical at every size.
- **FR-004**: One `AccountCard` component renders account tiles: avatar, label, kind tag,
  address, optional balance/status line, active state, customize affordance; the carousel uses
  it, and any future card surface must too.
- **FR-005**: Customization is per account address (case-insensitive), stored device-locally
  under the connected owner (`fw_user_<owner>_account_profiles`); it is cosmetic device state
  and is deliberately NOT a synced-backup object (same rule as nav prefs, spec 081) — a test
  asserts its absence from `syncedObjects`.
- **FR-006**: Profile pictures are chosen from local files, downscaled and re-encoded
  on-device to a small square (≤128px, ≤~64KB data URL) before storage; the original never
  leaves the device and no network request is involved.
- **FR-007**: Tints and patterns come from fixed curated sets (including "none"); values are
  stored as token ids, never raw CSS, so themes keep control of the rendering.
- **FR-008**: The customize sheet is the ONE editing surface, opened from any account card;
  changes render immediately across every surface (reactive store).
- **FR-009**: Cards use the glass treatment in both light and dark themes with legible
  contrast (WCAG 2.1 AA for all text on the glass), and degrade gracefully where
  `backdrop-filter` is unsupported (solid translucent fallback).
- **FR-010**: An account with no customization looks exactly like today's defaults aside from
  the shared glass card chrome — no migration, absence is the default.
- **FR-011**: Unsupported or oversized image files are refused with a stated reason in the
  sheet; a failed read never clears an existing picture.

## Out of scope

- Syncing cosmetics across devices (revisit if members ask; the store's merge shape permits it later).
- Per-chain or per-context variants of a card; one look per account.
- Avatars for arbitrary address-book contacts (this is about the member's own accounts).

## Security notes

- Images are read via FileReader/canvas locally; nothing is uploaded, fetched, or shared.
- Data-URL images render under the existing `img-src data:` CSP; no CSP change.
- Cosmetics carry no authority: nothing reads them for any decision beyond rendering.
