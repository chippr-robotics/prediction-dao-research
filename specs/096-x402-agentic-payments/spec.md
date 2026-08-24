# Feature Specification: x402 — Pay-Per-Request Access to the Member API

**Feature Branch**: `claude/openapi-agentic-chat-7cv5re` (spec directory `096-x402-agentic-payments`)

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "An AI agent that is not a FairWins member should be able to use the
member API by paying for each request, the way the x402 protocol describes: the request is answered
with a price, the agent pays in USDC, and the request is served. Members must not be charged. The
platform must not become a custodian to do it."

## Overview

The member API (spec 095) has exactly one door: a capability token a **paid member** signed. That is
the right door for a member's own tools, and the wrong shape for the caller this feature is about —
an autonomous agent that wants one answer, has no FairWins account, and has no member standing
behind it to buy a membership on its behalf. Today that caller is refused. The refusal is honest, and
it is also the whole of what we can offer somebody willing to pay a tenth of a cent for a read.

This feature adds a **second door on the same rooms**: the priced operations of the member API also
accept a **per-request payment**, using the [x402](https://x402.org) protocol. The exchange is
entirely in the open:

1. The agent calls a priced operation with no credential. The service answers **HTTP 402** with a
   machine-readable statement of what it would accept — an amount, an asset, a recipient, a network,
   and the deadline inside which a payment is valid.
2. The agent **signs a payment authorisation** for one of those offers with its own key, and repeats
   the request carrying it.
3. The service **verifies** the authorisation, screens the payer, **settles** it through the
   platform's existing relay engine, and serves the request **as the payer's own account**.

Three properties decide whether this is a good idea or a bad one, and all three are requirements
rather than implementation notes.

**A member is never charged.** The capability token is checked first. A request carrying a valid
token is served exactly as it is served today — same code, same reads, no price, no 402, no payment
path entered at all. Pay-per-request *substitutes* for membership; it never taxes it.

**The platform does not become a custodian.** Nothing is escrowed, nothing is held, and no key is
added. The payer signs a transfer from their own account to the platform treasury, and the platform
submits that signed instruction the way it already submits every other member-signed instruction.
There is no balance to top up, no account to open, and no refundable float — because there is no
moment at which the platform holds the payer's money on the payer's behalf.

**Paying buys an answer, not an identity.** A settled payment authorises exactly the one request it
came with. The payer is sanctions-screened, fail-closed, like every other caller. Any typed data
built on the paid rail names the **payer** as the actor, exactly as the token rail names the token's
account — so a payment can no more act as somebody else than a token can.

No contract changes. Settlement moves an already-deployed USDC token with an already-deployed
mechanism (EIP-3009), submitted through the already-deployed relay engine. This spec exists because
the work **touches funds**, and the constitution forbids skipping a spec for anything that does.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An agent with no account pays for one answer (Priority: P1)

An autonomous agent wants the live platform fee rates. It calls the endpoint with no credential and
receives a `402` naming the price, the token to pay in, the address to pay, and the chain. It signs a
transfer authorisation for that exact amount, repeats the call with the authorisation attached, and
receives the data. The answer tells it what was paid and on what transaction, and says plainly that
the transaction has been broadcast rather than confirmed.

**Why this priority**: this is the feature. Everything else in the spec exists to make this exchange
safe, honest, or stoppable.

**Independent Test**: with the rail enabled and a funded test account, call a priced operation with
no credential and confirm a well-formed 402; sign the offer; repeat the call with the payment;
confirm the data is served, that the settlement is reported, and that the payer's balance moved by
exactly the offered amount and no more.

**Acceptance Scenarios**:

1. **Given** the rail is enabled and an operation is priced, **When** an unauthenticated request
   arrives, **Then** it is answered `402` with a machine-readable offer naming the amount, asset,
   recipient, network and validity window — not a bare denial.
2. **Given** a valid payment authorisation matching the offer, **When** the request is repeated with
   it, **Then** the payment is verified, settled, and the operation is served **once**.
3. **Given** a served paid request, **When** the response is read, **Then** it carries the settlement
   — the transaction, the network, the payer and the amount — and states that submission is
   broadcast, not finality.
4. **Given** a paid request that builds typed data, **When** the payload is inspected, **Then** its
   acting party is the **payer's** address and cannot be set from the request body.
5. **Given** an operation the deployment has not priced, **When** an unauthenticated request arrives,
   **Then** it is refused exactly as it is today — never a 402 for something that is not for sale.

---

### User Story 2 - A member's agent rides free, exactly as before (Priority: P1)

A member's own script holds a capability token. Nothing about it changes: no price, no 402, no
payment header, no new failure mode, and no new latency beyond what it already pays for
authentication.

**Why this priority**: the feature is only acceptable if it is invisible to everyone who already
paid. A paid rail that leaks onto the membership rail is a platform that charged its members twice.

**Independent Test**: with the rail enabled and every operation priced, drive the full spec-095
authenticated suite unchanged and confirm identical statuses and bodies, and that no request carrying
a valid token ever reaches the payment path.

**Acceptance Scenarios**:

1. **Given** a request with a valid capability token, **When** it is served, **Then** no price is
   quoted, no payment is required, and the response is byte-identical to the pre-feature response.
2. **Given** a request with a valid token **and** a payment attached, **When** it is served, **Then**
   the member is not charged — a token holder cannot be billed by accident or by malice.
3. **Given** a request with an expired or revoked token on a **priced** operation, **When** it is
   refused, **Then** the refusal names the token problem; where the deployment prices that operation
   the answer may also carry the offer, and it never reports "you must pay" as the reason a token
   was rejected.
4. **Given** the rail is disabled, **When** any request arrives, **Then** the member API behaves
   exactly as it did before this feature existed.

---

### User Story 3 - A refused payment costs nothing and says why (Priority: P1)

An agent attaches a payment that is malformed, expired, addressed to the wrong recipient, short of
the price, or already spent. The request is refused with a reason it can act on, its money is not
taken, and no data is served.

**Why this priority**: this is where a payment rail hurts people. A caller that is charged and not
served, or served and not charged, or told "invalid" with no way to tell which of six things was
wrong, has no way to recover.

**Independent Test**: submit each malformed payment in turn and confirm a distinct machine-readable
reason; confirm the payer's balance is unchanged in every case; confirm no data is present in any of
those responses.

**Acceptance Scenarios**:

1. **Given** a payment that fails any check, **When** it is refused, **Then** the reason is distinct
   and machine-readable, and the offer is restated so the agent can correct and retry.
2. **Given** a payment that fails any check, **When** the payer's account is examined, **Then**
   nothing was taken. Verification precedes settlement; a payment that is not accepted is never
   submitted.
3. **Given** a payment for less than the price, **When** it is refused, **Then** the refusal says so
   rather than serving a partial or degraded answer.
4. **Given** the settlement path is unavailable, **When** a valid payment arrives, **Then** the
   request is refused as temporarily unavailable — **not** served for free, and not settled into a
   void. The payer is not charged and knows to retry.
5. **Given** a payment authorisation that was already used, **When** it is presented again, **Then**
   it is refused as already spent, and the answer says honestly what that check can and cannot
   guarantee across a service restart.

---

### User Story 4 - An operator turns it on, prices it, and can stop it (Priority: P2)

An operator enables the rail on one chain, sets a treasury address and a price per class of
operation, and can see at a glance from the public status surface whether it is on and what it
charges. When something goes wrong they can stop **offering** payment without stopping the member
API, and stop **taking** payment without leaving anyone half-paid.

**Why this priority**: a money-taking feature that cannot be switched off in an incident is not
shippable. It ranks below the exchange itself only because there is nothing to operate until the
exchange exists.

**Independent Test**: bring the module up with no treasury configured and confirm the service refuses
to start it rather than defaulting one; set a price to zero and confirm that operation class is not
offered at all; toggle the killswitch and confirm the member API keeps serving members.

**Acceptance Scenarios**:

1. **Given** the rail is enabled with no recipient configured, **When** the service starts, **Then**
   it fails loudly and names what is missing — it never invents a destination for other people's
   money.
2. **Given** an operation class priced at zero, **When** an unauthenticated request arrives, **Then**
   no offer is made and the request is refused exactly as it is today.
3. **Given** the public status surface, **When** it is read, **Then** it states whether the rail is
   enabled, on which network, and what each class costs — and reveals nothing about the treasury
   beyond the address that is already public in every offer.
4. **Given** the rail's killswitch is on, **When** requests arrive, **Then** no new offers are made
   and no payments are taken, while member-authenticated traffic is unaffected.

---

### User Story 5 - An MCP-connected agent discovers the price and settles it itself (Priority: P3)

An agent connected through the FairWins MCP server calls a tool it has no token for. It is told the
price in full, along with the fact that the MCP server itself holds no key and cannot pay. The agent
signs the payment with its own key, calls the same tool again with the payment attached, and gets the
data plus the receipt.

**Why this priority**: the MCP server is the reference agent client, and it is where "the agent pays,
never the intermediary" has to be visibly true. It ships after the rail it consumes.

**Independent Test**: drive an MCP tool call against a priced operation with no token, confirm the
full offer is in the tool result along with the "this server cannot pay" statement, then repeat the
call with a payment and confirm the data and the receipt.

**Acceptance Scenarios**:

1. **Given** a priced operation and no token, **When** an agent calls the tool, **Then** the result
   carries the complete offer and states that this server cannot pay and holds no key.
2. **Given** an agent-supplied payment, **When** the tool is called again, **Then** the payment is
   forwarded **unaltered** and the settlement receipt is returned to the caller.
3. **Given** a priced answer, **When** the agent reads the tool result, **Then** it can tell a price
   from an outage — a 402 is never presented as a failed read.
4. **Given** a transport with no per-call channel for a payment, **When** an agent is told about the
   paid rail, **Then** the limitation is stated rather than approximated with configuration.

---

### Edge Cases

- **A valid token and a payment arrive together**: the token wins and nothing is charged. Anything
  else would let a third party attach a payment to a member's request and bill somebody who was
  entitled to the answer for free.
- **A contract-account agent (smart account / passkey)**: not supported on the paid rail in this
  version, and refused with a reason that says so. The payment authorisation is verified by the
  **token contract**, whose EIP-3009 implementation accepts an ordinary signature; a payer that
  cannot produce one has to use the membership rail. Stating the limit is required; silently
  refusing such payers as "invalid" is not acceptable.
- **The settlement path is down**: the request is refused as unavailable. It is never served free
  (that would make an outage a discount), and never settled optimistically.
- **Settlement is accepted but the chain has not confirmed it**: every surface says **broadcast**,
  not settled-and-final. This matches the platform's existing relay posture and is the only honest
  thing to say at that moment.
- **The same payment authorisation is replayed**: refused. The service's own memory of spent
  authorisations does not survive a restart, and the durable uniqueness is the token contract's own
  authorisation state — a replay that got past the service would be rejected on chain. Both facts
  are stated rather than one implied.
- **A payment sits within its validity window but so close to the end that settlement could expire
  in flight**: refused as too near expiry, so the payer is not charged for a race.
- **The payer is sanctioned, or screening cannot answer**: refused, fail closed, with those two
  outcomes distinguishable — exactly as on the membership rail.
- **A priced operation on a chain with no payment token**: not offered there. An offer naming an
  asset that does not exist on the named network is worse than no offer.
- **Discovery and key management are never priced**: the API's own description, and the routes a
  member uses to withdraw a key, are always free. Charging for the contract, or for revocation,
  would make the price a barrier to understanding the price and to stopping a compromise.
- **A testnet deployment**: prices are configured per environment and the offer names its network.
  A payment for one network is never accepted on another.

## Requirements *(mandatory)*

### Functional Requirements

**Offer and price**

- **FR-001**: An unauthenticated request to a **priced** operation MUST be answered with HTTP `402`
  and a machine-readable statement of what would be accepted: the amount in the asset's own base
  units, the asset, the recipient, the network, the validity window the service will honour, and the
  information the payer needs to construct the authorisation. It MUST NOT be a bare denial.
- **FR-002**: A price of zero for an operation class MUST mean that class is **not offered** on the
  paid rail. An unpriced operation MUST be refused exactly as it is refused today, never with a 402.
- **FR-003**: Some operations MUST NEVER be priced, at any configuration: the API's own published
  description (a client must be able to read what something costs before deciding to pay for it);
  the operation by which a member withdraws a key (the single worst place on the API for a price);
  and every operation that answers a question **about a credential or a membership** — a paid caller
  presented neither, so pricing those would mean inventing an identity for a caller who has none.
  What may be priced is the data and the work.
- **FR-004**: Prices, the recipient, the network and the enabled state MUST be operator
  configuration, and the public status surface MUST report them. It MUST NOT report the treasury's
  balance or any other fact about platform funds.
- **FR-005**: The rail MUST be off by default, MUST be individually killable without affecting
  member-authenticated traffic, and MUST refuse to start when enabled without a recipient — a default
  recipient MUST NOT exist, because a wrong default sends other people's money somewhere.

**Never charging a member**

- **FR-006**: A request carrying a **valid** capability token MUST be served on the membership rail
  and MUST NOT be priced, offered, or charged — including when a payment is also attached.
- **FR-007**: With the rail disabled, every member API behaviour MUST be exactly what it was before
  this feature, including status codes, bodies and error codes.

**Verification, in order, before any money moves**

- **FR-008**: A presented payment MUST be verified **completely before settlement is attempted**, so
  that a payment which cannot be accepted is never submitted and costs the payer nothing.
- **FR-009**: Verification MUST check, each with its own machine-readable reason: that the payment
  parses; that it matches the offer it claims (scheme, network, asset, recipient); that it covers the
  price; that it is inside its validity window with enough margin left to settle; that its signature
  is the payer's own; that the payer passes sanctions screening; that the authorisation has not
  already been spent; and that the payer can actually pay it.
- **FR-010**: The payer MUST be screened against the platform's sanctions source, failing **closed**,
  with "matched" and "could not be checked" distinguishable — the same discipline the membership rail
  uses.
- **FR-011**: Replay protection MUST be enforced by the service **and** MUST be described honestly:
  the service's own record is best-effort and does not survive a restart, and the durable guarantee
  is the payment token's own record of spent authorisations. No surface may claim more than that.
- **FR-012**: Contract-account payers MUST be refused with a reason that **names the limitation in
  words** — that this rail accepts externally-owned signatures only, and where the caller can go
  instead. A bare "invalid signature" with no explanation is not acceptable: it tells a payer who
  signed correctly for a scheme this rail does not take that they signed wrong.
- **FR-012a**: A payment MUST NOT be offered in place of an outcome that is not the caller's to fix.
  Specifically: never in place of a state the service could not establish (an unreadable membership,
  an unverifiable signature, an unavailable screening source), never in place of a sanctions refusal,
  never in place of an under-scoped credential, and never in place of a rate limit. Offering a price
  for any of those would be charging for the platform's own outage, or selling the thing screening
  exists to refuse.

**Settlement**

- **FR-013**: Settlement MUST reuse the platform's existing relay submission path. The service MUST
  NOT gain a signing key, a second submission pipeline, or custody of the payer's funds at any point.
- **FR-014**: The request MUST be served only after settlement has been **accepted for submission**,
  and every surface reporting it MUST say that acceptance is **broadcast, not finality**.
- **FR-015**: If settlement cannot be attempted, the request MUST be refused as temporarily
  unavailable. It MUST NOT be served free, and the payer MUST NOT be charged.
- **FR-016**: A successful paid response MUST carry the settlement — at minimum the transaction, the
  network, the payer and the amount — so the payer can verify independently what it was charged.

**What a payment buys**

- **FR-017**: A settled payment MUST authorise exactly the one operation it accompanied. It MUST NOT
  create a session, a credit, a balance, or any standing entitlement.
- **FR-018**: A paid request MUST be served **as the payer's own account**, and any typed data built
  on it MUST name the payer as the acting party, never a value taken from the request body.
- **FR-019**: The paid rail MUST NOT widen the API's capabilities. It reaches the same read, quote
  and build operations the membership rail reaches, and no scope that moves value exists on either.

**Disclosure and records**

- **FR-020**: The published API description MUST document the priced operations, the 402 answer and
  the payment and receipt exchange, so an agent can implement against the contract without reading
  this repository.
- **FR-021**: A payment signature and a payment authorisation identifier MUST NEVER be logged or
  written to an audit record. Operational records MUST carry the operation, the payer, the amount and
  the settlement transaction only.
- **FR-022**: An intermediary that forwards payments on an agent's behalf (the platform's MCP server)
  MUST state that it holds no key and cannot pay, MUST forward a payment unaltered, and MUST return
  the receipt to whoever paid.
