# Feature Specification: Safe Receiver — counterparty-segregated receive addresses

**Feature Branch**: `070-safe-receiver`

**Created**: 2026-07-27

**Status**: Draft — **paused with open design issues**. The product framing below
stands; the implementation design in `plan.md` and `contracts/*.md` does **not**
yet hold. See [review-findings.md](./review-findings.md): 31 verified findings,
4 critical, plus two open product questions (address reuse after deployment, and
native-coin handling). Do not implement from these artifacts as they stand.

**Input**: GitHub issue #929 — "Safe Request" — sanctions-screened payments (on-chain enforced settlement) — reframed after measurement (see `research.md`). Owner direction: *"The safe receive addresses should be unique to the member and not require special URI parameters. Similar to how we are deploying multisigs in the Protect section, we should allow a user to setup a safe receiver which is a contract they deploy and own which is a contract factory for receive addresses which allow deposit from any non-sanctioned address. The user can later deploy the contract sweeping the funds into their account or send from one of the addresses with the change moving to a new address similar to a utxo model."*

## Overview

FairWins members receive money at a single address. Every payer they have ever
given it to pays the same place, so every payment commingles the moment it
lands. If one of those payers turns out to be sanctioned, there is no way to
separate their money from anyone else's — the balance is a single fungible
number with no memory of where it came from. Today the only defence is a
client-side check that gates a button, which does nothing about money already
received.

**Safe Receiver** gives each member an unlimited supply of their own receive
addresses and one rule for using them: **one address per payer.** Because
nothing else ever pays that address, its whole balance is attributable to one
counterparty — which turns an unpartitionable commingled balance into a
**per-address quarantine unit**. Money is then held, not blocked: it sits
segregated in its own address until the member has positively established who
paid and that they are clear. Only then can it be swept into the member's
account. Anything unverified stays exactly where it is.

This is Bitcoin's model, and FairWins already implements its core rule for
Bitcoin: `spendable` is a **positive assertion**, and anything unverified,
pending, or protected is withheld rather than spent. Safe Receiver applies
that same fail-safe discipline to EVM networks.

### What this feature does and does not promise

Issue #929 asked for receive addresses that *"allow deposit from any
non-sanctioned address."* Measurement established that this is not deliverable,
and the spec is written to the truth rather than the ask (full evidence in
`research.md`):

- **A stablecoin transfer runs no code on the recipient.** A sanctioned
  holder's USDC lands unconditionally, and nothing at the receiving address can
  observe, refuse, or even later identify it. This is true of every stablecoin
  FairWins configures.
- **Putting code at a receive address makes it less payable, not more.** A
  payment sent with a bare-transfer gas limit fails against *any* contract,
  including one that does nothing. Some payers would be unable to pay at all,
  and one common payer shape loses the money silently — the payer's
  transaction succeeds and nothing arrives.

So Safe Receiver **does not block deposits, and never claims to.** It says
plainly: anyone can pay these addresses. The control it does deliver is real,
enforceable, and placed where a contract can actually act — at the moment the
member moves the money:

- **Segregation** — one payer per address, so a bad payment is isolated rather
  than mixed.
- **Positive clearance before spending** — funds are spendable only when the
  member has established who paid and screening cleared them. Uncertainty
  withholds; it never permits.
- **On-chain screening of the parties a contract can actually name** — the
  member sweeping, the destination receiving, and (where the member committed
  one) the counterparty the address was issued to. These are checked in the
  same transaction that moves the money, and a failure reverts it.

The member's own addresses are **deployed and owned by the member**; FairWins
holds no key over them, cannot move the funds, and cannot rescue them. The
member's sweep is the only exit, which is the same safety property the
platform's routers get from having no rescue function at all.

## Clarifications

### Session 2026-07-27

