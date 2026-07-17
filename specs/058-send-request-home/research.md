# Research: Pay / Request / Wager Home (spec 058)

**Date**: 2026-07-17 · **Spec**: [spec.md](./spec.md)

All unknowns from the Technical Context were resolved by codebase research (two
sweeps: home/nav surface; transfer/QR/preferences infrastructure). No external
research required — every building block already exists in `frontend/`.

## R1. Home surface architecture — where the three modes live

**Decision**: Keep the home at `/app` rendered by
`frontend/src/components/fairwins/HomeScreen.jsx`, and add a home-internal
`mode` state (`'pay' | 'request' | 'wager'`) — no new routes. The Wager mode
renders the existing embedded `<CreateChallengePanel embedded>` unchanged; Pay
and Request are two new sibling panels styled with the same `.fm-pay-*` layout
(FriendMarketsModal.css:492-587) and the reusable `AmountKeypad`
(`components/ui/AmountKeypad.jsx`, contract in spec 052).

**Rationale**: Spec 053 already made HomeScreen a thin orchestrator
(`.home-create` section + `.home-actions` + `.home-ticker`); a mode switch
slots in at that orchestration level and reuses the whole payments-style CSS
system. Routes would break the "one view, switch the verb" feel and complicate
draft retention (FR-015).

**Alternatives considered**: Separate routes (`/app/pay`, `/app/request`) —
rejected: remount cost, draft loss on switch, deep-link surface not required
by spec. A single mega-panel with internal mode — rejected: CreateChallengePanel
is already 509 lines; keeping wager untouched (FR-012) means composing beside
it, not inside it.

## R2. Mode switcher — mobile bottom nav and desktop equivalent

**Decision**: Mobile: reuse **`components/nav/SectionIconNav.jsx`** — the
existing presentational, mobile-only bottom bar (`useIsMobile()` ≤768px,
renders `NavIcon` glyphs, null on desktop). Feed it three items: Pay
(outgoing-arrow glyph), Request (incoming-arrow glyph), Wager (head-to-head
glyph, visually consistent with `resolutionIcons.jsx`'s EitherSideIcon).
Desktop/tablet: a `PillSelect` segmented control (`components/ui/PillSelect.jsx`,
already a labeled radiogroup) at the top of the home surface (FR-011).

**Rationale**: SectionIconNav is exactly the spec's pattern and already
accessible + viewport-gated; PillSelect is the app's established segmented
switcher (used for resolution pills). Zero new nav primitives.

**Alternatives considered**: New bespoke bottom bar — rejected (duplicate of
SectionIconNav). App-wide persistent bar — ruled out by clarification
(home-surface only).

## R3. Pay panel — reusing the transfer engine

**Decision**: New `PayPanel` component composes `AmountKeypad` + the standard
recipient stack (`AddressInput` with `enableAddressBook`/`chainId`,
`AddressBookButton`, `QRScanner`, `AddressScreenNotice`) + memo input +
"Pay" primary button, and submits through the existing
**`hooks/useTransfer.js`** engine (`send({ asset, to, amount })`) — the same
routing table the wallet's TransferForm uses (passkey UserOps incl.
sponsorship, EIP-3009 gasless stablecoin with self-submit fallback, EOA
native/ERC-20, vault proposal). Balance gating (`refreshBalances`,
over-balance block), screening (`useAddressScreening` advisory block on
`restricted`), and chain-switch gating (`useSwitchChain` "Switch to X")
follow TransferForm's proven patterns (TransferForm.jsx:180-239).

**Rationale**: FR-004/FR-018 pin "no new value-movement path". `useTransfer`
is the single tested engine with honest lifecycle and never-stranded
fallbacks; PayPanel is a thinner, payments-style *presentation* of it.

**Alternatives considered**: Embedding `TransferForm` itself on home —
rejected: its form-style layout (asset dropdown, from-select, preview step)
doesn't match the amount-hero/numpad UX; extracting its engine (already a
hook) is the intended seam. Modifying TransferForm to be dual-layout —
rejected: higher regression risk on the wallet page for no reuse gain.

## R4. Currency selection and the "USDC default"