- **FR-023**: Documentation MUST describe the rail, its configuration, and its incident controls,
  including the distinction between stopping the offering of payment and stopping the taking of it.

### Key Entities

- **Payment requirement (the offer)**: what the service would accept for one operation — amount,
  asset, recipient, network, validity ceiling, and the payer-facing detail needed to sign. Public by
  construction: it is sent to an unauthenticated caller.
- **Payment authorisation (the payload)**: the payer's signed instruction to move exactly that amount
  from their account to the named recipient inside a stated window, plus the one-time identifier that
  makes it unrepeatable.
- **Settlement receipt**: what the service reports after submitting the authorisation — transaction,
  network, payer, amount. A statement about a broadcast, never about finality.
- **Operation class**: the unit prices are set on — reads, typed-data builds, assistant turns. Not
  per-endpoint, so a new read endpoint inherits an agreed price rather than shipping unpriced or
  arbitrarily priced.
- **Spent-authorisation record**: the service's best-effort memory of authorisations already used,
  explicitly weaker than the token's own on-chain record and described that way everywhere.
- **Rail configuration**: enabled, killswitch, network, recipient, per-class prices, and the timing
  margins the service will honour.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An agent holding no FairWins credential can obtain a priced answer end to end — offer,
  payment, settlement, data — with no account, no onboarding step and no communication with the
  platform outside the two HTTP requests.