- Q: Deposit-time screening is impossible for stablecoins and holed for native coin. Keep the compliance claim or reframe? → A: **Reframe as segregation with spend-time control.** No deposit-screening claim is made anywhere; the on-chain guard screens named actors at sweep/spend, and clearance is a positive assertion.
- Q: What happens to the drafted "Safe Request" screened-pull spec answering the same issue? → A: **Rewrite 070 as Safe Receiver.** The screened-pull design is recorded in `research.md` as a rejected alternative with its measurements, since it is the only design that genuinely screens both parties for a stablecoin — but it cannot be paid by a plain address.
- Q: Keep the UTXO change-address mechanic? → A: **No.** Rotation and one-address-per-payer are kept; change addresses are dropped. On EVM a transfer takes an exact amount, so leaving the remainder in place is equally segregated and materially cheaper, and change addresses would imply an unlinkability this architecture does not have.
- Q: Receive addresses are publicly derivable from the owner's address, so anyone can enumerate every address a member owns. Acceptable? → A: **Yes, and disclosed plainly.** Deterministic derivation is what lets a member recover every address on a fresh device with no backend, no indexer, and no scanning. The linkability cost is stated in the UI; no privacy is implied.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Give each payer their own address (Priority: P1)

A member who takes money from more than one source — a treasurer collecting
from members, a contractor with several clients, anyone who wants to know which
payment came from whom — opens Safe Receiver and creates a receive address for
a specific payer, labelling it with that payer's name. They get an ordinary
address they can show as a QR code, copy, paste into an invoice, or hand to an
exchange withdrawal form. It costs nothing to create and works immediately.
When they need one for a different payer, they create another. Each address
shows only what that one payer sent.

**Why this priority**: Segregation is the foundation everything else rests on.
One address per payer is what makes a balance attributable at all — without it
there is no quarantine unit and no clearance decision to make. It delivers
value on its own: a member who does nothing else gets per-counterparty
bookkeeping they cannot get today.

**Independent Test**: Create three labelled receive addresses, pay each from a
different account, and verify the member sees three separate balances correctly
attributed to the three labels, with no commingling, and that each address was
payable as a plain address by an ordinary wallet with no special formatting.

**Acceptance Scenarios**:

1. **Given** a connected member on a supported network, **When** they create a
   receive address and label it with a counterparty, **Then** an address is
   produced immediately, at no cost, and is displayed as a plain copyable
   address and QR code with no special parameters or prefix.
2. **Given** a receive address, **When** an ordinary external wallet sends the
   network's native coin or a supported token to it, **Then** the funds arrive
   and appear against that address, attributed to its label.
3. **Given** several receive addresses, **When** the member views Safe
   Receiver, **Then** each address shows its own balance and label, and no
   payment appears under an address that did not receive it.
4. **Given** a member who wants a new address, **When** they create one,
   **Then** it is a different address from every address they have previously
   been issued, and no previously issued address is ever reissued.
5. **Given** a member with existing addresses, **When** they view the feature
   for the first time, **Then** it is stated plainly that anyone can pay these
   addresses and that deposits are not blocked.
6. **Given** any receive address, **When** the member views its details,
   **Then** it is disclosed that the member's addresses are publicly linkable
   to one another and to their account.

---

### User Story 2 - Nothing leaves an address until you know who paid you (Priority: P1)

Before the member can move money out of a receive address, the app establishes
who actually paid it and screens them. For token payments this is exact: the
chain records each transfer's sender, so every depositor is identified and
screened individually. For native-coin payments no such record exists, and the
app says so rather than pretending. The balance is offered as spendable **only**
when every contributing payer has been positively established and cleared.
Anything else — a payer that failed screening, a payer whose status could not
be determined, a deposit whose sender could not be established — leaves that
value withheld, visibly, with the reason given. Withheld value is never swept
by accident, and the member is never shown a "spendable" figure that includes
money they have not cleared.

**Why this priority**: This is the actual control the feature delivers. Without
it, segregation is just tidy bookkeeping. The fail-safe direction — uncertainty
withholds, never permits — is what makes the feature trustworthy, and it is the
rule the platform already applies to Bitcoin.

