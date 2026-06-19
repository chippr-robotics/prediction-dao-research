# Feature Specification: Address Book

**Feature Branch**: `021-address-book`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "to make it easier to find friends, i would like to add an 'address book' feature where a member can store addresses with a nickname, network and notes.  this will be stored clientside. the addresses should be checked against the compliance and sanctions oracle contracts and any member address which is restricted should show a warning tag to the member. the addresses should be searchable/selectable anywhere within the app a user must enter an address and the user should be prompted to save addresses after entering a new one. the address book should be accessable as a tab in the 'my account' where users can perform crud operations on their address book. members should be able to tag multiple addresses to one name since friends may use several addresses and networks to interact. the addressbok als needs an encrypted import and export to allow the member portability."

## Overview

Members of FairWins regularly need to type or paste a counterparty's wallet
address to create or accept a wager. Re-entering long hexadecimal addresses is
error-prone and makes it hard to recognise who you are actually wagering with.
This feature adds a personal **Address Book**: a member can save the addresses of
people they interact with under a friendly name, organise multiple addresses and
networks under that same name (because a friend may use several wallets), and
then find and reuse those contacts anywhere the app asks for an address.

Because FairWins operates under a compliance and sanctions regime, every saved
address is screened against the on-chain compliance/sanctions oracle so the
member is clearly warned when a contact is restricted — without the address book
becoming a way to evade the on-chain enforcement that already exists. The address
book lives entirely on the member's own device (it is private contact data, not
shared protocol state) and can be exported and re-imported in encrypted form so a
member can move their contacts between devices or back them up safely.

## Clarifications

### Session 2026-06-19

- Q: How is the encrypted export/import keyed? → A: Wallet-signature-derived key — the encryption key is derived deterministically from a member's wallet signature (reusing the project's deterministic key-generation pattern); a backup is restorable only with the same wallet, with no passphrase to remember.
- Q: How does import resolve overlaps with the existing book? → A: Additive merge keyed on address — import adds addresses not already present and keeps existing ones (no duplicates); when an imported address carries a different nickname/notes, the member is prompted to keep existing or take imported, and existing data is never silently deleted.
- Q: Is a network required for each saved address? → A: Required, with a default — every saved address must have a network; the field is pre-filled with the currently active network so the member rarely has to choose. The unique key for an entry is (address + network).
- Q: When is the member prompted to save a newly-entered address? → A: Non-blocking toast after the action succeeds — once the underlying action (e.g., wager created/accepted) confirms on-chain, a dismissible "Save to address book?" toast appears; it never interrupts the flow, and is only offered for addresses not already saved.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage contacts in the My Account address book (Priority: P1)

A connected member opens the **Address Book** tab inside **My Account** and
manages their personal list of contacts. They can add a contact under a friendly
name, attach one or more wallet addresses to that name (each with the network it
is used on and optional notes), edit any contact or address, and delete contacts
or individual addresses they no longer need. The list persists on their device
between visits.

**Why this priority**: This is the core of the feature and the smallest viable
slice — a member can store and retrieve their contacts. Everything else
(selection elsewhere, save prompts, import/export) builds on the existence of a
managed, persistent address book.

**Independent Test**: Open My Account → Address Book on a connected wallet, create
a contact named "Alex" with two addresses on two networks plus a note, reload the
app, and confirm the contact and both addresses are still present and editable.

**Acceptance Scenarios**:

1. **Given** a connected member on the Address Book tab, **When** they add a
   contact with a nickname, one wallet address, a network, and a note, **Then**
   the contact appears in their list and is still present after a page reload.
2. **Given** an existing contact, **When** the member adds a second address (with
   its own network and note) under the same nickname, **Then** both addresses are
   shown grouped under that one contact name.
3. **Given** an existing contact, **When** the member edits the nickname, an
   address, a network, or a note, **Then** the change is saved and reflected
   immediately and after reload.
4. **Given** an existing contact, **When** the member deletes a single address,
   **Then** only that address is removed and the rest of the contact remains;
   **When** they delete the whole contact, **Then** the entire contact and all its
   addresses are removed.
5. **Given** the member enters a value that is not a valid wallet address, **When**
   they try to save it, **Then** they are shown a clear validation error and the
   invalid entry is not saved.

---

### User Story 2 - Sanctions/compliance warning on restricted contacts (Priority: P1)

When viewing their address book, a member sees a clear **warning tag** on any
saved address that is restricted according to the compliance/sanctions oracle, so
they understand that interacting with that address will be blocked or carries
compliance risk — before they attempt to transact.

