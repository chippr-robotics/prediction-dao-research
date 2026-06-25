# Feature Specification: Encrypted Data Backup & Restore

**Feature Branch**: `feat/encrypted-data-sync-032`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "we are currently storing several data objects locally such as the addressbook, the market preferences, and potentially other user datamodel objects. we should store this as an encrypted file on ipfs to give the user a consistent experience everywhere without worrying about loss across platforms." + clarification: "this process can be an additional step for the user of making and retrieving a backup."

## Overview

Today the app keeps a member's personal data objects — their **address book**, their **market / app
preferences**, and other user-authored client-side state — only in the current browser's local storage,
scoped to the connected wallet. That data is invisible on a second device or browser and is permanently lost
if that one browser's storage is cleared.

This feature gives the member an explicit way to **back up and restore** that data so they get a consistent
experience across devices and platforms without fear of loss. The member's data is bundled into a single
**encrypted** file, stored on **IPFS** (already part of the platform's footprint), and tied to their wallet.
It is an **explicit, member-initiated step** — "Back up my data" and "Restore my data" — not automatic
background sync. Because IPFS content is public, the file is **encrypted client-side with a key only the
member's wallet can produce**, so no one else (including the platform) can read it.

A backup is **unified per wallet** — one bundle holding the member's address-book entries across all networks
plus their global preferences — so a single restore brings everything regardless of which network the member
is currently using. Retrieval is made **easy and trustless** by an **on-chain registry contract on a single
canonical network** that records, per wallet, a pointer to the member's latest encrypted backup. A backup
writes that pointer (a small signed transaction on the canonical network); a restore reads it directly from
chain — so any device controlling the wallet can find and load the latest backup with **only the wallet**,
without trusting the platform, copying any reference, or any application backend. (Encryption is client-side;
storage is IPFS; the pointer is on-chain — all within the existing no-backend footprint.)

This deliberately ships as a **manual backup/restore** step; fully-automatic, background cross-device sync is
a possible later evolution and is out of scope here.

## Clarifications

### Session 2026-06-24

- Q: What does one backup cover, and where does the registry live? → A: **One unified backup per wallet** — a
  single bundle holding the member's address-book entries across all networks plus their global preferences;
  the registry lives on a **single canonical low-cost network**. Restore brings everything regardless of which
  network the member is on; backing up writes the pointer (and costs gas) on that one canonical network.
- Q: How is the encryption key obtained so it reproduces on any device? → A: **Derived from the wallet's
  signature of a fixed app message** (no passphrase to remember). This relies on deterministic signatures
  (standard for RFC-6979 ECDSA wallets); the app MUST detect a wallet that cannot reproduce the key and fail
  honestly rather than silently produce an unrestorable backup.
- Q: Is it acceptable that the on-chain registry publicly links a wallet to its backup pointer? → A: **Yes —
  accept the public pointer** (the registry reveals that a wallet has a backup, its CID, and update times);
  the backup *content* stays encrypted. This is the accepted cost of trustless on-chain retrieval.
- Q: What payload size bound should the backup warn at? → A: **~1 MB soft cap** — warn (don't hard-fail)
  above ~1 MB; ample for an address book + preferences and keeps encrypt + pin fast.
- Q: How are network-specific data elements handled inside the unified bundle? → A: **Every network-specific
  element carries its network (chain id)** when saved — contacts/addresses, tokens, DAOs, and any future
  network-scoped object are tagged with the chain they belong to, so they are queryable per-network and
  durable/correctly re-associated regardless of which network the member is on at restore. Network-agnostic
  data (global preferences) is stored without a network tag.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Back up my data (Priority: P1)

As a member who has built up an address book and tuned my preferences, I want to make an encrypted backup of
my data with one action, so it is safe off my device and I can bring it to another device later.

**Why this priority**: A restore is only possible if a backup exists; capturing the data is half the MVP. It
exercises the full write path (bundle → encrypt → store) and must be safe and honest about success.

**Independent Test**: With data present locally, trigger "Back up"; confirm an encrypted file is produced and
stored, the member is shown an honest success state (with last-backup time), and the stored file cannot be
read without the wallet.

**Acceptance Scenarios**:

1. **Given** I have an address book + preferences locally, **When** I trigger "Back up my data", **Then** my
   data is bundled, encrypted with my wallet-derived key, stored, and I see a confirmed success state with a
   last-backup timestamp.
2. **Given** my backup is stored, **When** anyone without my wallet obtains the stored file, **Then** they
   cannot read its contents (it is encrypted; only my wallet can derive the key).
3. **Given** a backup attempt fails (offline, storage error), **When** the failure occurs, **Then** my local
   data is unchanged, the failure is surfaced honestly, and nothing is shown as "backed up" that was not
   actually stored.

---

### User Story 2 - Restore my data on another device (Priority: P1)

As a member connecting the same wallet on a new device (or after clearing my browser), I want to retrieve my
encrypted backup and load it, so I don't have to rebuild my address book and preferences and never lose them
by switching platforms.

**Why this priority**: This is the payoff — portability and loss-protection. Restore + Backup together are
the MVP; without restore the backup has no value.

**Independent Test**: On a fresh device controlling the same wallet, trigger "Restore"; confirm the backup is
located, fetched, decrypted, and loaded into local data; confirm decryption only succeeds because the device
controls the wallet.

**Acceptance Scenarios**:

1. **Given** I previously backed up under my wallet, **When** I trigger "Restore" on a fresh device with the
   same wallet, **Then** my address book and preferences are loaded into the app.
2. **Given** the same wallet, **When** I restore, **Then** decryption succeeds using only the wallet (no
   separately-stored secret), and a wallet that is not mine cannot decrypt the file.
3. **Given** no backup exists for my wallet (or it cannot be located), **When** I trigger "Restore", **Then**
   I am told there is nothing to restore and my local data is left untouched (no error state, no data loss).

---

### User Story 3 - Restore safely (merge vs. replace, with confirmation) (Priority: P2)

As a member who may already have some local data when I restore, I want to choose whether to merge the backup
into what I have or replace it, with a clear confirmation, so a restore never silently destroys data I care
about.

**Why this priority**: A restore that blindly overwrites current local data would itself cause loss — the
opposite of the feature's goal. Member-controlled, confirmed reconciliation makes restore trustworthy.

**Independent Test**: With non-empty local data, restore a backup; confirm the member is offered merge or
replace with a clear confirmation; on merge, additive collections (e.g. contacts) keep both sides; on
replace, the member is warned before local data is overwritten.

**Acceptance Scenarios**:

1. **Given** I have local data and a backup to restore, **When** I restore, **Then** I am asked whether to
   merge or replace before anything changes.
2. **Given** I choose merge, **When** the restore completes, **Then** additive collections contain entries
   from both the backup and my current local data (no silent contact loss); scalar preferences resolve by a
   stated, deterministic rule.
3. **Given** I choose replace, **When** I confirm, **Then** local data is overwritten by the backup only
   after an explicit warning; cancelling leaves local data untouched.

---

### User Story 4 - Privacy and control (Priority: P2)

As a member, I want backups to be private to me, to see when I last backed up, and to be able to remove a
stored backup — because this is my personal data and I decide whether and how it leaves my device.

**Why this priority**: Putting personal data off-device (even encrypted) is a consent/trust decision;
transparency and removal are required for a privacy-respecting feature.

**Independent Test**: Confirm no data leaves the device unless the member triggers a backup; confirm the
member can see last-backup status and request removal of a stored backup; confirm local data is unaffected by
removal.

**Acceptance Scenarios**:

1. **Given** I never trigger a backup, **When** I use the app, **Then** none of my personal data is stored
   off-device (backup is an explicit action, never implicit).
2. **Given** I have backed up, **When** I view backup status, **Then** I see whether a backup exists and when
   it was last made.
3. **Given** I want to remove my stored backup, **When** I request removal, **Then** the system stops
   retaining the stored copy and my local data continues to work unchanged.

---

### User Story 5 - Resilient and local-first (Priority: P3)

As a member with flaky connectivity, I want the app to keep working on my local data regardless of backup
state, so backup/restore is a benefit and never a blocker.

**Why this priority**: Local-first resilience ensures the feature never degrades the core experience; lower
priority because it builds on US1/US2.

**Independent Test**: Disconnect the network; confirm reading/editing address book + preferences still works;
attempt backup/restore offline and confirm a clear, non-destructive failure; reconnect and confirm the action
can be retried successfully.

**Acceptance Scenarios**:

1. **Given** I am offline, **When** I read or edit my data, **Then** it works against local data without
   error; **When** I attempt backup/restore, **Then** I get a clear "try again when online" state with no
   data loss.
2. **Given** a backup/restore failed mid-way, **When** it fails, **Then** local data is never left corrupt or
   partially overwritten.

---

### Edge Cases

- **No wallet connected**: backup/restore are unavailable (the wallet is both the key and the owner); local
  data still works.
- **Wallet changed**: backups are strictly per wallet; a wallet only ever restores its own backup, with no
  cross-wallet leakage.
- **Corrupt / undecryptable backup**: treated as "no usable backup" — local data is left untouched and the
  problem is surfaced; good local data is never overwritten with garbage.
- **Backup file unavailable / not yet propagated on the network**: restore reports it couldn't be retrieved
  and leaves local data untouched (never shows empty-as-truth).
- **Very large data** (e.g. a big address book): respect a reasonable size bound; warn rather than fail
  silently if exceeded.
- **Member loses access to the wallet**: the encrypted backup is unrecoverable by design (only the wallet can
  decrypt) — surfaced as an expectation, not a recoverable error.
- **Wallet cannot reproduce a deterministic signature**: backup/restore is blocked with a clear message (the
  key can't be re-derived reliably), never producing an unrestorable backup or overwriting local data (FR-001a).
- **No gas on the canonical registry network**: backing up requires a small transaction on that network; if
  the member lacks gas there, backup is blocked with a clear message — restore (read-only) of an existing
  backup still works.
- **Restore onto non-empty local data**: never destructive without the member choosing replace and confirming
  (US3).
- **Multiple backups over time**: restoring retrieves the member's current/latest backup; superseded backups
  need not be retained.

## Requirements *(mandatory)*

### Functional Requirements

**Backup**

- **FR-001**: The system MUST let the member trigger an explicit backup that bundles their registered data
  objects — the member's address-book entries across all networks plus their global preferences — into a
  single unified per-wallet payload, encrypts it client-side with a key derivable only from their wallet, and
  stores the encrypted payload on IPFS.
- **FR-001a**: The encryption key MUST be derived from the wallet's signature of a fixed app message (no
  separate passphrase). This relies on the wallet reproducing the same signature on any device (standard for
  RFC-6979 ECDSA wallets). A wallet that cannot reproduce its signature MUST fail honestly: the resulting
  restore decrypts to nothing and is surfaced as "no usable backup" (FR-013), leaving local data untouched —
  it MUST never silently corrupt or overwrite local data. (A wrong key only ever yields an AEAD authentication
  failure, never a partial/garbage restore.) The system MAY additionally re-derive and compare at backup time
  to warn a non-deterministic signer early; this early warning is optional, the honest-failure-on-restore
  guarantee is mandatory.
- **FR-002**: After the encrypted payload is stored, the system MUST record a pointer to it in the on-chain
  per-wallet backup registry (FR-005a), and MUST show an honest success state (including a last-backup time)
  only once both the stored copy is confirmed persisted AND the on-chain pointer update is confirmed.
- **FR-003**: A backup MUST be member-initiated (an explicit action), never implicit/automatic. The member
  MUST be informed that a backup includes a small on-chain transaction (and its cost) before signing.

**Restore**

- **FR-004**: The system MUST let the member trigger an explicit restore that locates their latest backup,
  fetches it, decrypts it with the wallet-derived key, and loads it into local data.
- **FR-005**: Restore MUST locate the member's backup by reading the on-chain registry pointer for their
  wallet (FR-005a) — using only their wallet, with no separately-memorized secret or copied identifier, and
  without trusting any platform-controlled service.
- **FR-005a**: The system MUST provide an on-chain registry on a **single canonical network** that maps a
  wallet to a pointer to that wallet's latest unified encrypted backup, where only that wallet can set its own
  pointer (write-authorized to the owner) and anyone can read it. The registry MUST store only a
  pointer/reference (no plaintext and no personal data) and MUST be reviewable as a value-free,
  access-controlled contract (security-review gate). Reads MUST be free; the backup write (a transaction on
  the canonical network) costs gas, which the member is told about before signing (FR-003).
- **FR-005b**: The publicly-readable registry intentionally reveals that a given wallet has a backup, its
  pointer (CID), and its update times; the system MUST keep the backup *content* encrypted so this metadata
  exposure never discloses personal data. (Accepted trade-off for trustless retrieval.)
- **FR-006**: When no backup exists or it cannot be located, restore MUST tell the member there is nothing to
  restore and leave local data untouched (no error, no data loss).
- **FR-007**: Restore MUST let the member choose **merge** or **replace** and MUST confirm before any
  destructive overwrite of local data.
- **FR-008**: On merge, additive collections (e.g. contacts) MUST retain entries from both the backup and
  current local data (no silent loss), reconciling per (element identity + network) so the same identifier on
  different networks never collides; scalar preferences MUST reconcile by a stated, deterministic rule.

**Privacy, consent & control**

- **FR-009**: Stored backups MUST be unreadable by anyone without the member's wallet (encryption is
  mandatory because IPFS content is public); the platform MUST NOT be able to read them.
- **FR-010**: No personal data MUST leave the device unless the member triggers a backup (opt-in by action).
- **FR-011**: The member MUST be able to see backup status (whether a backup exists and when it was last
  made) and request removal of their stored backup; local data MUST remain usable after removal.

**Honest state & safety**

- **FR-012**: Local data MUST remain the working source of truth: a failed backup/fetch/decrypt MUST never
  corrupt or discard local data, and the system MUST NOT present data as "backed up" before the stored copy
  is confirmed persisted (honest finality).
- **FR-013**: A corrupt or undecryptable backup MUST be treated as "no usable backup" — leave local data
  untouched and surface the issue; never overwrite good local data with it.
- **FR-014**: Backup/restore MUST be atomic from the member's perspective — a failure mid-operation MUST NOT
  leave local data partially overwritten or corrupt.

**Scope of backed-up data**

- **FR-015**: The set of backed-up objects MUST be an explicit, extensible registry of user-authored data —
  initially the **address book** (all of the wallet's per-network entries) and **global market/app
  preferences**, combined into the one unified per-wallet bundle — and MUST exclude data that is re-derivable
  from chain or is a transient cache (e.g. the activity feed, balances, membership/tier caches).
- **FR-015a**: Every network-specific data element in the bundle (contacts/addresses, tokens, DAOs, and any
  future network-scoped object) MUST be stored tagged with the network (chain id) it belongs to, so it can be
  queried per-network and is re-associated with the correct network on restore — independent of which network
  the member is connected to at backup or restore time. Network-agnostic data (e.g. global preferences) is
  stored without a network tag. The same logical identifier on two networks MUST remain two distinct,
  independently-durable elements.
- **FR-016**: Adding a new user-data object to the backup MUST require only declaring it in that registry,
  without redesigning the backup/restore machinery, and MUST declare whether it is network-scoped (tagged) or
  network-agnostic.

**Platform constraints**

- **FR-017**: The system MUST NOT introduce an application backend — encryption is client-side, storage is
  IPFS, and the backup locator is on-chain (the existing no-backend footprint: client / IPFS / on-chain).
- **FR-018**: Backup/restore MUST be strictly per wallet with no cross-wallet data leakage.
- **FR-019**: Reading and editing the member's data MUST continue to work offline; backup/restore actions MAY
  require connectivity but MUST fail clearly and non-destructively when offline.
- **FR-020**: Any new UI (backup/restore controls, status, merge/replace confirmation) MUST meet WCAG 2.1 AA.
- **FR-021**: The system MUST warn the member (not hard-fail) when the backup payload exceeds a soft cap of
  ~1 MB, so routine address-book + preferences data backs up fast while oversized data is surfaced clearly.

### Key Entities *(include if feature involves data)*

- **Backup Bundle**: the single unified per-wallet payload, plus a version/timestamp; what gets encrypted and
  stored. Internally it is **network-tagged**: every network-specific element (contact/address, token, DAO, …)
  carries its chain id, while network-agnostic data (global preferences) has none. One unified file, but each
  element knows its network — so the same identifier on two networks stays two distinct, durable elements.
- **Encrypted Backup**: the encrypted form of the bundle as stored on IPFS (content-addressed); readable only
  with the wallet-derived key.
- **Backup Registry (on-chain)**: a contract on a single canonical network mapping each wallet to a pointer to
  its latest encrypted backup. Owner-only writes, public reads, stores only a pointer (no personal data). The
  trustless locator a device reads at restore time to find the latest backup using only the wallet.
- **Backed-up Object Registry**: the explicit, extensible list of which user-data objects are included
  (address book, preferences, …), whether each is **network-scoped (chain-tagged)** or network-agnostic, and
  how each reconciles on merge (additive vs. last-writer-wins).
- **Backup Status**: the member-visible state — whether a backup exists and when it was last made.
- **Encryption Key**: a symmetric key derived from the wallet's signature of a fixed app message (never
  stored), so only the wallet holder can encrypt/decrypt and the same wallet reproduces it on any device —
  contingent on the wallet producing a deterministic signature (guarded per FR-001a).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can back up their data in a single explicit action and see an honest confirmed state
  with a last-backup time.
- **SC-002**: A member who triggers restore on a fresh device with the same wallet recovers their address
  book and preferences with no separately-copied secret or identifier.
- **SC-003**: 100% of stored backups are unreadable without the member's wallet (no plaintext personal data
  is ever stored off-device).