**Independent Test**: Pay one receive address from a clean account and another
from a deny-listed account. Verify the first shows as spendable and sweeps; the
second shows as withheld with the reason, cannot be swept, and does not appear
in any spendable total. Then make the screening source unavailable and verify
previously-cleared value becomes withheld rather than staying spendable.

**Acceptance Scenarios**:

1. **Given** a receive address paid only by cleared token depositors, **When**
   the member views it, **Then** the full balance is shown as spendable.
2. **Given** a receive address paid by a depositor who fails screening,
   **When** the member views it, **Then** that value is shown as withheld,
   the reason is stated, and it is excluded from every spendable total.
3. **Given** a receive address whose depositors' screening status cannot be
   determined, **When** the member views it, **Then** the value is withheld —
   an indeterminate result is never treated as cleared.
4. **Given** a receive address holding native coin, **When** the member views
   it, **Then** the app states that the sender of a native payment cannot be
   established from the chain, and treats the value according to the same
   fail-safe rule rather than silently clearing it.
5. **Given** any address balance, **When** it is displayed, **Then** the total
   is decomposed into its spendable and withheld parts with a reason for each
   withheld part, so a total that exceeds the spendable amount is never
   mysterious.
6. **Given** withheld value, **When** the member attempts any sweep or spend,
   **Then** the withheld portion is not moved, and the action does not silently
   move less than the member expected without saying so.
7. **Given** a failure to read balances or screening data, **When** it occurs,
   **Then** it is reported as a failure — never rendered as a zero balance or
   as a clear result.

---

### User Story 3 - Sweep cleared funds into your account (Priority: P1)

When a receive address holds cleared funds, the member sweeps them into their
main account in one action. They pay gas once, from their own account — they do
not have to fund each receive address with gas first. The transaction checks the
parties it can name — the member sweeping, the destination, and the counterparty
the address was committed to — against the on-chain sanctions guard, and reverts
in full if any of them fails. Sweeping several addresses reports a result per
address: one failure never aborts the rest.

**Why this priority**: Without a sweep the money is segregated but unusable.
This is the point at which the on-chain control actually fires, and it is the
reason the addresses are contracts rather than ordinary keys — a plain address
would have to be individually funded with gas before anything could leave it.

**Independent Test**: Sweep a cleared address and verify the funds arrive in the
member's account, that the member paid gas only once from their own account,
and that no gas had to be sent to the receive address first. Then deny-list the
member and verify the sweep reverts with nothing moved.

**Acceptance Scenarios**:

1. **Given** a receive address holding cleared funds, **When** the member
   sweeps it, **Then** the funds arrive at the member's chosen destination and
   the receive address is left holding nothing but withheld value.
2. **Given** a sweep, **When** it is performed, **Then** the member funds gas
   from their own account only, and no separate funding of the receive address
   is required.
3. **Given** a sweep where the **member** fails screening, **When** it is
   attempted, **Then** the whole transaction reverts, nothing moves, and the
   member is told screening refused it.
4. **Given** a sweep whose **destination** fails screening, **When** it is
   attempted, **Then** it reverts the same way with the destination named as
   the cause.
5. **Given** a receive address the member committed to a named counterparty on
   creation, **When** that counterparty fails screening at sweep time, **Then**
   the sweep reverts — the commitment is enforced by the chain, not just
   recorded by the app.
6. **Given** a member sweeping several addresses at once, **When** one fails,
   **Then** the others still complete and each address reports its own outcome
   with a reason for any failure.
7. **Given** a sweep of an address holding several assets, **When** it runs,
   **Then** each asset reports its own outcome and one asset's failure does not
   abort the others.
8. **Given** any sweep, **When** it completes, **Then** the receive address
   retains no residual balance of the swept asset beyond value deliberately
   withheld.

---

### User Story 4 - Spend directly from a receive address (Priority: P2)

Rather than sweeping into their account and paying onward, the member pays a
third party straight out of a receive address. The remainder stays where it is —
still segregated, still attributed to the same payer, with no extra cost. The
same clearance rule applies: only cleared value can be spent, and the
destination is screened in the same transaction.