**Why this priority**: FairWins is compliance-gated; surfacing restricted
addresses is a safety and legal-protection requirement, not a nicety. It must
ship with the address book itself so the book never quietly normalises a
restricted contact. It is tied for P1 because storing contacts without screening
them would create risk.

**Independent Test**: Save an address that the sanctions oracle reports as
restricted and an address it reports as clear; confirm the restricted one shows a
warning tag and the clear one does not, and that an unscreenable/unknown result is
shown as an uncertain (not "clear") state.

**Acceptance Scenarios**:

1. **Given** a saved address that the compliance/sanctions oracle reports as
   restricted, **When** the member views their address book, **Then** that address
   displays a visible warning tag indicating it is restricted.
2. **Given** a saved address the oracle reports as clear, **When** the member views
   their address book, **Then** no restriction warning is shown for that address.
3. **Given** the oracle cannot be reached or is not configured for the active
   network, **When** the member views an address, **Then** its status is shown as
   uncertain/unscreened rather than implying it is clear (fail-closed UX).
4. **Given** a contact has multiple addresses where at least one is restricted,
   **When** the member views the contact, **Then** the restricted address is
   individually flagged and the contact is visibly marked as containing a
   restricted address.

---

### User Story 3 - Select a saved contact wherever an address is required (Priority: P2)

Anywhere in the app where a member must enter a wallet address (for example,
creating or accepting a wager), they can search their address book by name or
address and select a saved contact instead of typing the raw address. The
selection populates the field with the correct address, and any restriction
warning travels with the selection.

**Why this priority**: This is where the address book delivers day-to-day value —
faster, less error-prone address entry. It depends on US1 (a populated book) but
is a distinct, independently demonstrable slice.

**Independent Test**: With at least one saved contact, open a flow that requires
an address, search the address book by the contact's name, select an address, and
confirm the field is populated with that exact address and any warning is shown.

**Acceptance Scenarios**:

1. **Given** a member on a screen with an address field and at least one saved
   contact, **When** they search by a contact's nickname or partial address,
   **Then** matching contacts/addresses are shown for selection.
2. **Given** matching results, **When** the member selects one, **Then** the
   address field is populated with that contact's selected address.
3. **Given** the selected address is restricted, **When** it is chosen, **Then**
   the restriction warning is surfaced in that flow before the member proceeds.
4. **Given** a member has no saved contacts, **When** they open an address field,
   **Then** the field still works for manual entry with no errors and offers no
   misleading empty results.

---

### User Story 4 - Prompt to save a newly entered address (Priority: P2)

After a member manually enters a new address (one not already in their address
book) and the action they used it for succeeds on-chain, a dismissible,
non-blocking toast invites them to save it to their address book with a nickname,
network, and optional notes, so their book grows naturally as they use the app
without interrupting their flow.

**Why this priority**: This is the growth mechanism that keeps the book useful
without forcing members to curate it manually. It depends on the book existing
(US1) and is valuable but not required for the MVP.

**Independent Test**: Enter a brand-new address, complete the action so it confirms
on-chain, and confirm a dismissible save toast appears; accept it, then confirm the
new contact is in the address book; repeat with an address already saved and confirm
no toast appears.

**Acceptance Scenarios**:

1. **Given** a member used an address not already in their book, **When** the
   underlying action succeeds on-chain, **Then** a dismissible, non-blocking toast
   invites them to save it with a nickname, network, and optional notes.
2. **Given** the save toast, **When** the member confirms, **Then** the address is
   added to their address book (creating a new contact or attaching to an existing
   name they choose).
3. **Given** the save toast, **When** the member dismisses or ignores it, **Then**
   the address is not saved and nothing about the completed action is affected.
4. **Given** the entered address already exists in the book, **When** the action
   succeeds, **Then** no save toast is shown.

---

### User Story 5 - Encrypted export and import for portability (Priority: P3)

A member can export their entire address book to an encrypted file and later
import it — on the same device or a different one — to restore or move their
contacts. The exported data is unreadable without the member's secret, and import
restores the contacts (names, addresses, networks, notes) accurately.

**Why this priority**: Portability and backup protect a member against device
loss and let them move between devices, but the feature is fully usable on one
device without it, so it is the lowest priority of the set.

**Independent Test**: Populate an address book, export it, clear local data (or
use a second browser/profile), import the file with the correct secret, and
confirm all contacts and their addresses/networks/notes are restored; then
confirm importing with a wrong secret fails safely.

**Acceptance Scenarios**:

1. **Given** a member with saved contacts, **When** they export their address
   book, **Then** they receive an encrypted file that does not expose addresses,
   names, or notes in readable form.
