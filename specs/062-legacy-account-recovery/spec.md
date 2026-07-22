# Feature Specification: Legacy Account Recovery

**Feature Branch**: `062-legacy-account-recovery`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Legacy account recovery in the FairWins Recovery section (renamed from 'Backup & Security'). Members who arrive with an older wallet can recover an account from a legacy EOA private key or a BIP-39 word list (recovery phrase) through a guided series of informational bottom sheets. The pasted secret is detected (private key vs word list), the controlled address is shown for confirmation, and the key material is stored securely encrypted at rest on the device under a member-chosen passphrase — never persisted in the clear, never transmitted. Moving funds to a smart account is an OPTIONAL, recommended follow-up (not a required step): when chosen, it transfers ALL supported assets (native currency plus supported ERC-20 tokens) from the legacy account to a destination smart account. Recovered legacy accounts are first-class and available across the platform: the member can save the full account information into the address book, and it becomes usable anywhere addresses are referenced. Recovered legacy accounts are included in the member's persisted encrypted backup data so they carry forward safely across devices. Account recovery must NOT leak any key material (private key or mnemonic) into the event/activity log, but the recovery action IS recorded for audit purposes (address, timestamp, and type only)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recover a legacy account and store it safely (Priority: P1)

A member who has moved from an older wallet arrives at the **Recovery** section (formerly "Backup & Security") holding either a raw private key or a written recovery phrase (word list). They open a guided flow of informational sheets that explains, at each step, what is about to happen. They paste their secret; the flow recognizes whether it is a private key or a word list and shows them the account address it controls so they can confirm it is the right one. They choose a passphrase, and the secret is encrypted and saved on their device. At no point is the raw secret written to disk unencrypted or sent anywhere.

**Why this priority**: This is the irreducible core. Without the ability to bring a legacy secret in and hold it safely, none of the follow-on value (moving funds, address-book, backup) can exist. Delivered alone it already lets a member consolidate an old account into FairWins' custody model.

**Independent Test**: Paste a known private key and, separately, a known word list; confirm the correct address is shown for each; complete the passphrase step; verify the secret is retrievable only with the correct passphrase and that nothing readable as the secret exists in device storage.

**Acceptance Scenarios**:

1. **Given** a member on the Recovery section, **When** they paste a valid private key, **Then** the flow identifies it as a private key and displays the address it controls for confirmation.
2. **Given** a member on the Recovery section, **When** they paste a valid 12–24 word recovery phrase, **Then** the flow identifies it as a word list and displays the address it controls.
3. **Given** a confirmed secret, **When** the member sets a passphrase of sufficient strength and confirms, **Then** the account is saved encrypted on the device and appears in their list of recovered accounts.
4. **Given** a stored recovered account, **When** the member (or anyone) inspects device storage, **Then** no unencrypted private key or mnemonic is present.
5. **Given** a stored recovered account, **When** the member later provides the wrong passphrase, **Then** the secret is not revealed and an actionable error is shown.
6. **Given** invalid or incomplete input, **When** the member attempts to continue, **Then** the flow explains what is wrong and does not store anything.

---

### User Story 2 - Optionally move all supported assets to a smart account (Priority: P2)

After (or any time after) recovering an account, the member is **recommended** — but never required — to move the account's holdings onto a modern smart account. When they choose to, the flow reports every supported asset the legacy account holds (native currency and supported tokens) with balances, lets them pick or confirm the destination smart account, discloses the network fee, and transfers all of it. The member may decline and leave the funds where they are; the recovery is complete without moving anything.

**Why this priority**: This is the headline value — a legacy externally-owned account is a liability, and consolidating its assets onto a recoverable smart account is the point of recovery. It is P2 rather than P1 because a member can validly recover-and-hold first (US1) and move funds later, so it must not block the core flow.

**Independent Test**: With a recovered account holding native currency and at least one supported token, open the move-funds action; verify all balances are shown, a destination can be chosen, the fee is disclosed, and after confirming, the destination receives the assets and the legacy account is drained to the extent fees allow.