**Why this priority**: It saves a hop and a fee for members who are passing
money through, but sweeping already makes the funds fully usable, so this is an
efficiency rather than a capability.

**Independent Test**: Spend part of a cleared receive address balance to an
external address, and verify the payee receives the exact amount, the remainder
stays in the same receive address still attributed to the original payer, and
the destination was screened.

**Acceptance Scenarios**:

1. **Given** a receive address with cleared funds, **When** the member spends
   part of it to an external address, **Then** the payee receives exactly the
   amount specified.
2. **Given** that spend, **When** it completes, **Then** the remainder stays in
   the same receive address, still labelled with the same counterparty, and no
   new address is created.
3. **Given** a spend whose destination fails screening, **When** it is
   attempted, **Then** it reverts with nothing moved and the destination named.
4. **Given** an attempt to spend more than the cleared amount, **When** it is
   made, **Then** it is refused before any signature, stating how much is
   actually spendable.

---

### User Story 5 - Recover every address on a new device (Priority: P2)

A member who reinstalls, switches device, or loses their local data opens Safe
Receiver and finds every receive address they were ever issued, with its
balance. This works with no backup, no server, and no scanning — the addresses
follow from the member's own account. Their labels come back from the member's
encrypted backup where one exists; without it the addresses and balances are
still all there, unlabelled.

**Why this priority**: Money sitting at an address the member cannot rediscover
is money lost. Recovery must not depend on anything optional. It ranks below
the core flows only because it matters on a bad day rather than every day.

**Independent Test**: Create several funded receive addresses, clear all local
application data, reconnect the same account on a fresh profile, and verify
every address and balance reappears without restoring a backup — then restore
the backup and verify labels return.

**Acceptance Scenarios**:

1. **Given** a member with issued receive addresses, **When** they connect the
   same account on a device with no local data and no backup, **Then** all
   their receive addresses and balances are recovered.
2. **Given** that recovery, **When** it runs, **Then** it requires no platform
   service, no indexer, and no address scanning.
3. **Given** a restored encrypted backup, **When** it is applied, **Then**
   counterparty labels reappear against the correct addresses.
4. **Given** no backup, **When** the member recovers, **Then** addresses are
   listed without labels and the member is told the labels are missing rather
   than shown blank entries that look like new addresses.
5. **Given** a member who knows only a receive address, **When** they enter it,
   **Then** the app can confirm whether it belongs to them and act on it.

---

### User Story 6 - Honest availability across networks (Priority: P2)

Safe Receiver states what it can do on the network the member is actually on.
Where the sanctions guard is deployed, the sweep-time screening is real and is
described as enforced. Where it is not, segregation and clearance still work but
no on-chain screening is claimed. A guard whose data source is unreachable reads
differently from a guard that is not there. No surface asserts a control the
chain will not deliver.

**Why this priority**: The constitution forbids UX implying a guarantee the
chain has not reached, and the guard exists on a minority of supported networks.
This is a release gate rather than a nice-to-have, but it is testable
independently of the mechanics.

**Independent Test**: Walk Safe Receiver on a network with an enforcing guard, a
network with no guard, and a network whose guard cannot be read, and verify each
produces distinct, accurate wording — and that no state claims enforcement it
cannot deliver.

**Acceptance Scenarios**:

1. **Given** a network where the guard is deployed and readable, **When** the
   member uses Safe Receiver, **Then** sweep-time screening is described as
   enforced on-chain.
2. **Given** a network with no guard, **When** the member uses Safe Receiver,
   **Then** segregation and clearance are still offered, and it is stated that
   on-chain screening is not available on this network — naming where it is.
3. **Given** a guard that is deployed but unreadable, **When** the member acts,
   **Then** the condition is reported as temporarily unavailable, distinct from
   not-supported, and clearance fails safe rather than clearing.
