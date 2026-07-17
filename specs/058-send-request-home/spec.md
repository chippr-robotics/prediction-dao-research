# Feature Specification: Pay / Request / Wager Home

**Feature Branch**: `claude/send-request-wager-home-2jenfd`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Reuse the wager home screen UX (big amount display + numpad + note + primary action button) for a new 'Send' section that becomes the default home view (configurable in preferences). Send reuses the standard address entry, address book, and QR scanner components; the primary button says 'Pay' instead of 'Lock in!'. Add a 'Request' view where the user enters an amount and a note, and pressing 'Request' generates a valid payment request as a QR code. Mobile view gets a bottom nav with three glyph icons: Pay (outgoing arrow), Request (incoming arrow), and Wager (head-to-head). Everything useful in one minimalist view. Currency defaults to USDC; the default should be settable in preferences."

## Overview

The wager home screen (spec 053) established a payments-app landing experience:
an oversized amount hero, an on-screen number pad, a note field, and a single
primary action button. This feature extends that proven layout into a unified
three-mode home — **Pay**, **Request**, and **Wager** — so that the everyday
money actions (sending value to someone, asking someone for value) live in the
same minimalist view as head-to-head wagering. Pay becomes the default landing
mode; the user can change the default in preferences. On mobile, a bottom
navigation bar with three glyph icons switches between the modes without
leaving the home surface. This is a frontend presentation and flow feature:
sending value reuses the existing transfer flow, and no new on-chain behavior
is introduced.

## Clarifications

### Session 2026-07-17

- Q: What should the "default value" preference control for the home amount display? → A: Default **currency only** (preset USDC); the amount always starts at $0 — no default-amount preference.
- Q: Where does the mobile bottom nav (Pay / Request / Wager glyphs) appear? → A: **Home surface only** — it switches the home modes in place; other app sections keep their existing navigation.
- Q: What format does the Request QR encode? → A: A **standard payment URI first** (recipient, amount, asset, network — scannable by any wallet); the note rides as an extra parameter that FairWins reads and other wallets safely ignore. The note is also shown as text alongside the QR.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pay someone from the home screen (Priority: P1)

A person opens FairWins and lands directly on the **Pay** view: the familiar
oversized amount display (defaulting to USDC), the on-screen number pad, a
recipient field, and an optional note. The recipient field is the app's
standard address entry — it accepts a pasted or typed address, opens the
address book to pick a saved contact, or launches the QR scanner to capture a
recipient's code. The primary button reads **"Pay"**. Keying an amount,
choosing a recipient, and pressing Pay completes a transfer using the app's
existing send flow, including its existing confirmation, screening, and fee
disclosure behavior.

**Why this priority**: This is the core of the feature — making everyday
payments the first thing the app offers, with zero navigation. It delivers the
"one minimalist view" goal on its own and is a viable MVP by itself.

**Independent Test**: Load the app fresh, confirm the Pay view is the default
home content, enter an amount and a recipient (via each of typing, address
book, and QR scan), press Pay, and verify the transfer completes through the
existing send flow with the same confirmation and outcome as the current
wallet transfer feature.

**Acceptance Scenarios**:

1. **Given** a user with no saved preference opens the app, **When** the home
   screen renders, **Then** the Pay view is the primary content — amount hero
   showing $0 in USDC, number pad, recipient entry, note field, and a primary
   button labeled "Pay".
2. **Given** the Pay view, **When** the user enters an amount on the number
   pad, picks a recipient from the address book, and presses Pay, **Then** the
   existing transfer flow runs (confirmation, screening, fee disclosure) and
   the recipient receives the amount in the selected currency.
3. **Given** the Pay view, **When** the user opens the QR scanner and scans a
   valid recipient code or payment request, **Then** the recipient (and, when
   present in the scanned request, the amount, currency, and note) prefill the
   Pay view.
4. **Given** the Pay view, **When** the user types or pastes a recipient,
   **Then** the entry is validated and screened with exactly the same rules,
   identity resolution (address book name, callsign, ENS), and warnings as the
   app's existing standard address entry.
5. **Given** a user who is not connected, **When** they open the Pay view,
   **Then** the view still renders and pressing Pay prompts them to connect —
   the same gating the existing transfer flow uses today.
6. **Given** an entered amount that exceeds the user's available balance,
   **When** they attempt to pay, **Then** the action is blocked with a clear,
   friendly message before any transaction is proposed.