**Acceptance Scenarios**:

1. **Given** a recovered account, **When** the member finishes storing it, **Then** moving funds is presented as an optional, recommended next step that can be skipped.
2. **Given** the member chooses to move funds, **When** balances are read, **Then** the native balance and every supported token balance held by the legacy account are listed.
3. **Given** listed balances and a chosen destination, **When** the member confirms, **Then** all supported assets are transferred to the destination and the member sees per-asset outcomes.
4. **Given** the legacy account cannot cover the network fee, **When** the member attempts to move funds, **Then** the flow explains this and does not strand or lose funds.
5. **Given** a partial failure (one asset transfer fails), **When** the flow completes, **Then** successful transfers are reported as done and failed ones are reported honestly with the ability to retry.
6. **Given** the member declines to move funds, **When** they exit, **Then** recovery is still recorded as complete and the account remains available.

---

### User Story 3 - Make recovered accounts first-class across the platform (Priority: P2)

The member can save the recovered account's full information into their address book with a name/label, so it is available anywhere the platform lets them reference an address (sending, requesting, selecting a destination, resolving a name). The recovered account is not a dead-end entry buried in the Recovery section — it behaves like any other known account.

**Why this priority**: Recovery is only useful if the account is usable afterward. Address-book integration is what makes the recovered account "available across the platform," which is an explicit requirement. It is P2 because it depends on US1 but is independent of moving funds (US2).

**Independent Test**: Recover an account, save it to the address book, then open an unrelated address-entry surface elsewhere in the app and confirm the recovered account can be selected/resolved there.

**Acceptance Scenarios**:

1. **Given** a recovered account, **When** the member chooses to save it to the address book, **Then** an entry is created/updated with the account address, a member-provided name, and relevant metadata.
2. **Given** a saved address-book entry for the recovered account, **When** the member uses any address-entry surface elsewhere, **Then** the recovered account is available for selection or name resolution.
3. **Given** the recovered account already exists in the address book, **When** the member saves it again, **Then** the existing entry is updated rather than duplicated.

---

### User Story 4 - Carry recovered accounts forward in encrypted backup (Priority: P3)

A member who backs up their data and later restores it on another device finds their recovered accounts carried forward safely, so recovery is not lost when a device is replaced.

**Why this priority**: Durability across devices protects the member from losing the recovery work, matching how the platform already persists address book, activity, and other member data. P3 because the feature is usable within a single device without it, and it depends on US1.

**Independent Test**: Recover an account, run a backup, restore into a fresh profile, and confirm the recovered account is present after restore (still gated by its passphrase for any secret material).

**Acceptance Scenarios**:

1. **Given** one or more recovered accounts, **When** the member backs up their data, **Then** the recovered-account records are included in the encrypted backup.
2. **Given** a backup containing recovered accounts, **When** the member restores on another device, **Then** the recovered accounts appear in the Recovery section.
3. **Given** a restore that merges with existing local data, **When** the same recovered account exists on both sides, **Then** it is reconciled without duplication or data loss.
4. **Given** a restored recovered account whose secret was included, **When** the member unlocks it, **Then** the original passphrase is still required.

---

### User Story 5 - Recovery is auditable but never leaks secrets (Priority: P2)

Every recovery is recorded in the member's activity/audit history so there is a durable, honest record that a legacy account was recovered — but that record contains only the account address, the time, and the type of recovery. No private key, mnemonic, or seed ever appears in the activity log, backup, or any other record beyond the encrypted-at-rest secret store.

**Why this priority**: This is a security- and privacy-critical guardrail that must ship with the core flow, not after. It is called out as an explicit requirement and protects the member from the most damaging failure mode (secret leakage). P2 because it accompanies US1's storage behavior and is verifiable independently.

**Independent Test**: Recover an account, then inspect the activity log and the backup payload; confirm exactly one audit entry exists with address/time/type and that no field anywhere contains the secret.

**Acceptance Scenarios**:

1. **Given** a completed recovery, **When** the activity/audit history is viewed, **Then** it contains an entry recording the recovered address, timestamp, and recovery type.
2. **Given** a completed recovery, **When** the activity log and backup payload are inspected in full, **Then** no private key, mnemonic, or seed appears in any field.
3. **Given** the same account is recovered twice, **When** the audit history is viewed, **Then** the record is idempotent (no misleading duplicate audit noise) while remaining append-only.

---

### Edge Cases

- **Ambiguous or malformed input**: input that is neither a valid private key nor a valid word list (wrong length, bad checksum, typos) is rejected with guidance and nothing is stored.
- **Weak or mismatched passphrase**: passphrases below the minimum strength, or a confirmation that does not match, block storage until corrected.
- **Forgotten passphrase**: the member is told up front that the passphrase cannot be reset and that a forgotten passphrase makes the stored copy unrecoverable (their original key still works).
- **Destination equals source**: moving funds to the same legacy address is prevented or clearly warned against.
- **No/insufficient balance for fees**: moving funds when the account cannot pay the network fee is explained rather than attempted.
- **Unsupported assets present**: assets the platform does not support (e.g. arbitrary tokens or collectibles) are not silently dropped without disclosure — the member is told only supported assets are moved.
- **Network mismatch**: reading balances or moving funds is scoped to the correct network; the member is told which network the action applies to.
- **Duplicate recovery**: recovering an account already stored updates the existing record rather than creating conflicting copies.
- **Empty account**: an account with no balance can still be recovered, stored, saved to the address book, and audited.
- **Backup restore conflicts**: a recovered account present in both local and restored data is reconciled deterministically.

## Requirements *(mandatory)*

### Functional Requirements

**Section & entry**

- **FR-001**: The section formerly named "Backup & Security" MUST be presented to members as "Recovery", while existing deep links to the section continue to work.
- **FR-002**: The Recovery section MUST offer members a way to recover an account from a legacy private key or a recovery word list, presented through a guided series of informational sheets that explain each step before it happens.

**Import & detection**

- **FR-003**: The flow MUST accept a pasted secret and determine whether it is a private key or a recovery word list, without requiring the member to declare which.
- **FR-004**: The flow MUST derive and display the account address controlled by the secret so the member can confirm it before storing.
- **FR-005**: The flow MUST reject input that is not a valid private key or valid word list and explain why, storing nothing in that case.

**Secure storage**

- **FR-006**: The member's secret MUST be stored encrypted at rest under a member-chosen passphrase, and MUST NOT be persisted anywhere in unencrypted form.
- **FR-007**: The secret MUST NOT be transmitted off the member's device.
- **FR-008**: Retrieving the stored secret MUST require the correct passphrase; an incorrect passphrase MUST fail closed (never reveal partial or substitute secret material).
- **FR-009**: The flow MUST require a passphrase of at least a defined minimum strength and a matching confirmation before storing, and MUST inform the member that the passphrase cannot be recovered if forgotten.
- **FR-010**: The member MUST be able to view the list of their recovered accounts and remove any stored account.

**Moving funds (optional)**

- **FR-011**: Moving funds to a smart account MUST be optional and clearly recommended; completing recovery MUST NOT require moving any funds.
- **FR-012**: When the member chooses to move funds, the system MUST enumerate all platform-supported assets held by the legacy account — native currency and supported tokens — and show their balances before any transfer.
- **FR-013**: The member MUST be able to choose or confirm the destination smart account, with a sensible default when a smart account is available in the current session.
- **FR-014**: The system MUST disclose the network fee before the member confirms, and MUST NOT allow the member to be charged more than what was disclosed.
- **FR-015**: On confirmation, the system MUST transfer all listed supported assets to the destination and report a per-asset outcome (succeeded/failed), never silently dropping an asset.
- **FR-016**: If the legacy account cannot cover the network fee, the system MUST explain this and MUST NOT strand or lose funds.
- **FR-017**: The system MUST disclose which asset types are in scope for the move and MUST NOT imply that out-of-scope assets were moved.

**Platform availability & address book**