4. **Given** a network where the guard's data source is not configured, **When**
   the member uses Safe Receiver, **Then** the weaker guarantee is described in
   different terms from a fully-configured guard.
5. **Given** an unsupported network, **When** the member opens Safe Receiver,
   **Then** they get a stated reason, not a broken or empty screen.

---

### User Story 7 - Sweep without holding gas (Priority: P3)

A member whose FairWins account is a passkey account sweeps one or several
receive addresses with a single confirmation, and — where the platform sponsors
it — without holding the network's gas token at all. If sponsorship is
unavailable they can still sweep by paying their own gas; the option is never
the only way through.

**Why this priority**: It removes the last friction from collecting money, but
every member can already sweep by paying gas, so it is additive.

**Independent Test**: With a passkey account on a network where sponsorship is
available, sweep several addresses in one confirmation and verify the member
spent no gas token. Then disable sponsorship and verify the same sweep still
completes with the member paying.

**Acceptance Scenarios**:

1. **Given** a passkey member and several cleared addresses, **When** they
   sweep, **Then** one confirmation covers all of them.
2. **Given** sponsorship is available, **When** the sweep runs, **Then** the
   member spends no gas token and the confirm step says the fee is sponsored.
3. **Given** sponsorship is unavailable, **When** the member sweeps, **Then**
   the sweep still completes with the member paying, and the confirm step says
   so before they sign.
4. **Given** a batch too large to sponsor in one operation, **When** the member
   sweeps, **Then** they are told the limit and the work is split rather than
   failing opaquely.

---

### Edge Cases

- **A payer pays a receive address that was never intended for them** →
  attribution is by actual depositor where the chain records it, so the extra
  payer is identified and screened like any other; the member is shown that
  more than one party paid an address they meant for one.
- **Two payers pay the same address** → both are screened; if either fails, the
  address's value is withheld, because the balance cannot be partitioned
  between them.
- **A token arrives that the app does not recognise** → the member is told
  something arrived that the app cannot value or sweep, rather than the deposit
  being invisible.
- **Value arrives before the address has ever been used** → it is retained in
  full and is sweepable; nothing is lost by the address not yet having been
  activated on-chain.
- **Value is force-sent in a way that leaves no record** → it appears in the
  balance with no establishable sender and is therefore withheld under the
  fail-safe rule, not silently cleared.
- **The member sweeps an address whose balance changes between viewing and
  signing** → the member never sweeps more than they cleared, and a newly
  arrived unverified deposit is not swept along with cleared value.
- **A sweep is attempted twice** → the second finds nothing to move and reports
  that plainly; the member is not charged twice or shown a false success.
- **Screening data is unavailable at sweep time** → the transaction fails
  closed and the member is told the check could not be completed, not that they
  or their counterparty are sanctioned.
- **The member's own account fails screening** → they cannot sweep. This is
  stated clearly, and it does not imply their payers are at fault.
- **A receive address holds only withheld value** → it is shown with its reason
  and no sweep is offered, rather than offering an action that would do nothing.
- **The member requests very many addresses** → creation stays free and instant,
  and the balance display remains usable and honest about how much it is
  checking.
- **The member is on a network where Safe Receiver has never been deployed** →
  addresses that exist on other networks are not shown as if they exist here.
- **The same address on two networks** → balances are per network and never
  aggregated across networks in a way that implies they can be swept together.

## Requirements *(mandatory)*

### Functional Requirements

**Addresses and segregation**

- **FR-001**: Members MUST be able to create receive addresses that belong to
  them alone, at no cost and with no transaction, and use them immediately.
- **FR-002**: A receive address MUST be payable as a plain address by any
  external wallet, exchange, or service, with no FairWins-specific URI, prefix,
  parameter, or payload.
- **FR-003**: Every receive address MUST be distinct, and an address that has
  been issued MUST NEVER be reissued to a different counterparty or reused
  after being retired.
- **FR-004**: A member MUST be able to label each receive address with the
  counterparty it is intended for, and MUST be able to commit that counterparty
  in a form the sweep can enforce (FR-018).