---

### User Story 2 - Request money with a QR code (Priority: P1)

From the home screen the user switches to the **Request** view. It uses the
same layout — amount hero, number pad, and a note field ("What's it for?").
Pressing the primary button, labeled **"Request"**, generates a valid payment
request rendered as a QR code on screen: it encodes the requester's receiving
address, the amount, the currency, and the network, in a standard format that
the app's own scanner and common wallets can read. The user shows the code to
the payer (or shares it), and a payer scanning it in FairWins lands in the Pay
view with everything prefilled.

**Why this priority**: Request is the natural counterpart to Pay — the two
together make the home screen a complete peer-to-peer money surface. It is
independently testable and valuable without the navigation or preferences
stories.

**Independent Test**: Open the Request view, enter an amount and note, press
Request, and verify a QR code appears that (a) decodes to a valid payment
request for the requester's address/amount/currency/network and (b) when
scanned from another device's FairWins Pay view, prefills recipient, amount,
currency, and note.

**Acceptance Scenarios**:

1. **Given** the Request view, **When** the user enters an amount and a note
   and presses "Request", **Then** a QR code is displayed that encodes the
   requester's receiving address, amount, currency, and network in a valid,
   scannable payment-request format.
2. **Given** a displayed request QR, **When** another FairWins user scans it
   from the Pay view's scanner, **Then** their Pay view prefills the
   requester as recipient plus the amount and currency (and the note, when the
   format carries it), ready to confirm.
3. **Given** a displayed request QR, **When** it is scanned by a common
   third-party wallet, **Then** the wallet recognizes it as a payment request
   to the requester's address (best effort for amount/asset, per that wallet's
   support of the standard format).
4. **Given** the Request view, **When** the user has not connected a wallet or
   has no receiving address, **Then** pressing Request prompts them to connect
   before a code can be generated.
5. **Given** a generated request, **When** the user wants to send it rather
   than show it, **Then** they can copy or share the request so it can reach a
   payer who is not physically present.

---

### User Story 3 - Mobile bottom navigation between Pay, Request, and Wager (Priority: P2)

On mobile, a bottom navigation bar anchors the home experience with three
glyph icons: **Pay** (outgoing-arrow iconography), **Request**
(incoming-arrow iconography), and **Wager** (head-to-head iconography). Each
tap switches the home surface between the three modes instantly, keeping the
shared layout (amount hero + number pad + note + primary action) so switching
feels like changing the verb, not changing screens. The Wager mode is the
existing create-a-challenge home view, unchanged in behavior.

**Why this priority**: The bottom nav is what unifies the three activities
into "everything useful in one view" on mobile — but Pay and Request are each
usable without it via ordinary navigation, so it lands after them.

**Independent Test**: On a mobile-sized viewport, verify the bottom nav shows
the three glyphs with the specified iconography, that each tap swaps the home
mode (Pay ↔ Request ↔ Wager) while preserving the shared layout, that the
active mode is visibly indicated, and that entered amounts are not lost by an
accidental mode switch during a single session on the screen.

**Acceptance Scenarios**:

1. **Given** the home screen on a mobile viewport, **When** it renders,
   **Then** a bottom navigation bar shows exactly three glyph items — Pay
   (outgoing arrow), Request (incoming arrow), Wager (head-to-head) — with
   the active mode visually distinguished and each item labeled accessibly.
2. **Given** any home mode, **When** the user taps a different bottom-nav
   glyph, **Then** the home surface switches to that mode without a full page
   reload and keeps the shared amount-hero/number-pad layout.
3. **Given** the Wager mode reached via bottom nav, **When** the user creates
   a challenge, **Then** the flow and outcome are identical to the existing
   wager home (spec 053) — no behavior change.
4. **Given** a desktop/large viewport, **When** the home screen renders,
   **Then** the same three modes remain reachable through an equivalent
   switcher appropriate to the larger layout (the bottom bar itself is a
   mobile pattern).

---

### User Story 4 - Preferences: default view and default currency (Priority: P3)

In preferences, the user can choose which home mode the app opens on (Pay,
Request, or Wager — Pay being the out-of-the-box default) and which currency
the amount hero defaults to (USDC out of the box, selectable among the
currencies the app already supports for transfers). The choice persists across
sessions and applies the next time the home screen loads.