**Decision**: The amount hero's currency is a *kind*, not a free token list:
`'stable'` (default — the active network's stablecoin, i.e. USDC on
Polygon/Ethereum/Amoy/Sepolia via `getNetwork(chainId).stablecoin`) or
`'native'` (the network coin). Resolved per network through
`useChainTokens()` (`stable`, `stableAddress`, `stableDecimals`); the hero
caption always shows the *actual* symbol (honest state — e.g. "USC" on
ETC/Mordor where the stablecoin is not USDC). The default kind comes from the
new home preference (R6), preset `'stable'`; a compact token pill on the hero
(the prepared-but-unused `.fm-pay-token-select` style,
FriendMarketsModal.css:679) switches it per-transaction.

**Rationale**: `useTransfer` only has first-class rails for native + network
stablecoin (TRANSFER_KIND); arbitrary portfolio tokens would drag the full
asset dropdown onto the minimalist home. "USDC" in the spec maps cleanly to
the stablecoin kind on all launch networks.

**Alternatives considered**: Full `TransferAssetSelect` on home — rejected
(density; the wallet page keeps it for power users). Hardcoded USDC-only —
rejected: FR-014 requires a default-currency preference with supported
choices, and native-coin sends are a supported transfer.

## R5. Payment-request format and parsing (Request mode + Pay scanner)

**Decision**: New library module `frontend/src/lib/payments/paymentRequest.js`
with two pure functions:

- `buildPaymentRequestUri({ chainId, to, kind, tokenAddress, decimals, amount, note })`
  → **EIP-681** URI. ERC-20 (stable):
  `ethereum:<tokenAddress>@<chainId>/transfer?address=<to>&uint256=<units>`;
  native: `ethereum:<to>@<chainId>?value=<wei>`. The note rides as an extra
  `message=<urlencoded>` query parameter — standard wallets ignore unknown
  params; FairWins reads it (per clarification). Amounts in base units
  (`ethers.parseUnits`), never floats.
- `parsePaymentRequest(decodedText)` → `{ to, chainId?, tokenAddress?,
  amountUnits?, note? } | null`. Handles full EIP-681 (with `@chainId`,
  `/transfer`, `value`/`uint256`, `message`), bare `ethereum:` URIs, and raw
  addresses (superset of today's regex-only
  `lib/addressBook/scanAddress.js#extractAddressFromScan`, which stays as-is
  for its existing callers).

The QR itself renders via **`qrcode.react`'s `QRCodeSVG`** following the
`components/ui/AddressQRCode.jsx` pattern (level "H", palette from
`utils/qrColorPreference.js`); copy + `navigator.share` follow
`AddressQRModal.jsx`. The note is also displayed as plain text beside the QR
(clarification).

Pay-side guards on scan: `chainId` mismatch with the active network →
surfaced with the existing switch-network affordance before any prefill of a
send; `tokenAddress` not the active network's stablecoin (nor absent/native)
→ clear error, **no partial prefill** (edge case: never a wrong-asset send).

**Rationale**: EIP-681 is the interoperable standard third-party wallets scan
(clarified: standard-URI-first); `qrcode.react` and the QR display/share
chrome already exist. Parsing must be a new module because
`extractAddressFromScan` is regex-only (no amount/chain/token) — extending it
in place would risk its existing address-book callers.

**Alternatives considered**: FairWins deep-link QR — rejected by
clarification. Adding an EIP-681 parser dependency — rejected: the needed
subset (address@chain, /transfer, 3 params) is small, and no maintained
first-party lib is already present.

## R6. Preferences — storage pattern for default view + default currency

**Decision**: **Device-scoped localStorage module** (established "Pattern B"):
`frontend/src/utils/homePreference.js`, single key `fairwins_home_v1`,
storing `{ defaultMode: 'pay'|'request'|'wager', defaultCurrencyKind:
'stable'|'native' }` with graceful fallbacks (missing/corrupt storage → coded
defaults `pay`/`stable`, never throws — mirrors `qrColorPreference.js` /
`quickAccessPreference.js`, including the `subscribe` pub/sub used by
`quickAccessPreference` so the settings panel and home stay in sync). Exposed
in the account section via a new small `HomePreferencesPanel` following
`QuickAccessCardsPanel`'s panel pattern.

