# Feature Specification: Unified Activity Ledger with Durable Audit Logging

**Feature Branch**: `claude/activity-audit-logging-axj086`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "We are currently tracking activity in several locations. The appropriate place for it is in the user's Account tab. In order to provide robust reporting and auditing abilities for a user we need to make sure activities across all surfaces are properly tracked, recorded, backed up, and made available to the reporting function. This will ensure an immutable log is recoverable of all trades, loans, transfers, wagers, deposits, etc. with appropriate data fidelity to facilitate tax reporting functionality in the app."

## Problem Statement

User activity is currently tracked in several disconnected places, each with its
own data path, retention, and fidelity:

- The **Account tab** (spec 020) derives deposit/payout/refund rows at runtime
  from wager state; on networks without an indexer these rows have no real
  timestamps, producing displays like "20645d ago".
- The **Pay & Transfer Activity tab** keeps wallet-transfer history — including
  failed gasless/sponsored operations — only in a device-local log capped at
  100 entries.
- The **platform notification feed** (spec 031) keeps a separate device-local
  activity store.
- The **tax report** (spec 016) reads a different data path entirely (indexed
  wager value-transfer records), so its totals can disagree with the Account
  tab.
- **Earn/lending (loans), pool activity, and gasless operations have no durable
  per-user history at all.**
- **None of the device-local activity stores are included in the encrypted
  backup** (spec 032), so activity history is lost on cache clear or device
  change.

A user who needs to audit their financial activity — especially for tax
reporting — cannot today obtain a single, complete, trustworthy record.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One Complete Activity Record in the Account Tab (Priority: P1)

As a FairWins user, I open my Account tab and see a single, complete,
chronological record of every financial activity on my account for the active
network — wager deposits, payouts, refunds, draws, and cancellations; wallet
transfers of native currency and tokens (including failed attempts and
gasless/sponsored operations); earn/lending deposits, withdrawals, loans, and
rewards; pool joins, claims, and refunds; and membership/voucher purchases —
each with accurate details: what happened, when, how much, in what token, its
value at the time, who the counterparty was, whether it succeeded or failed,
and a verifiable transaction reference where one exists.

**Why this priority**: This is the core of the request — the Account tab is
the appropriate single home for activity, and every other capability (backup,
reporting, auditing) depends on one canonical ledger existing. Without it,
users must visit several screens and still see an incomplete picture.

**Independent Test**: Perform one activity of each class (wager lifecycle
events, a wallet transfer, a failed gasless transfer, an earn deposit, a pool
join/claim, a membership purchase) on a test network, then open the Account
tab and verify each appears exactly once in the activity record with correct
type, amount, token, timestamp, status, and transaction reference.

**Acceptance Scenarios**:

1. **Given** a user has performed activity across wagers, wallet transfers,
   earn, pools, and membership, **When** they open the Account tab, **Then**
   all of that activity appears in one chronological record without visiting
   any other screen.
2. **Given** a gasless transfer failed before reaching the chain (e.g.
   "Smart Account does not have sufficient funds"), **When** the user views
   the activity record, **Then** the failed attempt appears with a failed
   status, the failure reason, and the date it was attempted.
3. **Given** a user switches the active network, **When** they view the
   activity record, **Then** only activity for that network is shown and no
   activity from other networks leaks in.
4. **Given** an activity record entry has a confirmed on-chain transaction,
   **When** the user selects it, **Then** they can reach the corresponding
   block-explorer entry to independently verify it.
5. **Given** the user filters the record by activity class (e.g. only
   transfers, only wagers), **When** the filter is applied, **Then** only
   matching entries are shown and displayed totals reflect the filter.

---

### User Story 2 - Reporting Reads the Same Ledger (Priority: P2)

As a user preparing my taxes, I generate an activity/tax report for a chosen
period and the report contains exactly the same activities, amounts, and
timestamps that the Account tab shows for that period — every trade, loan,
transfer, wager, and deposit — because both read from the same ledger. The
export has enough fidelity (real timestamps, transaction references, token,
amount, value at time of activity, counterparty, status) for me to hand it to
a tax professional.

**Why this priority**: Tax reporting is the stated end goal, and today the
report and the dashboard can disagree because they use different data paths.
Agreement between the audit view and the export is what makes the record
trustworthy.

**Independent Test**: Generate a report for a period containing known
activity of every class and compare it line-by-line and total-by-total against
the Account tab's record filtered to the same period; they must match.

**Acceptance Scenarios**:

1. **Given** a period with activity of every class, **When** the user
   generates a report for that period, **Then** every ledger entry in the
   period appears in the report and no entry appears in only one of the two
   surfaces.
2. **Given** the Account tab shows summary figures (net P&L, total wagered),
   **When** a report is generated for the same period and network, **Then**
   the report's totals equal the Account tab's figures.
3. **Given** activity classes that previously never reached the report
   (wallet transfers, earn/lending, pools, failed gasless operations),
   **When** a report is generated, **Then** those activities are included and
   clearly categorized, with failed operations distinguishable from settled
   value movements.
4. **Given** an entry whose value-at-time could not be determined, **When**
   the report is generated, **Then** the entry is still present and is
   explicitly flagged as missing valuation rather than silently showing zero.

---

### User Story 3 - The Ledger Is Immutable and Recoverable (Priority: P3)

As a user who cleared my browser data or moved to a new device, I restore my
account (via my existing encrypted backup flow) and my complete activity
history comes back: everything that happened on-chain is re-derived from the
public record, and activity that only ever existed on my device — such as
failed operations that never reached the chain — is restored from my encrypted
backup. Past entries are never silently edited or deleted; corrections appear
as new entries.

**Why this priority**: "Immutable and recoverable" is the durability guarantee
that makes the ledger an audit log rather than a cache. It depends on the
ledger existing (P1) but not on reporting (P2).

**Independent Test**: Record activity including at least one client-only
event, run a backup, clear all local data (or use a fresh device), restore,
and verify the activity record is byte-for-byte equivalent in content to the
pre-wipe record.

**Acceptance Scenarios**:

1. **Given** a user with on-chain activity and a current encrypted backup,
   **When** they restore on a new device, **Then** the Account tab shows the
   same complete activity record they had before, including client-only
   entries such as failed gasless attempts.
2. **Given** a user restores without any backup, **When** the ledger is
   rebuilt, **Then** all on-chain-derivable activity is present and the user
   is informed that device-local-only history (e.g. failed attempts) could
   not be recovered.
3. **Given** an existing ledger entry, **When** any subsequent processing
   occurs (re-sync, restore, correction), **Then** the original entry is
   never mutated in place; superseding information appears as a new entry or
   annotation and the original remains visible to auditing.
4. **Given** a restore overlaps with re-derived on-chain history, **When**
   the two are merged, **Then** no duplicate entries are shown for the same
   underlying event.
5. **Given** new client-only activity occurs after the last backup, **When**
   the user next backs up, **Then** the new activity is included without the
   user having to select it manually.

---

### User Story 4 - Every Timestamp Is Real and Rendered Honestly (Priority: P4)

As a user, every activity entry I see carries the real date and time the
activity occurred, on every supported network — including networks without an
indexing service — and the interface never invents a time. Displays like
"20645d ago" never appear; if a true timestamp is genuinely unavailable, the
entry says so instead of rendering a misleading relative time.

**Why this priority**: Timestamps are the backbone of audit and tax fidelity;
a wrong date can change a tax year. This is last only because it is a fidelity
refinement of entries that P1 already surfaces.

**Independent Test**: On a network without an indexer, perform wager activity
and verify the Account tab shows the true activity dates (matching the block
explorer) and that no entry anywhere renders a relative time derived from a
missing or zero timestamp.

**Acceptance Scenarios**:

1. **Given** activity on a network without an indexing service, **When** the
   user views the activity record, **Then** each entry shows the true date
   and time of the underlying transaction.
2. **Given** an entry whose true timestamp cannot be established, **When** it
   is displayed, **Then** the interface shows an explicit "date unavailable"
   state and never a computed relative time such as "20645d ago".
3. **Given** any entry with a known timestamp, **When** it is displayed as
   relative time, **Then** the value is consistent with the absolute
   timestamp shown on the entry's detail view and with the block explorer.

---

### Edge Cases

- A restore is performed from a backup made on a device that also had
  activity the current device never saw, while the current device has newer
  activity the backup lacks — the merged ledger must contain both without
  duplicates.
- The same underlying event is observable from two sources (e.g. an indexed
  record and a live chain read) — the ledger must deduplicate to one entry
  keyed on the underlying transaction/event identity.
- A failed gasless attempt is later retried and succeeds — both the failed
  attempt and the successful operation appear, distinguishable and ideally
  associated.
- Value-at-time cannot be priced (obscure token, missing price history) — the
  entry is kept and flagged, never dropped or silently zeroed.