**Why this priority**: Personalization polish. The feature is fully usable
with the built-in defaults; this story makes it fit each user's habits.

**Independent Test**: Change the default home mode to Wager and the default
currency to a different supported asset in preferences, reload the app, and
confirm the home opens in Wager mode; switch to Pay and confirm the amount
hero defaults to the chosen currency.

**Acceptance Scenarios**:

1. **Given** a fresh install/profile, **When** the user opens preferences,
   **Then** a "default home view" setting exists with options Pay, Request,
   and Wager, preset to Pay, and a "default currency" setting preset to USDC.
2. **Given** the user sets the default home view to Wager, **When** they next
   open the app, **Then** the home screen opens directly in Wager mode.
3. **Given** the user sets a different default currency, **When** they open
   the Pay or Request view, **Then** the amount hero starts in that currency
   (still changeable per-transaction where the existing flow allows).
4. **Given** a user who never touches preferences, **When** they use the app,
   **Then** behavior is exactly the built-in defaults (Pay view, USDC).

---

### Edge Cases

- Recipient fails the app's compliance screening → Pay is blocked with the
  same notice the existing transfer flow shows; no transaction is proposed.
- Scanned QR is not a recognizable payment request or address → the scanner
  reports it cannot be used, without crashing or silently ignoring the scan.
- Scanned payment request targets a different network than the user's active
  network → the mismatch is surfaced clearly and the user is guided to switch
  (or the payment is prevented), never silently sent on the wrong network.
- Scanned payment request is denominated in a currency the payer does not hold
  or the app does not support for transfer → clear message; no partial prefill
  that could cause a wrong-asset send.
- Camera permission is denied → the scanner path degrades gracefully to
  paste/typed entry and the address book.
- Request generated while on one network, shown to a payer on another → the
  request always carries its network so the payer's app can detect the
  mismatch.
- Amount of 0 (or empty) → Pay and Request buttons stay disabled; wager mode
  keeps its existing minimum-stake rules.
- Very large or high-precision amounts → the amount display remains legible
  and the value is not rounded in what is actually sent or requested.
- Preference storage unavailable (e.g., cleared browser storage) → app falls
  back to built-in defaults without error.
- The three-mode switch mid-entry → switching modes must not carry a wager
  note into a payment note (or vice versa) in a way that misrepresents the
  action; each mode keeps its own draft state while the screen stays open.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The home screen MUST present three modes — Pay, Request, and
  Wager — that share the established home layout: oversized amount display,
  on-screen number pad, note field, and a single primary action button.
- **FR-002**: The Pay mode MUST be the default home mode for users with no
  saved preference.
- **FR-003**: The Pay mode MUST provide recipient entry using the app's
  existing standard address entry, address book picker, and QR scanner
  components — with identical validation, identity resolution (address book,
  callsign, ENS, generated fallback), and compliance screening behavior.
- **FR-004**: The Pay mode's primary action button MUST be labeled "Pay" and
  MUST execute the app's existing transfer flow (confirmation, screening,
  fee/sponsorship disclosure, progress, and result) — no new value-movement
  path is introduced.
- **FR-005**: The Pay mode MUST block submission when the amount is zero,
  the recipient is missing or invalid, the recipient fails screening, or the
  amount exceeds the spendable balance, each with a clear user-facing reason.
- **FR-006**: The Request mode MUST let the user enter an amount and a note
  and, on pressing "Request", generate a payment request encoding the
  requester's receiving address, amount, currency, and network in a standard,
  widely scannable payment-URI format. The note MUST be carried as an
  additional parameter that FairWins clients read and other wallets safely
  ignore, and MUST also be displayed as plain text alongside the QR code.
- **FR-007**: The generated request MUST be displayed as a QR code and MUST
  also be copyable/shareable as text or link for remote payers.
- **FR-008**: Scanning a FairWins-generated request from the Pay mode's
  scanner MUST prefill recipient, amount, and currency (and note where the
  format carries it), leaving the user one confirmation away from paying.
- **FR-009**: The QR scanner in Pay mode MUST also accept a plain address QR
  (no amount) and prefill only the recipient.