- **FR-005**: Balances MUST be presented per receive address; the feature MUST
  NOT present a single commingled total as if it were attributable.
- **FR-006**: The member MUST be told plainly, on the feature's own surface,
  that deposits are **not** blocked and that anyone can pay these addresses.
  No surface may state or imply that deposits are screened.
- **FR-007**: The member MUST be told that their receive addresses are publicly
  linkable to each other and to their account, so no privacy is implied.

**Ownership and custody**

- **FR-008**: Receive addresses MUST be owned and controlled by the member. No
  platform key may move, freeze, redirect, or rescue their funds.
- **FR-009**: The member's own sweep or spend MUST be the only path by which
  value leaves a receive address. There MUST be no platform-callable rescue
  path; its absence is a safety property, not an omission.
- **FR-010**: No platform upgrade authority may exist over a deployed receive
  address. Improvements ship as new addresses, never by mutating an address
  already holding a member's money.
- **FR-011**: A member MUST be able to reach and sweep their funds without the
  platform's optional infrastructure — no relayer, no sponsorship service, and
  no platform-operated data store may be required.

**Clearance — the fail-safe rule**

- **FR-012**: Value MUST be spendable only when it is a **positive assertion**
  that every establishable depositor to that address has been screened and
  cleared. Absence of evidence MUST withhold, never permit.
- **FR-013**: Any depositor that fails screening, any depositor whose status is
  indeterminate, and any deposit whose sender cannot be established MUST cause
  the affected value to be withheld.
- **FR-014**: Where the chain records a deposit's sender, that sender MUST be
  the party screened for that deposit. Where it does not, the app MUST state
  that the sender cannot be established rather than substituting a guess.
- **FR-015**: A balance display MUST decompose into spendable and withheld
  parts with a stated reason for each withheld part, so that a total exceeding
  the spendable amount is always explained.
- **FR-016**: A failure to read balances or screening data MUST be reported as
  a failure. It MUST NEVER render as a zero balance, an empty address, or a
  cleared result.

**Sweep and spend — the on-chain control**

- **FR-017**: A sweep or spend MUST screen the parties the transaction can
  name — the member performing it and the destination receiving the funds —
  against the on-chain sanctions guard, in the same transaction that moves the
  funds, reverting in full on failure.
- **FR-018**: Where the member committed a counterparty to a receive address,
  the sweep MUST screen that counterparty on-chain too, so the commitment is
  enforced by the chain rather than only recorded by the app.
- **FR-019**: The screened party MUST always be an actor the transaction can
  attribute — the caller or an authenticated signer — never an inferred or
  upstream party.
- **FR-020**: Where the sanctions guard is required but not configured, the
  path MUST refuse to act rather than proceeding unscreened.
- **FR-021**: A member MUST be able to sweep without first funding the receive
  address with gas; gas is paid once, by the member, from their own account.
- **FR-022**: Sweeping multiple addresses or multiple assets MUST report a
  per-address and per-asset outcome. One failure MUST NOT abort the others.
- **FR-023**: A sweep MUST NOT move withheld value, and MUST state when it is
  moving less than the address holds.
- **FR-024**: After a spend, the remainder MUST stay in the same receive
  address, retaining its counterparty attribution. No change address is
  created.
- **FR-025**: A repeated sweep MUST NOT double-charge the member or report a
  false success when there is nothing to move.
- **FR-026**: A sweep MUST leave no residual balance of the swept asset in the
  receive address beyond value deliberately withheld.

**Recovery**

- **FR-027**: A member MUST be able to recover every receive address they were
  ever issued, and its balance, from their account alone — with no local data,
  no backup, no platform service, no indexer, and no address scanning.
- **FR-028**: Counterparty labels MUST ride the member's existing encrypted
  backup. Their absence MUST degrade to unlabelled addresses with an
  explanation, never to missing addresses.
- **FR-029**: A member MUST be able to identify whether a given address belongs
  to them and act on it directly.
