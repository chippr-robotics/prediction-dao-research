# Implementation Plan: Pay / Request / Wager Home

**Branch**: `claude/send-request-wager-home-2jenfd` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/058-send-request-home/spec.md`

## Summary

Turn the FairWins home (`/app`) into a three-mode surface — **Pay** (new
default), **Request**, and **Wager** — all sharing the payments-style layout
spec 052/053 established (amount hero + `AmountKeypad` numpad + note + one
primary button). Pay composes the standard recipient stack (`AddressInput` +
`AddressBookButton` + `QRScanner`) and submits through the existing
`useTransfer` engine (passkey UserOps w/ sponsorship, EIP-3009 gasless
stablecoin, EOA, vault proposals — unchanged). Request builds an EIP-681
payment-request URI (note as an additive `message` param) rendered as a
`QRCodeSVG` with copy/share. Mobile gets a three-glyph bottom bar via the
existing `SectionIconNav` (outgoing / incoming / head-to-head); desktop gets
a `PillSelect` switcher. Defaults (view = Pay, currency = network stablecoin
i.e. USDC) live in a new device-scoped `fairwins_home_v1` preference with an
account-section panel. Frontend-only; no contracts, no new value-movement
path.

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX; React 19 function components + hooks.

**Primary Dependencies**: react-router-dom v7 (no new routes), wagmi v3 + viem v2
(`useChainId`/`useSwitchChain`), ethers v6 (`parseUnits`, `isAddress`),
`qrcode.react` ^4.2 (`QRCodeSVG`), `html5-qrcode` ^2.3.8 (existing `QRScanner`).
Reused components/hooks: `AmountKeypad`, `PillSelect`, `SectionIconNav` + `NavIcon`,
`AddressInput`/`AddressBookButton`/`AddressBookPicker`/`AddressScreenNotice`,
`AddressQRCode` pattern, `CreateChallengePanel` (untouched), `useTransfer`,
`useChainTokens`, `useAddressScreening`, `useWallet`, `useIsMobile`. **No new runtime
dependency.**

**Storage**: localStorage only — new key `fairwins_home_v1` via new
`utils/homePreference.js` (Pattern B, mirrors `quickAccessPreference.js`).
Payment requests are ephemeral (never persisted).

**Testing**: Vitest + @testing-library/react (`src/test/**`, co-located
`__tests__/**`), axe a11y tests, Cypress fast E2E home smoke.

**Target Platform**: Web (mobile-first at ≤768px via `useIsMobile()`; desktop
equivalent switcher). Home stays non-scrolling at 320px in each mode.

**Project Type**: Web application — frontend only (`frontend/`). No
backend/contract/subgraph work.

**Performance Goals**: Mode switch is state-only on mounted panels
(interactive <1s, SC-004); no added network calls on switch; QR generation is
synchronous client-side (SC-002).

**Constraints**: WCAG 2.1 AA (FR-017; glyph nav needs accessible names);
existing theme tokens only; wager mode behavior byte-identical (FR-012); no
new value-movement path (FR-018); honest currency symbols per network
(Constitution III); never-stranded gasless fallbacks preserved by reusing
`useTransfer` untouched.

**Scale/Scope**: 2 new panels + 1 new lib module + 1 new preference util + 1
new account panel + 3 new nav glyphs; ~2 modified components (`HomeScreen`,
`NavIcon` set) + account dashboard registration; ~8 new/extended test files.
~7 new files, ~5 edited.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts (NON-NEGOTIABLE)** — ✅ N/A. Zero
  `contracts/` changes (FR-018). Value movement reuses the audited
  `useTransfer` rails; recipient screening (advisory) + on-chain
  SanctionsGuard enforcement are unchanged.
- **II. Test-First and Comprehensive Coverage (NON-NEGOTIABLE)** — ✅ Planned
  (research R9): pure unit tests for `paymentRequest` (round-trip + malformed
  inputs) and `homePreference` (fallbacks), component tests for
  PayPanel/RequestPanel gating and HomeScreen mode wiring, axe coverage,
  Cypress home smoke. No contract interface change → no contract test
  updates.
- **III. Honest State, No Mocks or Placeholders** — ✅ Pay drives the real
  transfer engine with its honest lifecycle (sponsored vs user-pays fee
  disclosure, vault "proposed" outcome, real txHash only). Hero shows the
  *actual* network stablecoin symbol (USC on Mordor, not a fake "USDC").
  Request QRs encode the real address/chain; scans never partially prefill a
  wrong asset. Network-scoped data stays scoped (chainId always encoded,
  mismatches surfaced).
- **IV. Fail Loudly in CI** — ✅ No `continue-on-error`; new tests ride the
  existing lint/test/a11y gates.
- **V. Accessible, Consistent Frontend** — ✅ Reuses accessible primitives
  (AmountKeypad, PillSelect radiogroup, SectionIconNav); new glyph items get
  accessible names; axe tests added. Token addresses come from
  `config/networks.js` / sync artifacts — nothing hand-copied.

**Result**: PASS (pre-research and re-checked post-design). No violations;
Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/058-send-request-home/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R9
├── data-model.md        # Phase 1 — client-side entities
├── quickstart.md        # Phase 1 — validation guide
├── contracts/
│   ├── payment-request-uri.md    # EIP-681 build/parse contract
│   ├── home-preferences.md       # fairwins_home_v1 storage contract
│   └── home-mode-components.md   # UI contracts (HomeScreen, panels, nav)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── fairwins/
│   │   ├── HomeScreen.jsx        # MODIFIED — mode state, switchers, panel hosting
│   │   ├── HomeScreen.css        # MODIFIED — mode/bottom-nav spacing
│   │   ├── PayPanel.jsx          # NEW — amount hero + recipient stack + Pay
│   │   ├── RequestPanel.jsx      # NEW — amount hero + note + QR output
│   │   └── CreateChallengePanel.jsx  # UNCHANGED (wager mode)
│   ├── nav/
│   │   ├── SectionIconNav.jsx    # REUSED as-is (mobile bottom bar)
│   │   └── NavIcon.jsx           # MODIFIED — add outgoing/incoming/head-to-head glyphs
│   ├── account/
│   │   ├── HomePreferencesPanel.jsx  # NEW — default view + default currency
│   │   └── AccountDashboard.jsx      # MODIFIED — register the panel
│   └── ui/                       # REUSED as-is (AmountKeypad, AddressInput,
│                                 #   AddressBookButton, QRScanner, PillSelect…)
├── lib/payments/
│   └── paymentRequest.js         # NEW — buildPaymentRequestUri / parsePaymentRequest
├── utils/
│   └── homePreference.js         # NEW — fairwins_home_v1 (Pattern B)
└── test/                         # NEW/EXTENDED — PayPanel, RequestPanel,
    │                             #   HomeScreen (modes), axe coverage
    └── …  (+ co-located __tests__ for lib/payments, utils, NavIcon)

frontend/cypress/e2e/             # EXTENDED — home mode-switch + request smoke
```

**Structure Decision**: Frontend-only web app change inside the existing
`frontend/` workspace. New feature code clusters in
`components/fairwins/` (home surface), one pure lib module
(`lib/payments/`), one preference util (`utils/`), one account panel — all
following the directory conventions the repo already uses. No `contracts/`,
`services/`, or `subgraph/` changes.

## Key Design Decisions (from research.md)

| # | Decision |
| --- | --- |
| R1 | Mode is HomeScreen-internal state; no new routes; wager panel untouched |
| R2 | Mobile switcher = existing `SectionIconNav`; desktop = `PillSelect` |
| R3 | Pay submits via `useTransfer` (no new value path); TransferForm's gating patterns |
| R4 | Currency is a kind (`stable`/`native`) resolved per network; honest symbols |
| R5 | EIP-681 URIs + additive `message` param; new parser module (scanAddress untouched) |
| R6 | Device-scoped `fairwins_home_v1` preference (works pre-connect) |
| R7 | All panels stay mounted, inactive `hidden` → free draft retention |
| R8 | Pay/Request strictly minimal; wager extras render only in Wager mode |
| R9 | Vitest unit/component + axe + Cypress smoke |

## Phase 0 — complete

See [research.md](./research.md): all Technical Context unknowns resolved
from the codebase (R1–R9 with rationale and rejected alternatives). No
NEEDS CLARIFICATION markers remain.

## Phase 1 — complete

- [data-model.md](./data-model.md) — HomeMode, HomePreferences,
  CurrencySelection, PayDraft, PaymentRequest, ParsedPaymentRequest,
  RequestDraft.
- [contracts/](./contracts/) — payment-request URI contract (round-trip
  guarantee), preference storage contract, UI component contracts.
- [quickstart.md](./quickstart.md) — automated commands + 12 manual
  validation scenarios mapped to FRs/SCs.
- Agent context updated (CLAUDE.md Spec Kit pointer → this plan).

## Phase 2 — next

`/speckit-tasks` will decompose into ordered tasks. Natural ordering:
foundations first (`homePreference` util + `paymentRequest` lib, test-first),
then panels (PayPanel, RequestPanel), then HomeScreen integration + nav
glyphs, then the preferences panel, then axe/Cypress coverage.
