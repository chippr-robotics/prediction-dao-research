# Contract: Home mode components (spec 058)

UI contracts for the new/changed components. All are frontend-only; the wager
path (`CreateChallengePanel`) is reused with its existing contract unchanged
(FR-012).

## HomeScreen (modified — `components/fairwins/HomeScreen.jsx`)

- Owns `mode: 'pay'|'request'|'wager'`, initialized from
  `getDefaultHomeMode()`.
- Renders ALL three panels, mounted; inactive panels get the `hidden`
  attribute (draft retention FR-015; hidden panels leave the a11y tree).
- Wager-only extras: `.home-actions` (Accept a challenge / My Wagers) and
  `.home-ticker` (PolymarketTickerCrawler) render only when
  `mode === 'wager'` (research R8), preserving today's `oracleMode` behavior
  within wager mode.
- Mode switcher: mobile (`useIsMobile()`) → `SectionIconNav`; otherwise →
  `PillSelect` row above the active panel.
- Ticker `onSelectMarket` additionally forces `mode = 'wager'` before the
  existing oracle preselect (deep entry into wager still works from any mode).

## SectionIconNav usage (existing component — `components/nav/SectionIconNav.jsx`)

- `items`: `[{ id:'pay', label:'Pay', icon:<outgoing-arrow> },
  { id:'request', label:'Request', icon:<incoming-arrow> },
  { id:'wager', label:'Wager', icon:<head-to-head> }]`
- `activeId` = current mode; `onSelect(id)` sets mode.
- Icons: three new glyphs added to the `NavIcon` set (outgoing arrow,
  incoming arrow, head-to-head consistent with `resolutionIcons.jsx`
  EitherSideIcon styling). Each item MUST carry an accessible name (FR-017).

## PayPanel (new — `components/fairwins/PayPanel.jsx`)

Props: `{ onSuccess?() }` — otherwise self-contained (hooks:
`useTransfer`, `useChainTokens`, `useAddressScreening`, `useWallet`,
`useSwitchChain`).

Layout (reuses `.fm-pay-*` classes + `AmountKeypad`):
1. Amount hero — `AmountKeypad` with `prefix="$"`,
   `token=<selected symbol>`; token pill (`.fm-pay-token-select`) toggles
   `stable`/`native` (default from `getDefaultCurrencyKind()`).
2. Recipient row — `AddressInput` (`enableAddressBook`, `chainId`,
   `onResolvedChange`) + `AddressBookButton` + scan button opening
   `QRScanner`; `AddressScreenNotice` under it.
3. Memo input (`.fm-pay-memo-input`, optional, client-side only).
4. Primary `<button class="fm-btn-primary">Pay</button>`.

Behavior:
- Scan results go through `parsePaymentRequest` (see payment-request-uri.md)
  with its chain/token mismatch obligations.
- `Pay` disabled until: amount > 0, resolved recipient, screening not
  `restricted`, amount ≤ balance, connected (else button becomes the existing
  connect prompt); chain mismatch renders the "Switch to {network}"
  affordance instead of Pay (TransferForm pattern).
- Submits via `useTransfer.send({ asset, to, amount })`; fee/sponsorship
  disclosure and progress reuse the engine's existing surfaces
  (TxProgressOverlay for passkey; inline busy state otherwise). Vault-mode
  outcome ("proposed") is surfaced honestly.
- On success: clear draft, call `onSuccess`.

## RequestPanel (new — `components/fairwins/RequestPanel.jsx`)

Props: none required (hooks: `useWallet`, `useChainTokens`).

Layout: amount hero (same keypad + token pill), note input, primary
`<button class="fm-btn-primary">Request</button>`.

Behavior:
- Disabled until amount > 0; disconnected → connect prompt (US2 scenario 4).
- On press: `buildPaymentRequestUri` with `useWallet().address`, active
  `chainId`, selected currency; result shown as `QRCodeSVG` (AddressQRCode
  pattern: level "H", qrColorPreference palette) with the note as plain text
  beneath, plus Copy and Share (`navigator.share` with clipboard fallback —
  AddressQRModal pattern).
- Editing amount/note/currency clears the displayed code (stale-QR
  prevention).

## HomePreferencesPanel (new — `components/account/HomePreferencesPanel.jsx`)

- Two labeled radio groups: default home view (Pay/Request/Wager) and default
  currency (rendered with active-network symbols); reads/writes via
  `utils/homePreference.js` (see home-preferences.md).
- Registered in the account dashboard alongside the existing preference
  panels.
