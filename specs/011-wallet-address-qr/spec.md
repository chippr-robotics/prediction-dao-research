# Feature Specification: Wallet Address QR Display & Sharing

**Feature Branch**: `011-wallet-address-qr`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "The users currently have a way to quickly scan qr codes to accept wagers, however they do not currently have a way to quickly display or share their wallet address. a user should be able to quickly display their address with a fairwins stylized qr code which they should be able to customize the color of in the account portal. the user should have the option of copying the address or sharing it through message"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Display My Address as a QR Code (Priority: P1)

A connected user opens their account area and, with minimal taps, displays a
large, FairWins-branded QR code that encodes their wallet address. Another
person can scan it with any standard QR scanner (including the existing
FairWins scanner) and receive the correct address — for example, to send funds
or set up a wager with them in person.

**Why this priority**: This is the core gap — users can scan QR codes today
but cannot present one. Without the display, copying/sharing/customization
have nothing to attach to. Displaying the QR alone is a viable MVP.

**Independent Test**: Connect a wallet, navigate to the account portal, open
the QR display, and scan it with a separate device's QR scanner. The scanned
value must match the connected wallet address exactly.

**Acceptance Scenarios**:

1. **Given** a user with a connected wallet on the account portal, **When**
   they open the "show my address" QR view, **Then** a FairWins-styled QR code
   encoding their full wallet address is displayed alongside the readable
   address text.
2. **Given** the QR code is displayed, **When** anyone scans it with a
   standard QR scanner, **Then** the decoded value resolves to the exact
   connected wallet address.
3. **Given** a user with no wallet connected, **When** they attempt to open
   the QR display, **Then** they are prompted to connect a wallet instead of
   being shown an empty or placeholder QR code.
4. **Given** the user switches to a different wallet account, **When** they
   reopen the QR display, **Then** the QR code reflects the newly active
   address.

---

### User Story 2 - Copy or Share My Address (Priority: P2)

From the same QR display, the user can copy their address to the clipboard
with one tap, or share it through their device's messaging/share options
(text message, chat apps, email) so a remote counterparty receives the
address without transcription errors.

**Why this priority**: In-person display (P1) covers the face-to-face case;
copy/share extends it to remote counterparties, which is the second most
common way addresses are exchanged.

**Independent Test**: Open the QR display, tap "Copy" and paste into another
field to verify the exact address; tap "Share" on a share-capable device and
confirm the address arrives in the chosen messaging app.

**Acceptance Scenarios**:

1. **Given** the QR display is open, **When** the user taps the copy action,
   **Then** the full wallet address is placed on the clipboard and the user
   sees a clear confirmation that it was copied.
2. **Given** the QR display is open on a device that supports native sharing,
   **When** the user taps the share action, **Then** the device's share sheet
   opens pre-filled with the wallet address so it can be sent through
   messaging.
3. **Given** a device or browser that does not support native sharing,
   **When** the user taps the share action, **Then** the user is offered a
   graceful fallback (at minimum, copy-to-clipboard with confirmation) rather
   than a broken or missing control.

---

### User Story 3 - Customize the QR Code Color (Priority: P3)

In the account portal, the user personalizes the color of their FairWins QR
code from the available color options. The chosen color is applied to the QR
display and remembered the next time they view it.

**Why this priority**: Personalization adds delight and brand expression but
does not block the core exchange of addresses; the QR is fully functional in
its default style.

**Independent Test**: Pick a non-default color in the account portal, reopen
the QR display, and verify the QR renders in that color, still scans
correctly, and the choice persists across a page reload on the same device.

**Acceptance Scenarios**:

1. **Given** the user is in the account portal, **When** they select a QR
   color option, **Then** the QR display immediately reflects the chosen
   color.
2. **Given** a custom color is selected, **When** the QR code is scanned,
   **Then** it still decodes to the correct wallet address (every offered
   color preserves scannability).