- **SC-004**: Restoring onto non-empty local data is **never** destructive without an explicit member choice
  + confirmation; merge loses **zero** additive entries across a test matrix.
- **SC-005**: A failed backup/restore results in **zero** loss or corruption of local data in 100% of failure
  injections; nothing is shown as backed up that was not confirmed stored.
- **SC-006**: No personal data leaves the device until the member triggers a backup, verified across fresh
  installs.
- **SC-007**: Switching wallets only ever restores that wallet's own backup — zero cross-wallet leakage.
- **SC-008**: Reading/editing data works offline; offline backup/restore fails clearly and non-destructively
  in 100% of offline attempts.
- **SC-009**: New backup/restore UI passes automated accessibility checks (WCAG 2.1 AA) with no new
  violations.
- **SC-010**: No application backend is introduced; storage is IPFS, encryption is client-side, and the
  backup locator is on-chain.
- **SC-011**: A member can locate and restore their latest backup using only their wallet by reading the
  on-chain registry — with no platform service involved (trustless) and no copied reference.
- **SC-012**: One unified restore — performed on any supported network — recovers the wallet's full address
  book (entries across all networks) plus global preferences, not a per-network fragment.
- **SC-012a**: Every restored network-specific element lands on its original network (zero cross-network
  mis-attribution); the same identifier present on two networks restores as two distinct elements.
