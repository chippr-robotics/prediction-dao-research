# Feature Specification: Wager Tax & Activity Report Generation

**Feature Branch**: `016-wager-tax-report`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "report generation function for a user. The user should be able to select a time period with a from and to date or select pre-defined time periods like last month, last quarter, last year, last calendar year, etc. in order to generate a downloadable document containing information about all of the wagers they have participated in with details such as Transaction Mechanics (date/time, stablecoin ticker, amount sent), Financial Values (fair market value in USD, cost basis, transaction fees), and Blockchain Evidence (transaction hash, sending and receiving wallet addresses). The reports should be viewable and downloadable from the My Account page. The admin section should also be capable of generating reports for users. We will add a role for the operations person which will perform this activity."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Self-service tax report for a chosen period (Priority: P1)

A wager participant opens their My Account area, chooses a reporting period (either a
custom from/to date range or a pre-defined period such as "last month" or "last
calendar year"), and generates a downloadable document that lists every wager-related
stablecoin transfer they took part in during that period, with the transaction,
financial-value, and blockchain-evidence details needed to support tax filing and
personal record-keeping.

**Why this priority**: This is the core value of the feature — giving an individual user
a complete, defensible record of their on-chain wager activity so they can meet tax and
accounting obligations. Without it, nothing else in the feature has value. It is a fully
viable MVP on its own.

**Independent Test**: With an account that has participated in at least one resolved and
one open wager, select a period that contains those wagers, generate the report, and
confirm the downloaded document lists each transfer with the required Transaction
Mechanics, Financial Values, and Blockchain Evidence fields and that totals reconcile to
the included rows.

**Acceptance Scenarios**:

1. **Given** a signed-in user with wager activity in May, **When** they select the
   pre-defined period "last month" and request a report, **Then** the document contains
   only transfers whose timestamp falls within that calendar month and excludes activity
   from other months.
2. **Given** a signed-in user, **When** they enter a custom from date and to date and
   request a report, **Then** the document contains every wager transfer with a timestamp
   within the inclusive range and no transfers outside it.
3. **Given** a generated report, **When** the user opens it, **Then** each row shows the
   exact transfer date/time, stablecoin ticker, amount sent, USD fair market value, cost
   basis, transaction/network fees, full transaction hash, and the sending and receiving
   wallet addresses.
4. **Given** a user with no wager activity in the selected period, **When** they request a
   report, **Then** the system produces an empty-but-valid report (or a clear "no activity"
   result) rather than an error.
5. **Given** a successfully generated report, **When** the user chooses to download it,
   **Then** the document is delivered as a downloadable file they can save and re-open.

---

### User Story 2 - View and re-download previously generated reports (Priority: P2)

From the My Account area, a user can see a list of reports they have previously generated
(with the period each covers and when it was created), view them again, and re-download
them without regenerating from scratch.

**Why this priority**: Tax records are referenced repeatedly (filing, amendments, audits).
Persisting and re-listing generated reports avoids forcing users to recreate identical
documents and gives them confidence their history is retained. It builds directly on
Story 1 but is not required for the first usable slice.

**Independent Test**: After generating a report in Story 1, navigate away and return to My
Account, confirm the report appears in a history list with its period and creation date,
and re-download it to confirm the file is unchanged.

**Acceptance Scenarios**:

1. **Given** a user who previously generated a report, **When** they open the reports
   section of My Account, **Then** they see that report listed with its covered period and
   generation date.
2. **Given** a listed historical report, **When** the user selects it, **Then** they can
   view and re-download the same document without re-running the generation.

---

### User Story 3 - Operations / admin generates a report on behalf of a user (Priority: P2)

A staff member holding the Operations role (or an administrator) opens the admin section,
selects a specific user, chooses a reporting period, and generates the same report on that
user's behalf — for support requests, dispute resolution, or compliance.

**Why this priority**: Users will request help, and compliance/operations staff need to
produce records on demand. This extends the same reporting capability to privileged staff
and introduces the new Operations role, but the user-facing self-service flow (Stories 1–2)
delivers value first.

**Independent Test**: Sign in as a user holding only the Operations role, open the admin
report tool, select another user with known activity and a period, generate the report, and
confirm it matches what that user would receive for the same period. Then confirm a user
without the Operations or admin role cannot reach or use the tool.

**Acceptance Scenarios**:

1. **Given** a staff member with the Operations role, **When** they select a target user
   and reporting period in the admin section, **Then** they can generate and download a
   report containing that user's wager activity for the period.
2. **Given** a user without the Operations role or an administrative role, **When** they
   attempt to access the report-for-user tool, **Then** access is denied.
3. **Given** an operations-generated report, **When** it is compared to the report the
   target user would generate for the same period, **Then** the content matches.
4. **Given** any generation of a report on behalf of a user, **When** it completes, **Then**
   the action is recorded (who generated it, for which user, which period, and when) for
   accountability.

---

### Edge Cases

- **Period boundaries / time zone**: A transfer whose timestamp sits exactly on the from or
  to boundary must be unambiguously included or excluded based on a clearly stated, fixed
  reporting time zone (see Assumptions), and pre-defined periods ("last quarter", "last
  calendar year") must resolve to the same boundaries every time.
- **Future or inverted ranges**: If a user enters a to date before the from date, or a range
  extending into the future, the system rejects or normalizes the request with a clear
  message rather than producing a misleading report.
- **Stablecoin de-pegging**: When the USD fair market value of a stablecoin at the time of a
  transfer differs from $1.00, the report must reflect the actual value at that time, not a
  hardcoded $1.00.
- **Multiple stablecoins**: A user who transacted in more than one stablecoin in the period
  sees each transfer reported in its own ticker, with USD values computed per transfer.
- **Open / unresolved / refunded / drawn wagers**: Stakes that are deposited but not yet
  resolved, or that are refunded or end in a draw, must be represented truthfully (e.g.
  outbound stake and any later inbound refund/payout each shown as their own transfer) and
  must never imply a settlement the chain has not reached.
- **Pricing data unavailable**: If USD fair-market-value data cannot be determined for a
  given transfer time, the report must surface the gap explicitly rather than silently
  substituting a value.
- **Large activity volume**: A user with a very large number of transfers in the period
  still receives a complete report (no silent truncation).
- **Network scope**: Activity is reported per the active network and must not mix
  testnet and mainnet activity in a single user's report.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to generate a wager activity/tax report for a reporting
  period of their choosing from the My Account area.
- **FR-002**: Users MUST be able to define the reporting period either as a custom from/to
  date range or by choosing a pre-defined period, including at minimum: last month, last
  quarter, last year (trailing 12 months), and last calendar year. The set of pre-defined
  periods MUST be presented as named, selectable options.
- **FR-003**: The report MUST include every wager-related stablecoin transfer the user
  participated in within the selected period, including stake deposits and any payouts or
  refunds, and MUST exclude activity outside the period.
- **FR-004**: For each transfer, the report MUST record the Transaction Mechanics: the exact
  date and time of the transfer, the specific stablecoin ticker (e.g. USDC, USDT, PYUSD),
  and the exact amount of tokens transferred.
- **FR-005**: For each transfer, the report MUST record the Financial Values: the U.S.
  dollar fair market value at the time of the transfer (reflecting de-pegging rather than a
  fixed $1.00), the cost basis, and any transaction/gas/network fees paid.
- **FR-006**: For each transfer, the report MUST record the Blockchain Evidence: the full
  transaction hash, the sending wallet address, and the receiving wallet address.
- **FR-007**: The report MUST be produced as a downloadable document that the user can save
  and re-open offline.
- **FR-008**: The report MUST include identifying header information (the account/wallet the
  report covers, the reporting period, and the generation date/time) and per-stablecoin
  and overall totals for the transfers it contains.
- **FR-009**: The report MUST carry a clear statement that it is an informational activity
  record and not tax advice.
- **FR-010**: Users MUST be able to view a history of their previously generated reports and
  re-download them from the My Account area.
- **FR-011**: The system MUST introduce an "Operations" role distinct from existing
  administrative roles, whose purpose is to generate reports on behalf of users.
- **FR-012**: Staff holding the Operations role, and administrators, MUST be able to select
  a target user and reporting period in the admin section and generate the same report on
  that user's behalf.
- **FR-013**: Reports generated on behalf of a user MUST contain the same content the user
  would obtain for the same period and network.
- **FR-014**: The system MUST restrict the generate-report-for-user capability to holders of
  the Operations or an administrative role and MUST deny it to all other users.
- **FR-015**: The system MUST record an auditable trail of each report generated on behalf
  of a user, capturing who generated it, the target user, the period, and the timestamp.
- **FR-016**: The system MUST handle invalid period selections (inverted ranges, ranges
  extending into the future) with a clear, user-understandable message instead of producing
  a misleading or partial report.
- **FR-017**: The system MUST scope reported activity to the active network and MUST NOT
  combine testnet and mainnet activity in a single report.
- **FR-018**: When fair-market-value or cost-basis information for a transfer cannot be
  determined, the report MUST surface the gap explicitly rather than silently substituting
  a value.
- **FR-019**: Cost basis MUST be derived from the recorded USD fair market value of the
  stablecoin at the time the tokens were staked / entered the platform for that transfer
  (the same valuation source used for fair market value, reflecting any de-pegging). The
  report MUST note that this reflects on-platform value at staking time and that a user's
  actual off-platform acquisition cost may differ. Supporting user-supplied per-lot
  acquisition cost is explicitly out of scope for v1 (see Assumptions).

### Key Entities *(include if feature involves data)*

- **Report Request**: A user's (or operations staff's) intent to generate a report —
  identifies the target account/wallet, the resolved reporting period (start and end), the
  network, the requester, and whether it was self-service or generated on behalf of a user.
- **Activity Report**: The generated document and its metadata — covered account, period,
  network, generation timestamp, generating party, the list of transfer line items, and
  computed totals; persisted so it can be re-listed and re-downloaded.
- **Transfer Line Item**: A single wager-related stablecoin movement — transfer timestamp,
  direction (deposit/payout/refund), stablecoin ticker, token amount, USD fair market value,
  cost basis, fees, transaction hash, sending address, receiving address, and the wager it
  relates to.
- **Reporting Period**: A named or custom span — for pre-defined periods, the rule that maps
  a name (e.g. "last calendar year") to fixed start/end boundaries; for custom periods, the
  user-supplied from/to dates.
- **Operations Role**: A privileged staff capability, separate from existing admin roles,
  that authorizes generating reports on behalf of any user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can generate and download a report for a chosen period in under 1
  minute from the My Account area, without assistance.
- **SC-002**: For a known set of test activity, 100% of in-period transfers appear in the
  report and 0% of out-of-period transfers appear, across both custom ranges and every
  pre-defined period option.
- **SC-003**: Every transfer row contains all required fields (timestamp, ticker, amount,
  USD fair market value, cost basis, fees, transaction hash, sending address, receiving
  address) with no blank required field unless the gap is explicitly flagged.
- **SC-004**: Per-stablecoin and overall totals in the report reconcile exactly to the sum
  of the included line items.
- **SC-005**: 100% of attempts by non-privileged users to generate a report for another user
  are denied, and 100% of operations/admin-generated reports are recorded in the audit
  trail.
- **SC-006**: An operations staff member can locate a user and produce that user's report
  for a given period in under 2 minutes.
- **SC-007**: A report generated by operations for a given user and period is equivalent in
  content to the report that user would self-generate for the same period and network.

## Assumptions

- **Report formats**: The downloadable document is produced as a human-readable PDF similar
  to the attached sample; a machine-readable CSV/spreadsheet export of the same line items
  is also provided to support import into tax software. (If only one format is desired, PDF
  is the default.)
- **"My Account" location**: The user-facing entry point is the existing account/wallet area
  of the app where users already view their wallet, roles, and membership status; reporting
  is added there rather than as a new top-level destination.
- **Admin location**: The operations/admin report tool lives within the existing admin
  section alongside other role-gated tools.
- **Data source**: Wager activity, amounts, timestamps, participants, and transaction hashes
  are drawn from existing on-chain records and the project's indexing of them; no new
  category of on-chain data is required, only its presentation.
- **Fair market value source**: USD fair-market values are obtained from a price source/oracle
  appropriate to the active network and the transfer's timestamp; de-pegging is reflected by
  using the value at that time rather than a fixed $1.00.
- **Reporting time zone**: Period boundaries and pre-defined periods are resolved against a
  single, clearly stated reporting time zone (UTC by default) so results are deterministic.
- **Scope of activity**: "Wagers participated in" covers wagers where the account was the
  creator, the opponent/acceptor, or otherwise transferred or received stablecoin stakes,
  payouts, or refunds; arbitration-only involvement without a transfer is out of scope for v1.
- **Stablecoin coverage**: The report supports whichever stablecoins the platform actually
  uses on the active network (currently USDC); USDT/PYUSD are illustrative tickers and are
  reported only if/when supported.
- **Cost-basis method (v1)**: Cost basis uses the USD fair market value of the stablecoin at
  staking time (FR-019). User-supplied per-lot acquisition cost is deferred to a future
  enhancement and is out of scope for v1.
- **Not tax advice**: The report is an informational activity record; the platform does not
  compute tax owed or provide tax advice, and the document states this.
- **Authentication/authorization**: Existing account sign-in and the existing role/access
  framework are reused; the new Operations role is added to that framework rather than a new
  permission system.
- **Retention**: Generated reports are retained and re-listable for the user; a specific
  retention duration follows standard practice for financial records unless otherwise
  directed.