2. **Given** an exported file and the correct secret, **When** the member imports
   it, **Then** all contacts and their addresses, networks, and notes are restored
   accurately.
3. **Given** an exported file and an incorrect secret, **When** the member tries
   to import it, **Then** the import fails with a clear error and the existing
   address book is left unchanged.
4. **Given** an import that overlaps with existing contacts, **When** it is
   applied, **Then** new addresses are added and existing ones are kept without
   duplicates, and **When** an imported address has a differing nickname/notes,
   **Then** the member is prompted to keep the existing or take the imported values
   (nothing is silently lost).

---

### Edge Cases

- **Duplicate address under a different name**: the same address is saved under
  two different contacts — the member is warned about the duplicate at save time
  and can choose to proceed or consolidate.
- **Same address on multiple networks**: an address legitimately used on more than
  one network is allowed (network is part of what distinguishes an entry).
- **Address normalisation**: addresses that differ only by capitalisation/checksum
  formatting are treated as the same address for duplicate detection and matching.
- **A clear contact later becomes restricted**: the warning appears on the next
  screening without the member re-saving the contact.
- **Restricted address selected in a transaction flow**: the client warning is
  advisory; the on-chain enforcement (existing sanctions guard) remains the actual
  block, and the UX must not imply the client warning alone is the enforcement.
- **Large address book**: search and listing remain responsive with a large number
  of contacts/addresses.
- **No connected wallet**: the address book is unavailable or read-restricted in a
  way consistent with the rest of My Account, without errors.
- **Corrupted or wrong-format import file**: rejected with a clear error, leaving
  the current book intact.
- **Switching active network**: restriction status is shown for the network being
  screened and never leaks a result from one network as if it applied to another.

## Requirements *(mandatory)*

### Functional Requirements

#### Address book data & CRUD

- **FR-001**: Members MUST be able to create a contact identified by a
  human-friendly nickname.
- **FR-002**: Members MUST be able to associate one or more wallet addresses with a
  single contact (one name, many addresses), so a friend's multiple wallets are
  grouped together.
- **FR-003**: Each stored address MUST carry a required network designation (the
  entry field defaults to the currently active network) and optional free-text
  notes. The unique identity of an entry is the combination of (address + network).
- **FR-004**: Members MUST be able to view, edit, and delete contacts, and add,
  edit, or delete individual addresses within a contact (full CRUD).
- **FR-005**: The system MUST validate that an entered address is a well-formed
  wallet address before saving and reject invalid input with a clear message.
- **FR-006**: The address book MUST persist on the member's device between sessions
  without requiring any server-side storage of contact data.
- **FR-007**: The system MUST detect and warn on duplicate addresses (matching
  regardless of address capitalisation/checksum formatting), while still allowing
  the same address to be recorded under different networks.

#### Access & placement

- **FR-008**: The address book MUST be accessible as a dedicated tab within the
  **My Account** area.
- **FR-009**: Contact data MUST be scoped to the member (the connected wallet) and
  MUST NOT leak between different members using the same device.

#### Compliance / sanctions screening

- **FR-010**: The system MUST screen each saved address against the project's
  compliance/sanctions oracle and display a clear warning tag on any address
  reported as restricted.
- **FR-011**: When screening cannot be performed (oracle unreachable or not
  configured for the active network), the system MUST present the address status as
  uncertain/unscreened and MUST NOT imply the address is clear (fail-closed UX).
- **FR-012**: A contact with at least one restricted address MUST be visibly marked
  as containing a restricted address, with the specific restricted address(es)
  individually flagged.
- **FR-013**: The client-side warning MUST be presented as advisory and MUST NOT
  weaken, bypass, or replace the existing on-chain sanctions enforcement; selecting
  a restricted contact MUST NOT enable a member to circumvent on-chain blocking.
- **FR-014**: Restriction status MUST be scoped to the network it was screened on
  and MUST NOT be presented as applying to a different network.

#### Reuse across the app

- **FR-015**: Anywhere a member must enter a wallet address, they MUST be able to
  search their address book (by nickname or address) and select a saved contact in
  place of typing the address.
- **FR-016**: Selecting a saved address MUST populate the target address field with
  that exact address, and any restriction warning MUST be surfaced in that flow.
- **FR-017**: After a member uses an address that is not already in their book and
  the underlying action confirms on-chain, the system MUST surface a dismissible,
  non-blocking toast inviting them to save it (nickname, network, optional notes),
  and MUST NOT surface it when the address is already saved.
- **FR-018**: The save toast MUST be non-blocking — dismissing or ignoring it MUST
  NOT block or alter the member's completed action, and it MUST never interrupt the
  flow.

