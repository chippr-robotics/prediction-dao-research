# Account Cards & Identity (spec 086)

Every account a member can act as — personal, multisig vault, recovered, hardware — is treated
equally: **there is no operating-as banner for any kind**. The header wallet button's avatar
renders the acting account's identity, and that is the cue. Switching back to the personal
wallet lives in the account switcher, where switching always lived.

## The three shared components

| Component | Job | Rule |
|---|---|---|
| `components/account/AccountAvatar.jsx` | The identity image everywhere one appears (header button, switcher rows, cards, vault/recovery/hardware lists) | Member-set picture first, Blockies fallback. Render this, never `BlockiesAvatar` directly, in account-identity positions. |
| `components/account/AccountCard.jsx` | The account tile in card contexts (the My Account carousel today) | One layout for every kind; the kind is a tag (`lib/account/accountKinds.js`), never a different card. The card is the listbox option — a single button, no nested interactive elements. |
| `components/account/AccountCustomizeSheet.jsx` | The ONE editing surface for card cosmetics | Live-applies to the store; opened from the "⋯" rendered on the centered card's corner. The control lives OUTSIDE the listbox DOM (an option may contain no interactive children) and is pinned to the measured card rect. |

## Cosmetics store

`lib/account/accountProfilesStore.js` — keyed by lowercased address:
`{ image?, tint?, pattern?, updatedAt }`.

- **Device-scoped, never synced.** Deliberately absent from `lib/backup/syncedObjects.js`
  (asserted by a test), for the navPreferences (spec 081) reasons: the header avatar must render
  on first paint before any wallet resolves, and image blobs must not bloat the encrypted
  backup. Cosmetics carry **no authority** — nothing may read them for any decision beyond
  rendering.
- **Images** are chosen from local files and processed entirely on-device
  (`lib/account/profileImage.js`: validate → cover-crop to 128px → re-encode, ≤96KB data URL).
  Nothing is uploaded; `img-src data:` already covers rendering.
- **Tints and patterns are token ids** (`CARD_TINTS` / `CARD_PATTERNS`), stored as ids and
  interpreted by CSS only — `theme.css` owns the `--card-tint-*` palette and the `--glass-*`
  surface tokens, so themes keep control and unknown ids sanitize away.

## Glass treatment

Cards use the shared glass tokens (`--glass-bg`, `--glass-border`, `--glass-blur`,
`--glass-shadow`, per-theme in `theme.css`) with a `@supports` fallback to a more opaque
translucent surface where `backdrop-filter` is unsupported. The chrome lives once, in
`AccountCard.css`, written at `.account-card[data-tint]` specificity so App.css's mobile
tap-target button rule cannot re-pad the card. Host surfaces (the carousel) contribute layout
only — width, snap, min-height.

## Verification

Vitest: `src/test/account/accountProfilesStore.test.js`, `AccountAvatar.test.jsx`,
`AccountCard.test.jsx`, `AccountCustomizeSheet.test.jsx`, plus the carousel suite. Visual:
`scripts/ui/capture-account-cards.mjs` + the actor-critic record in
`specs/086-account-cards/screenshots/`.