- Activity volume exceeds any local cap (e.g. an active user's 101st
  transfer) — history visible in the ledger and included in backups must not
  be silently truncated; if practical limits exist they must be disclosed.
- The user has activity on multiple networks with the same address — entries
  must remain strictly network-scoped in display and in reports, and a report
  states which network(s) it covers.
- An activity occurs while the app is closed (e.g. an incoming transfer or a
  wager resolved by a third party) — it must still appear in the ledger the
  next time the ledger syncs.
- Clock skew between the user's device and the chain — recorded times for
  on-chain events come from the chain, not the device clock.
- A backup exists but cannot be decrypted (wrong key) — the on-chain-derived
  ledger still loads; the user is told client-only history was not restored.

## Requirements *(mandatory)*

### Functional Requirements

**Coverage**

- **FR-001**: The system MUST maintain, per user account and per network, a
  single activity ledger that records every financial activity class the
  product supports: wager lifecycle value events (deposit, payout, refund,
  draw, cancellation), wallet transfers of native currency and tokens
  (incoming where detectable, and all outgoing), gasless/sponsored operations
  (including those that failed before reaching the chain), earn/lending
  events (deposits, withdrawals, loan originations/repayments, rewards), pool
  events (join, claim, refund), and membership/voucher purchases.
- **FR-002**: The Account tab MUST present this ledger as the user's canonical
  activity record, and every activity surface elsewhere in the product
  (transfer activity list, notification feed) MUST be consistent with it —
  no surface may show a financial activity that is absent from the ledger.
- **FR-003**: Failed operations MUST be first-class ledger entries carrying a
  failed status and the failure reason, clearly distinguished from settled
  value movements so they are never counted in financial totals.

**Data fidelity**

- **FR-004**: Each ledger entry MUST record: activity class and direction; the
  date and time the activity actually occurred; asset and amount; the value of
  the amount at the time of the activity in the user's reporting currency
  (or an explicit "unvalued" flag when unavailable); counterparty where one
  exists; final status (settled, pending, failed, cancelled); the network it
  occurred on; and a verifiable on-chain transaction reference for every
  entry that reached the chain.
- **FR-005**: Timestamps for on-chain events MUST come from the chain's own
  record (block time), on every supported network including those without an
  indexing service; the device clock is used only for client-only events that
  never reached the chain.
- **FR-006**: The interface MUST never render a relative or absolute time
  derived from a missing, zero, or invalid timestamp; such entries MUST show
  an explicit "date unavailable" state. (This retires the "20645d ago" class
  of defect.)
- **FR-007**: Ledger entries MUST be strictly scoped to the network they
  occurred on; display, totals, backup, and reports MUST never mix networks
  without explicitly labeling them.

**Immutability & recoverability**

- **FR-008**: The ledger MUST be append-only from the user's perspective:
  recorded entries are never edited in place or deleted; corrections and
  status transitions appear as new information that supersedes without
  erasing.
- **FR-009**: All activity that reached the chain MUST be re-derivable from
  public on-chain/indexed data at any time, so the on-chain portion of the
  ledger is recoverable with no backup at all.
- **FR-010**: Activity that exists only on the user's device (e.g. failed
  operations that never reached the chain, and any locally-enriched detail
  that cannot be re-derived) MUST be included automatically in the user's
  existing encrypted backup, and restored by the existing restore flow.
- **FR-011**: On restore or re-sync, the system MUST merge re-derived
  on-chain history with backed-up client-only history without creating
  duplicate entries for the same underlying event.
- **FR-012**: When client-only history cannot be recovered (no backup, or
  backup cannot be decrypted), the system MUST still rebuild the
  on-chain-derived ledger and MUST tell the user that device-local history
  was not recovered.
- **FR-013**: Ledger history MUST NOT be silently truncated. Any practical
  retention limit MUST be disclosed to the user, and no limit may cause
  activity within at least the current and previous tax year to become
  unavailable to reporting.

**Reporting**

- **FR-014**: The reporting function (activity/tax report) MUST read from the
  same ledger the Account tab presents, cover all ledger activity classes,
  and produce exports whose line items and totals match what the Account tab
  shows for the same period and network.
- **FR-015**: Account tab summary figures (net P&L, totals, breakdowns) MUST
  be computed from the ledger so that dashboard, activity record, and report
  can never disagree.
- **FR-016**: Exports MUST carry the full fidelity of FR-004 per line item so
  the output is usable for tax preparation, and MUST explicitly flag entries
  with missing valuations rather than omitting or zeroing them.