- **SC-013**: A backup exceeding the ~1 MB soft cap warns the member and still proceeds (no silent failure);
  a wallet that cannot reproduce a deterministic signature is blocked with a clear message and never produces
  an unrestorable backup.

## Assumptions

- **Manual backup/restore (per the member's clarification)**: this ships as an explicit member step ("Back up
  my data" / "Restore my data"), not automatic background sync. This removes the need for any always-on
  cross-device discovery, background polling, or gas-per-change.
- **Backup locator mechanism** *(decided)*: an **on-chain per-wallet registry contract on a single canonical
  network** records the pointer to each wallet's latest backup, so restore needs only the wallet and is
  trustless (no platform service to trust, no copied reference). This is a deliberate choice over IPNS
  (resolution-reliability risk) and a member-held recovery code (loss-prone) — it fits the project's
  on-chain-first design and no-backend footprint. The trade-off is a small gas cost on each backup write, on
  the canonical network (reads are free); the member is told the cost before signing. The registry pointer is
  public by design (FR-005b). The existing encrypted export/import file (spec 021) is retained as an offline,
  zero-infra fallback for members who prefer not to transact.
- **Canonical network** *(plan detail)*: the specific low-cost network hosting the registry (e.g. Polygon
  vs. Amoy vs. Mordor) is chosen in `/speckit-plan`; the spec only requires it be a single canonical network
  the contract is deployed to.
- **Encryption**: a symmetric key is derived from a wallet signature (a fixed app message) so the same wallet
  reproduces the key on any device; the key is never stored or transmitted. This depends on the wallet
  producing a deterministic signature (standard for RFC-6979 ECDSA wallets); the app guards against
  non-deterministic signers and fails honestly (FR-001a). Reuses the existing client-side encryption
  capabilities (specs 002 / 005).
- **Merge defaults**: additive-merge for the address book (reusing its existing merge capability, spec 021)
  and last-writer-wins (by version/timestamp) for scalar preferences; per-object rules live in the registry.
- **Pinning**: encrypted backups are pinned via the platform's existing IPFS pinning so they persist;
  superseded backups need not be retained.
- **Scope of objects (initial)**: the wallet's address book (all per-network entries) + global market/app
  preferences, combined into one unified per-wallet bundle; the registry of objects is extensible to other
  user-authored objects later. Re-derivable/cache data (activity feed, balances, membership caches) is
  excluded.
- **Reuses existing infrastructure**: the IPFS pinning path, the client-side encryption utilities, the
  per-wallet local storage layer, and the address-book merge + encrypted export/import already in the app.

## Out of Scope

- Automatic, background, always-on cross-device sync (this feature is an explicit manual backup/restore step;
  automatic sync is a possible later evolution).
- Syncing data that is re-derivable from chain or is a transient cache (activity feed, balances,
  membership/tier caches).
- Sharing data between different wallets/users or any multi-recipient access (single-owner data;
  multi-recipient encryption remains spec 005's concern).
- A general key-recovery / social-recovery scheme — losing the wallet means the encrypted backup is
  unrecoverable by design.
- Introducing any application backend or server-side store.

## Dependencies

- The platform's existing **IPFS pinning** path (the storage layer this feature writes to).
- The existing **client-side encryption** capabilities (specs 002 e2e-encryption-lifecycle, 005
  multi-recipient-encryption) — reused for the per-wallet symmetric encryption.
- The **address book** module and its merge + encrypted export/import (spec 021) — the first backed-up object,
  the source of the additive-merge rule, and the zero-infra fallback locator.
- The **user/market preferences** store — the second backed-up object.
- A new **on-chain backup registry contract** (per-wallet pointer; owner-only writes, public reads; stores no
  personal data) deployed to a **single canonical network** — the trustless locator. As a contract addition it
  is subject to the security-review gate (checks-effects-interactions, access control, Slither/Medusa,
  EthTrust-SL) and, if the chosen canonical network is the pre-Cancun ETC/Mordor target, must compile/deploy
  there (keep it minimal — plain storage mapping + event, no exotic opcodes).