- **SC-002**: With every operation priced and the rail enabled, the complete spec-095 authenticated
  test suite passes unchanged, and no member-authenticated request enters the payment path in 100% of
  cases.
- **SC-003**: Every payment refusal is distinguishable by its own reason code — malformed, offer
  mismatch, underpaid, outside the window, too near expiry, bad signature, contract account,
  sanctioned, screening unavailable, already spent, insufficient funds, settlement unavailable — and
  in every one of those cases the payer's balance is unchanged and no data is served.
- **SC-004**: No configuration, code path or operator action causes the service to hold a payer's
  funds, or to sign anything with a platform key, at any point in the exchange.
- **SC-005**: Disabling the rail restores the exact pre-feature behaviour of every member API path,
  verified by the same suite passing with the rail off.
- **SC-006**: The published API description documents every priced operation, the 402 answer and the
  payment exchange, and is generated from the same constants the service enforces.
- **SC-007**: A paid request that builds typed data names the payer as the acting party in 100% of
  cases, with no request field able to override it.
- **SC-008**: No log line, audit record or response body anywhere in the feature contains a payment
  signature or an authorisation identifier.
- **SC-009**: An agent connected over MCP receives the complete offer, together with the statement
  that the intermediary cannot pay, and can complete the payment itself.
- **SC-010**: An operator can stop the rail without stopping the member API, and can start it only
  with an explicitly configured recipient.