- **FR-030**: The address a member has already published MUST NOT change
  meaning or move as a result of any later platform change.

**Availability and disclosure**

- **FR-031**: On networks where the sanctions guard is deployed and readable,
  sweep-time screening MUST be described as enforced on-chain. Where it is not
  deployed, segregation and clearance MUST still function and the absence of
  on-chain screening MUST be stated, naming where it is available.
- **FR-032**: A guard that is deployed but unreadable MUST be reported as
  temporarily unavailable, distinct from not-supported, and MUST cause
  clearance to fail safe.
- **FR-033**: A guard with no sanctions data source configured MUST NOT be
  described in the same terms as a fully-configured one.
- **FR-034**: An unsupported network MUST produce a stated reason, never a
  broken, empty, or silently inert surface.
- **FR-035**: Balances and addresses MUST be scoped to their network and MUST
  NOT be aggregated across networks in a way that implies a single sweep.
- **FR-036**: Where a fee is charged it MUST come from the platform's single
  fee source of truth, be disclosed before signature, and honour the member's
  agreed maximum. At launch the rate is zero (see Assumptions).
- **FR-037**: Where gas sponsorship is used, the confirm step MUST say whether
  the fee is sponsored or member-paid, and MUST NOT claim sponsorship unless
  the submission actually returned sponsored.
- **FR-038**: New surfaces MUST meet the project's accessibility bar.

### Key Entities

- **Safe Receiver**: A member's receiving capability on a network — the root
  from which all their receive addresses follow, owned by the member.
- **Receive Address**: One address issued to one counterparty. Payable by
  anyone as a plain address, holds value in isolation from every other receive
  address, and is swept or spent only by its owner.
- **Counterparty Attribution**: The link between a receive address and the
  payer it was issued to — a member-authored label, optionally committed in a
  form the chain enforces at sweep time.
- **Deposit**: Value that arrived at a receive address, with its sender where
  the chain records one, and its screening outcome.
- **Clearance**: The per-address, per-asset determination of how much value is
  spendable — a positive assertion, with every withheld portion carrying a
  reason.
- **Sweep Outcome**: The per-address, per-asset result of a sweep or spend,
  including its reason on failure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create a labelled receive address in under 10
  seconds, with no transaction and no gas.
- **SC-002**: 100% of receive addresses are payable by an ordinary external
  wallet using only the plain address, with no special formatting.
- **SC-003**: Zero payments are ever attributed to a receive address that did
  not receive them.
- **SC-004**: Zero receive addresses are ever issued twice or reissued after
  retirement.
- **SC-005**: 100% of value from a depositor who fails screening, whose status
  is indeterminate, or whose identity cannot be established is withheld from
  the spendable total.
- **SC-006**: Zero instances of withheld value being swept or spent.
- **SC-007**: Every withheld amount shown to a member carries a stated reason,
  100% of the time.
- **SC-008**: Zero instances of a read failure being rendered as a zero
  balance, an empty address list, or a cleared screening result.
- **SC-009**: 100% of sweeps and spends where the member, the destination, or a
  committed counterparty fails screening revert with no value moved.
- **SC-010**: 100% of sweeps are completed without the member first sending gas
  to the receive address.
- **SC-011**: In a multi-address or multi-asset sweep, one failure never
  prevents the remaining outcomes from completing; every item reports its own
  result.
- **SC-012**: 100% of receive addresses and balances are recovered on a device
  with no local data and no backup, using only the member's account, with zero
  calls to any platform service.
- **SC-013**: Zero published receive addresses change or become unrecoverable
  as a result of any later platform change.
- **SC-014**: On every supported network, the stated screening capability
  matches the network's actual capability — verified by walking all supported
  networks including those with no guard.
- **SC-015**: Zero surfaces state or imply that deposits are screened or
  blocked.
- **SC-016**: Zero member funds are ever movable by any platform-held key.
- **SC-017**: New surfaces pass the project's accessibility bar in CI with no
  new violations.