#### Portability (encrypted import/export)

- **FR-019**: Members MUST be able to export their entire address book to an
  encrypted file that does not expose names, addresses, or notes in readable form.
  The encryption key MUST be derived deterministically from the member's wallet
  signature (reusing the project's deterministic key-generation pattern), so the
  export requires no separately-remembered passphrase.
- **FR-020**: Members MUST be able to import a previously exported file, restoring
  all contacts with their addresses, networks, and notes intact, by re-deriving the
  key from the same wallet that produced the export.
- **FR-021**: Import attempted with a different/incorrect wallet, or with a
  corrupted/invalid file, MUST fail with a clear error (and MUST NOT reveal contact
  data) and MUST leave the existing address book unchanged.
- **FR-022**: When an import overlaps with existing contacts, the system MUST perform
  an additive merge keyed on the address: addresses not already present are added,
  already-present addresses are kept without creating duplicates, and existing data
  is never silently deleted. When an imported address carries a nickname or notes
  that differ from the stored ones, the member MUST be prompted to keep the existing
  values or take the imported values.

#### Quality

- **FR-023**: All address book UI MUST meet the project's accessibility standard
  (WCAG 2.1 AA), including the restriction warning being conveyed by more than colour
  alone.

### Key Entities *(include if feature involves data)*

- **Contact**: A named person/entity in a member's address book. Has a nickname and
  a collection of associated addresses. Belongs to exactly one member (the owner).
- **Saved Address**: A single wallet address belonging to a contact, with a required
  network designation (defaulted to the active network), optional notes, and a
  derived (screened) restriction status. A contact may have many; an entry's unique
  identity is (address + network), so the same address on two networks is two
  entries.
- **Address Book**: The full collection of a member's contacts, scoped to the owning
  member, persisted on-device, and the unit of encrypted export/import.
- **Restriction Status**: The screened compliance/sanctions result for an address on
  a given network — one of clear, restricted, or uncertain/unscreened — used to drive
  warning tags.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can add a contact with at least one address, network, and note
  in under 30 seconds, and the contact survives a page reload.
- **SC-002**: A member can populate an address field from a saved contact in 3 or
  fewer interactions, instead of typing or pasting the full address.
- **SC-003**: 100% of saved addresses that the oracle reports as restricted display a
  visible warning tag; 0% of addresses with an unknown/unscreenable status are shown
  as "clear".
- **SC-004**: A member who transacts with a brand-new address is offered the save
  toast 100% of the time after the action succeeds, and never offered it for an
  address already in their book.
- **SC-005**: A member can export and then import their address book onto a different
  device/profile and recover 100% of contacts, addresses, networks, and notes; an
  import with the wrong secret never reveals contact data and never corrupts the
  existing book.
- **SC-006**: Searching an address book of at least 200 saved addresses returns
  matches effectively instantly (no perceptible delay) to the member.
- **SC-007**: The address book UI passes the project's automated accessibility checks
  with no new violations.

## Assumptions

- **Scope of "compliance and sanctions oracle"**: Screening reuses the project's
  existing on-chain sanctions/compliance screening surface (the same source that
  gates wagers today) rather than introducing a new oracle; the address book is a
  consumer of that signal, not a new enforcement layer.
- **Client-side storage**: "Stored clientside" means contact data lives in the
  member's browser/device storage only; no FairWins backend stores address book
  contents (consistent with the project's no-new-backend constraint).
- **Per-member scoping**: The book is associated with the connected wallet so that
  different members on a shared device do not see each other's contacts; this mirrors
  the project's network-/member-scoping principle.
- **Encryption secret for export/import**: Export/import is protected by a key
  derived deterministically from the member's wallet signature (reusing the project's
  deterministic key-generation pattern), so there is no separate passphrase to
  remember. A consequence is that a backup is restorable only with the **same
  wallet** that created it — portability is across devices for that wallet, not
  across different wallets.
- **Restriction is advisory in the client**: Consistent with existing behaviour, the
  client warning is a pre-check for UX; the authoritative block remains the on-chain
  guard, so the address book never needs to "enforce" anything itself.
- **Networks**: The set of selectable networks corresponds to the networks FairWins
  already supports/configures; the address book does not introduce new networks.
- **Address format**: Addresses are EVM-style wallet addresses; address validation
  and normalisation follow the conventions already used elsewhere in the app
  (including any existing name-resolution support for entry).
- **No sharing**: Address books are private to the member; sharing contacts between
  members is out of scope for this feature (portability is via encrypted
  export/import only).
