# The Three-Mode Home: Pay / Request / Wager (spec 058)

The FairWins home (`/app`, `HomeScreen.jsx`) is a three-mode money surface
sharing one payments-style layout (amount hero + `AmountKeypad` + note + one
primary action):

| Mode | Component | What it does |
| --- | --- | --- |
| `pay` (default) | `components/fairwins/PayPanel.jsx` | Send value via the existing `useTransfer` engine |
| `request` | `components/fairwins/RequestPanel.jsx` | Generate an EIP-681 payment-request QR |
| `wager` | `components/fairwins/CreateChallengePanel.jsx` | The spec-053 create-a-challenge view, unchanged |

All three panels stay **mounted** while the home is open; the inactive two get
the `hidden` attribute, so each mode's draft survives switching (FR-015). The
switcher is `SectionIconNav` (mobile bottom bar; glyphs `arrowOut` /
`arrowIn` / `headToHead` in `NavIcon.jsx`) and a `PillSelect` row on larger
viewports. The wager-only extras (Accept a challenge, My Wagers, the
Polymarket ticker) render only in wager mode.

## The one rule that matters

**No new value-movement path.** Pay submits exclusively through
`hooks/useTransfer.js` — the same engine as the wallet's Pay & Transfer tab —
inheriting passkey UserOps (incl. spec-050 sponsorship), EIP-3009 gasless
stablecoin with self-submit fallback, vault proposals, screening, and the
honest lifecycle. Never route home payments through the wager escrow or a
bespoke send path (spec 058 FR-018).

## Payment-request URIs

`lib/payments/paymentRequest.js` (pure functions, unit-tested round-trip):

- `buildPaymentRequestUri({ chainId, to, kind, tokenAddress, decimals, amount, note })`
  - stable: `ethereum:<token>@<chainId>/transfer?address=<to>&uint256=<units>[&message=<note>]`
  - native: `ethereum:<to>@<chainId>?value=<units>[&message=<note>]`
  - `message` is an additive param: third-party wallets ignore it, FairWins
    reads it. The note is ALSO displayed as plain text beside the QR.
- `parsePaymentRequest(text)` — accepts full EIP-681 (both forms, `@chainId`
  decimal/hex, `pay-` prefix), bare `ethereum:<address>`, and raw `0x…`
  addresses; returns `null` for anything else. Malformed numeric params
  degrade to an address-only prefill — never a wrong amount.

Pay-side scan obligations (implemented in `PayPanel`):

- chainId ≠ connected network → a "Switch to X to pay this request"
  affordance replaces Pay; nothing is sent cross-network silently (FR-016).
- token ≠ that network's stablecoin → error, **no partial prefill** (never a
  wrong-asset send).

`lib/addressBook/scanAddress.js` (regex-only address extraction) is untouched
and keeps its existing callers; new payment-aware scanning uses this module.

## Preferences

`utils/homePreference.js`, localStorage key **`fairwins_home_v1`**:
`{ defaultMode: 'pay'|'request'|'wager', defaultCurrencyKind: 'stable'|'native' }`.
Device-scoped (works before connect), graceful fallbacks, `subscribe()` pub/sub.
Currency is stored as a **kind**, never a symbol — the UI resolves the real
per-network symbol via `useChainTokens()` (USDC on Polygon/Ethereum/Amoy/
Sepolia, USC on ETC/Mordor). The settings UI is
`components/account/HomePreferencesPanel.jsx` (WalletPage → Preferences → Home).

## Tests

- `lib/payments/__tests__/paymentRequest.test.js` — URI build/parse + round trip
- `utils/__tests__/homePreference.test.js` — storage contract
- `src/test/PayPanel.test.jsx`, `RequestPanel.test.jsx`,
  `paymentRequestRoundTrip.test.jsx`, `HomeScreen.test.jsx` — behavior
- `src/test/home.axe.test.jsx` — WCAG 2.1 AA
- `cypress/e2e/fast/23-home-modes.cy.js` — E2E smoke

Spec artifacts: `specs/058-send-request-home/`.