## Assumptions

- **The payment asset is the platform's existing stablecoin on a chain that already supports
  member-signed transfers.** This feature adds no token, no contract and no deployment; it uses the
  mechanism the platform's gasless payment intents already use, on a chain where that mechanism is
  already known to work.
- **Settlement reuses the existing relay engine.** The platform already submits member-signed
  instructions through it; a payment is one more such instruction. A second submission path would
  double the policy surface deciding what gets broadcast.
- **Best-effort replay protection is acceptable because the durable guarantee is on chain.** The
  service is stateless and single-instance (the same constraint that shaped spec 095's revocation
  register); the token contract's own record of spent authorisations is what actually makes a payment
  unrepeatable. This is stated everywhere rather than papered over.
- **Externally-owned payers only, in this version.** The paid caller is an autonomous agent, which in
  practice holds an ordinary key. Contract-account support is a separate decision with its own
  verification story, and is refused with a stated reason rather than half-supported.
- **Prices are operator configuration, not a market.** There is no bidding, no dynamic pricing and no
  negotiation. An operation class has a price or is not for sale.
- **This is not a fee on members.** Nothing here changes what a member pays for anything, and the
  platform fee router is untouched — a per-request charge to a non-member for API access is not a
  platform fee on a member transaction.
- **No contract changes.** The USDC token, its EIP-3009 entry point and the relay engine are all
  already deployed. No Solidity is added, changed or redeployed, and no storage layout moves.