**Migration & continuity**

- **FR-017**: Existing device-local activity history (transfer history,
  notification-feed history, report history) MUST be migrated into the ledger
  on first use so no previously visible history is lost by this feature.

### Key Entities

- **Activity Ledger**: The per-account, per-network, append-only collection of
  activity entries; the single source read by the Account tab, all activity
  surfaces, and the reporting function.
- **Ledger Entry**: One recorded activity: class, direction, asset, amount,
  value-at-time (or unvalued flag), timestamp and its provenance (chain vs
  device), status, counterparty, network, transaction reference, and a stable
  identity for deduplication across sources and restores.
- **Client-Only Record**: The subset of ledger entries not re-derivable from
  public data (e.g. failed gasless attempts); the portion that must travel in
  the encrypted backup.
- **Activity Report**: A user-requested export over the ledger for a period
  and network, with line items and totals that match the Account tab.
- **Backup Bundle (existing, spec 032)**: The encrypted user-data container;
  extended to carry Client-Only Records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of supported financial activity classes (wagers, wallet
  transfers, gasless operations including failures, earn/lending, pools,
  membership purchases) appear in the Account tab activity record — verified
  by performing one of each and finding each exactly once.
- **SC-002**: For any chosen period and network, the generated report and the
  Account tab agree exactly: zero line items present in one but not the
  other, and identical totals.
- **SC-003**: After a full local-data wipe and restore from backup, the user
  recovers 100% of their prior activity record, including client-only
  entries; with no backup, 100% of on-chain-derivable entries are recovered.
- **SC-004**: Zero occurrences of relative times computed from missing or
  zero timestamps (the "20645d ago" defect class) across all supported
  networks; every displayed activity date for an on-chain event matches the
  block explorer.
- **SC-005**: A user can locate any specific past activity (by class, date
  range, or status) from the Account tab in under 30 seconds without visiting
  another screen.
- **SC-006**: Failed operations are never counted in financial totals on any
  surface — dashboard figures, breakdowns, and report totals exclude them
  while still listing them — verified by comparing totals before and after a
  failed attempt.
- **SC-007**: No user-visible activity history that existed before this
  feature is lost after it ships (migration completeness), verified against
  pre-migration snapshots of each legacy store.

## Assumptions

- The public chain (and, where available, indexed data) is the record of
  record for on-chain activity; the ledger is a faithful, re-derivable view of
  it, not a competing store. Deep history re-derivation on indexer-less
  networks may be best-effort within disclosed limits (FR-013).
- The existing encrypted backup/restore flow (spec 032) is the vehicle for
  durable client-only data; this feature extends what that bundle carries
  rather than introducing a new backup mechanism, preserving its privacy
  model (user-held keys, no plaintext leaves the device).
- No new server-side per-user activity storage is introduced; durability comes
  from the chain plus the user's encrypted backup. This preserves the
  product's existing privacy stance (the platform does not hold user activity
  dossiers).
- Value-at-time uses the product's existing pricing sources; where historical
  prices are unavailable the entry is flagged unvalued rather than estimated
  silently.
- "Loans" refers to the earn/lending capability (spec 050 earn-lending) —
  positions, originations/repayments where applicable, and rewards; there is
  no separate loan product.
- Incoming wallet transfers are included where they are practically
  detectable for the user's account; the spec does not require exhaustive
  detection of arbitrary third-party airdrops, and any such limitation is
  disclosed in the reporting output.
- The reporting currency for value-at-time is USD, consistent with the
  existing tax report (spec 016).
- Nicknames/labels applied to counterparties remain client-side (consistent
  with existing address-book behavior) and travel via the existing backup,
  not on-chain.

## Dependencies

- **Spec 016 (wager tax report)**: reporting function to be re-pointed at the
  ledger and extended to all activity classes.
- **Spec 020 (account stats dashboard)**: Account tab surfaces to read the
  ledger instead of runtime-derived transfers.
- **Spec 031 (platform notifications)**: notification feed must stay
  consistent with the ledger.
- **Spec 032 (encrypted data sync)**: backup bundle extended to carry
  client-only ledger records.
- **Specs 035/036/041/050 (intents, relayer, passkey wallet, sponsored
  paymaster)**: sources of gasless/UserOp activity, including failures, that
  the ledger must capture.
- **Spec 034 (wager pools)** and **spec 050 (earn-lending)**: sources of pool
  and earn/loan activity.