- **FR-018**: The member MUST be able to save a recovered account's information (address, a member-provided name, and relevant metadata) into the address book.
- **FR-019**: A recovered account saved to the address book MUST be usable anywhere the platform references addresses (selection and name resolution), not only within the Recovery section.
- **FR-020**: Saving a recovered account that already exists in the address book MUST update the existing entry rather than create a duplicate.

**Backup durability**

- **FR-021**: Recovered-account records MUST be included in the member's persisted encrypted backup so they carry forward across devices.
- **FR-022**: On restore, recovered accounts MUST be reconciled with any existing local records without duplication or data loss.

**Audit without leakage**

- **FR-023**: Each recovery MUST be recorded in the member's activity/audit history with the recovered address, timestamp, and recovery type.
- **FR-024**: No private key, mnemonic, or seed MUST ever be written to the activity/audit history, the backup payload, or any record other than the encrypted-at-rest secret store.
- **FR-025**: The recovery audit record MUST be append-only and idempotent, so re-recovering the same account does not create misleading duplicate audit noise.

### Key Entities *(include if feature involves data)*

- **Recovered Account**: a legacy account the member has brought into the platform. Attributes: the controlled address, the recovery type (private key or word list), the time it was recovered, and a reference to its encrypted secret. Contains no plaintext secret.
- **Encrypted Secret**: the at-rest, passphrase-protected form of the member's private key or word list. Never leaves the device in plaintext; unlockable only with the member's passphrase.
- **Address Book Entry**: the platform-wide reference to an account (address, name, metadata) that makes a recovered account usable across surfaces.
- **Audit Record**: an append-only activity entry noting that a recovery occurred (address, timestamp, type) with no secret material.
- **Asset Holding**: a supported asset (native currency or a supported token) held by the legacy account, with a balance, considered when moving funds.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can recover an account (paste secret → confirm address → set passphrase → stored) in under 2 minutes without external help.
- **SC-002**: 100% of stored recovered accounts have no plaintext secret anywhere in device storage, the activity log, or the backup payload.
- **SC-003**: When moving funds, 100% of the legacy account's supported assets are either transferred or reported as failed with a retry path — none are silently omitted.
- **SC-004**: A member who declines to move funds still completes recovery successfully in 100% of cases.
- **SC-005**: A recovered account saved to the address book is selectable/resolvable on at least one unrelated address-entry surface, verified end-to-end.
- **SC-006**: After backup-and-restore on a different device, 100% of recovered accounts are present, with no duplicates.
- **SC-007**: Every completed recovery produces exactly one audit record containing address, timestamp, and type, and re-recovering the same account produces no additional misleading audit entries.
- **SC-008**: An incorrect passphrase never reveals secret material in 100% of attempts.

## Assumptions

- **"Supported assets" means fungible value**: native currency plus the tokens the platform already recognizes per network (the supported-asset registry). Non-fungible tokens/collectibles are out of scope for moving funds in this feature and are disclosed as such.
- **EVM networks only**: recovery targets the account model the platform already supports for these secrets (EVM externally-owned accounts). Non-EVM networks (e.g. Bitcoin) are out of scope for this feature.
- **Word lists use the standard derivation**: a recovery phrase resolves to its account using the platform's standard default derivation; alternate derivation paths/indexes are out of scope for v1 and can be a follow-up.
- **Passphrase is independent of sign-in**: the at-rest passphrase protecting a recovered secret is chosen per stored account and is separate from how the member signs in to FairWins; it cannot be reset by the platform.
- **Destination default**: when the current session is a smart account, that account is offered as the default move-funds destination; the member can override it.
- **Backup carries the encrypted secret and/or its metadata**: recovered-account records ride the existing encrypted backup; any secret material that is carried remains passphrase-locked, so a restore alone never exposes a secret.
- **Retention**: a recovered account and its encrypted secret remain stored until the member removes them, even after funds are moved, so the account stays available for reference and any later action.
- **Existing subsystems are reused**: the address book, encrypted backup/restore, and activity/audit history are the platform's existing mechanisms; this feature integrates with them rather than introducing parallel stores.