**Rationale**: The default home mode must apply on first paint at `/app`,
**including while disconnected** — the wallet-keyed
`UserPreferencesContext`/`userStorage` pattern (Pattern A) has no account
until connect, so it cannot answer "which mode do I open in?" at load. The
existing spec-053 home already uses a Pattern-B util
(`quickAccessPreference`).

**Alternatives considered**: Pattern A (per-wallet) — rejected for the
mode/currency defaults for the reason above; can be layered later if
per-wallet divergence is ever wanted.

## R7. Draft retention across mode switches (FR-015)

**Decision**: All three mode panels stay **mounted** while the home screen is
open; the inactive two are hidden (`hidden` attribute + CSS), so each panel's
local `useState` draft (amount/recipient/note) survives switching for free
and never leaks across modes. CreateChallengePanel keeps its existing local
state untouched.

**Rationale**: CreateChallengePanel's draft is deeply internal (spec-053
design); lifting three drafts into HomeScreen would force refactoring the
wager panel that FR-012 says must not change. Hidden-but-mounted is the
smallest mechanism that satisfies FR-015, and `hidden` keeps the inactive
panels out of the a11y tree and tab order.

**Alternatives considered**: Lift draft state to HomeScreen — rejected
(touches CreateChallengePanel). Unmount + serialize drafts to a store —
rejected (new state machinery, YAGNI).

## R8. Secondary content in Pay/Request modes (deferred clarify question)

**Decision**: Strictly minimal. The Wager mode keeps its existing extras
("Accept a challenge" / "My Wagers" buttons and the Polymarket ticker —
shown only in Wager mode); Pay and Request render only their core controls.
No recent-recipients row in v1.

**Rationale**: The spec mandates nothing extra for Pay/Request and the user
emphasized minimalist design; the address book button already gives one-tap
access to saved recipients, which covers the recent-recipients job. Additive
later without spec change.

## R9. Testing approach

**Decision**: Vitest + @testing-library/react per repo convention:
- `lib/payments/paymentRequest` — pure unit tests: build/parse round-trip,
  EIP-681 edge cases (no chainId, native vs token, bad token, note encoding).
- `utils/homePreference` — defaults, corrupt-storage fallback, subscribe.
- `PayPanel` / `RequestPanel` — component tests with mocked `useTransfer` /
  wallet hooks (pattern: `test/CreateChallengePanel.test.jsx`); gating cases
  (zero amount, over balance, restricted recipient, disconnected, chain
  mismatch).
- `HomeScreen` — extend `test/HomeScreen.test.jsx` (child-mocking pattern):
  default-mode from preference, switcher wiring, wager extras only in wager
  mode, drafts survive switching.
- Accessibility: axe test for the new home surface (pattern:
  `test/pools.axe.test.jsx`) covering the glyph nav's accessible names
  (FR-017).
- Cypress fast E2E: extend the home smoke to switch modes and generate a
  request QR.

**Rationale**: Matches Constitution II and the existing test layout
(`src/test/*.test.jsx` + co-located `__tests__/`).

## Resolved Technical Context values

| Item | Resolution |
| --- | --- |
| Language/runtime | JavaScript (ES2022) + JSX, React 19 function components |
| Router | react-router-dom v7 (routes in `App.jsx`; no new routes) |
| Chain state | wagmi v3 + viem v2 (`useChainId`, `useSwitchChain`), ethers v6 for encoding/units |
| QR generate / scan | `qrcode.react` ^4.2 (`QRCodeSVG`) / `html5-qrcode` ^2.3.8 (`QRScanner.jsx`) |
| Transfer engine | `hooks/useTransfer.js` (reused, unchanged) |
| Screening | `hooks/useAddressScreening.js` (advisory; on-chain guard is enforcement) |
| Token config | `config/networks.js` `stablecoin` block via `useChainTokens()` |
| Preferences | new `utils/homePreference.js` (Pattern B, key `fairwins_home_v1`) |
| Viewport | `hooks/useMediaQuery.js` (`useIsMobile()` ≤768px) |
| Testing | Vitest + @testing-library/react + axe; Cypress fast E2E |