- **SC-018**: The contracts introduced by this feature pass the project's
  smart-contract security review and coverage gates with no unaccepted high or
  critical findings.

## Assumptions

- **Segregation is the product; screening is a control applied at spend time.**
  The feature makes no deposit-screening claim anywhere, because measurement
  established that claim cannot be honoured (`research.md`).
- **One address per payer is a convention the member follows, not a rule the
  chain enforces.** Anyone can pay any address. The app surfaces when more than
  one party paid an address so the member knows their convention was broken.
- **Depositor attribution is exact for tokens and unavailable for native
  coin.** Token transfers are recorded with their sender; plain native transfers
  are not. The fail-safe rule covers the gap rather than a guess covering it.
- **Screening semantics come from spec 007 unchanged** — deny-list first,
  fail-closed on an unreachable data source, deny-list-only when no data source
  is configured. This feature consumes that behaviour and does not redefine it.
- **The guard's fail-closed behaviour is inherited deliberately.** An
  unreachable data source withholds rather than clears, consistent with the
  fail-safe rule.
- **Receive addresses are contracts rather than plain keys** for one decisive
  reason: value cannot leave a plain address until that address itself holds
  gas, which would force the member to fund every address before collecting
  from it. Contracts let the member pay gas once, from their own account.
  Alternatives are recorded in `research.md`.
- **Addresses derive deterministically from the member's account**, which is
  what makes backend-free recovery possible and what makes them publicly
  linkable. Both consequences are accepted and disclosed.
- **No platform fee at launch.** The rate is zero, so members see no fee line.
- **Sponsorship is optional everywhere.** Every flow works with the member
  paying their own gas.
- **Labels and attribution are client-side**, riding the member's existing
  encrypted backup; nothing about a counterparty is stored on a platform
  server.
- **Non-EVM networks are out of scope.** Bitcoin already has this model
  natively.
- **The ordinary Pay and Request flows are unchanged.** Safe Receiver is an
  additional way to receive, not a replacement for the existing one.

## Out of Scope

- **Blocking or screening deposits.** Not deliverable; not claimed. See
  `research.md` for the measurements.
- **Change addresses.** Rotation and per-payer segregation are kept; moving a
  spend's remainder to a fresh address is dropped — it costs more and buys no
  unlinkability on EVM.
- **Unlinkable receive addresses.** Deterministic derivation is chosen for
  backend-free recovery; secret-salt derivation would break it.
- **A screened-pull payment path** (payer signs an authorisation so both
  parties are screened atomically). It is the only design that genuinely
  screens a stablecoin payment both ways, but it cannot be paid by a plain
  address, so it does not serve this feature. Recorded in `research.md` as a
  rejected alternative and available as future work.
- **Retroactive analysis of payments received before this feature.**
- **Automated de-mixing of a shared receive address.** An address paid by
  several parties is withheld as a unit; the feature does not attempt to split
  a fungible balance between payers.
- **Non-EVM networks.**
- **Platform-operated indexing.** Discovery is derivation plus on-chain reads.

## Dependencies

- **Spec 007 (compliance gating)** — the on-chain sanctions guard, its
  interface, fail-closed semantics, and per-network deployment. Extended, not
  modified.
- **Spec 043 / 068 (Protect custody)** — the member-deploys-and-owns pattern,
  the address-preview-before-signing pattern, per-instance failure isolation,
  and strict per-chain identity.
- **Spec 061 (Bitcoin)** — the rotation, positive-clearance and explained-
  balance rules this feature ports to EVM.
- **Spec 062 (legacy recovery)** — the per-asset sweep-outcome pattern.
- **Spec 041 / 050 (passkey accounts, sponsored operations)** — the optional
  one-confirmation, gas-free sweep.
- **Spec 032 (encrypted backup)** — where counterparty labels persist.
- **Spec 060 (platform fees)** — the single source of truth for any fee (zero
  at launch).
- **The project constitution** — security-first contracts, test-first coverage,
  honest state, fail-loudly CI, accessible frontend.