- **FR-010**: On mobile viewports, the home screen MUST show a bottom
  navigation bar with exactly three glyph items — Pay (outgoing-arrow
  iconography), Request (incoming-arrow iconography), and Wager
  (head-to-head iconography) — that switch the home mode in place, with the
  active mode visibly indicated. The bar is scoped to the home surface only;
  it does not appear on other app sections, whose navigation is unchanged.
- **FR-011**: On larger viewports, the same three modes MUST remain reachable
  via an equivalent switcher; no mode may be mobile-only.
- **FR-012**: The Wager mode MUST be the existing create-a-challenge home
  view with unchanged behavior, gating, and outcomes.
- **FR-013**: The amount display MUST default to USDC for users with no saved
  currency preference.
- **FR-014**: Preferences MUST include a "default home view" setting (Pay /
  Request / Wager, preset Pay) and a "default currency" setting (preset USDC,
  choices limited to currencies the app already supports for transfers); both
  MUST persist across sessions and take effect on next home load.
- **FR-015**: Each mode MUST keep its own draft entry state while the home
  screen remains open, so switching modes neither destroys a draft
  unexpectedly nor leaks one mode's note/amount into another mode's action.
- **FR-016**: Requests and payments MUST always carry/respect the network
  they were created on; a network mismatch between a scanned request and the
  payer's active network MUST be surfaced before any send.
- **FR-017**: All new home-surface UI (mode switcher, bottom nav, request QR
  view) MUST meet the app's existing accessibility bar (WCAG 2.1 AA),
  including accessible names for the glyph-only nav items.
- **FR-018**: The feature MUST introduce no new on-chain contracts or
  contract changes; all value movement uses existing transfer rails, and
  nothing new is routed through the wager escrow.

### Key Entities

- **Payment Request**: A shareable ask for value — requester's receiving
  address, amount, currency, network, optional note, represented as a QR code
  and as copyable text. Exists client-side only; nothing is stored on-chain.
- **Home Preferences**: Per-user settings — default home mode (Pay | Request
  | Wager) and default currency — persisted locally with the user's other app
  preferences.
- **Home Mode Draft**: The in-progress entry state of each mode (amount,
  recipient, note) held while the home screen is open.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a saved contact can complete a payment from app
  open to confirmed submission in under 30 seconds and with no more than 6
  interactions (amount digits excluded).
- **SC-002**: A user can go from opening the Request view to a scannable QR
  code on screen in under 15 seconds.
- **SC-003**: Scanning a FairWins request QR from another device prefills a
  correct, ready-to-confirm payment (right recipient, amount, currency,
  network) in at least 95% of attempts under normal lighting.
- **SC-004**: Switching between Pay, Request, and Wager via the bottom nav
  feels instant — the new mode is interactive in under 1 second — and loses
  no draft input.
- **SC-005**: 90% of first-time users presented with the home screen can
  identify how to send money without guidance (the "Pay" affordance is
  self-evident).
- **SC-006**: Wager creation volume and completion rate do not regress after
  Pay becomes the default view (Wager remains one tap away).
- **SC-007**: Zero instances of a payment sent on the wrong network or in the
  wrong currency from a scanned request in testing — mismatches are always
  intercepted.
- **SC-008**: Accessibility audits of the new home surface pass at the
  project's existing CI bar with no new violations.

## Assumptions

- "Default value in preferences" refers to the default **currency** shown in
  the amount hero (USDC out of the box), per clarification. A default *amount*
  preference is explicitly out of scope; the amount always starts at $0.
- Sending value reuses the app's existing transfer capability (wallet
  transfer flow with its screening, fee disclosure, and — where available —
  gas sponsorship). This feature changes where that capability lives and how
  it is entered, not how transfers work.
- The Wager mode is the existing spec-053 create-a-challenge home view,
  embedded as one of the three modes; its internals are out of scope.
- Payment requests use a standard, interoperable payment-URI format so that
  third-party wallets can read at least the recipient; full prefill
  (amount/currency/note) is guaranteed only between FairWins clients.
- Payment requests are ephemeral and client-side: no server storage, no
  expiry management, and no notification to the payer is in scope for v1.
- The currency choices offered are the assets the app already supports for
  transfers on the active network; introducing new assets is out of scope.
- The bottom navigation is scoped to the home surface's three modes; a
  broader app-wide bottom-tab redesign is out of scope.
- Existing preferences infrastructure (per-user, locally persisted settings
  used elsewhere in the account section) is reused for the two new settings.