3. **Given** a custom color was selected previously, **When** the user
   returns to the QR display later on the same device, **Then** the QR
   renders in their saved color without re-selection.

---

### Edge Cases

- No wallet connected: the QR view must prompt for connection, never render a
  QR for an empty/placeholder address.
- Wallet account or network switched while the QR view is open: the displayed
  address and QR must update (or the view must refresh) so a stale address is
  never presented.
- Color choices that would reduce scan contrast: only color options that keep
  the QR reliably scannable are offered; the user cannot select a combination
  that produces an unscannable code.
- Clipboard access denied by the browser: the copy action surfaces a clear
  failure message and the address remains visible for manual selection.
- Native share unavailable (desktop browsers, unsupported contexts): the share
  control falls back to copy behavior rather than disappearing or erroring.
- Very small screens: the QR code remains large and crisp enough to scan at
  arm's length.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users with a connected wallet MUST be able to display their
  active wallet address as a QR code from the account portal.
- **FR-002**: The QR code MUST decode to the exact, full wallet address of the
  currently active account; the readable address text MUST be shown alongside
  the QR code.
- **FR-003**: The QR code MUST carry FairWins-branded styling consistent with
  the product's visual identity, without compromising scannability by standard
  QR scanners.
- **FR-004**: Users MUST be able to copy the full address to the clipboard
  with a single action and receive visible confirmation of success or failure.
- **FR-005**: Users MUST be able to share the address through the device's
  native messaging/share capability where available; where unavailable, the
  share action MUST degrade gracefully to copy-with-confirmation.
- **FR-006**: Users MUST be able to customize the QR code color from within
  the account portal; only options that preserve reliable scannability are
  offered.
- **FR-007**: The selected QR color preference MUST persist on the user's
  device across sessions and apply automatically on subsequent views.
- **FR-008**: When no wallet is connected, the QR display MUST prompt the user
  to connect rather than rendering any QR code.
- **FR-009**: When the active account changes, the QR display MUST reflect the
  new address; a previously displayed (stale) address MUST never be presented
  as current.

### Key Entities

- **Wallet Address**: The user's public account identifier; the single value
  encoded in the QR code and used by copy/share actions. Read from the active
  wallet connection — never entered manually.
- **QR Style Preference**: The user's chosen QR color (and any future style
  options), stored per device; defaults to the FairWins house style when
  unset.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A connected user can go from the account portal to a scannable
  QR code of their address in 2 interactions or fewer, within 5 seconds.
- **SC-002**: 100% of QR codes produced — across every offered color option —
  decode to the exact connected wallet address when scanned with common QR
  scanners.
- **SC-003**: The copy action places the complete, unaltered address on the
  clipboard in 100% of successful attempts, and the user receives
  confirmation within 1 second.
- **SC-004**: On share-capable devices, the share action delivers the address
  into the user's chosen messaging channel without manual retyping; on other
  devices a fallback path completes the same exchange.
- **SC-005**: A saved color preference is applied automatically on at least
  95% of return visits on the same device (allowing for users who clear local
  data).

## Assumptions

- The QR code encodes the plain wallet address (not a payment-request link),
  maximizing compatibility with general-purpose scanners and wallet apps; the
  shared message likewise contains the plain address, optionally with a short
  FairWins context line.
- Color customization is offered as a curated set of FairWins-approved color
  options rather than a free-form color picker, which is how scannability
  contrast is guaranteed (FR-006).
- The color preference is stored locally on the user's device, consistent
  with the project's no-backend architecture; preferences do not sync across
  devices.
- "Account portal" refers to the existing account area where users manage
  their wallet and membership; this feature adds to it rather than creating a
  new destination.
- The existing FairWins QR scanning capability can read the stylized QR codes
  produced by this feature (verified as part of acceptance).
- Sharing "through message" means handing the address to the device's native
  share/messaging options; FairWins itself does not send messages on the
  user's behalf.
