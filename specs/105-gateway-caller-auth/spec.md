# Feature Specification: Gateway Caller Authentication and Abuse Prevention

**Feature Branch**: `spec/105-gateway-caller-auth`

**Created**: 2026-09-04

**Status**: Draft

**Input**: User description: "Our current api end points need a safer deployment and call pattern to avoid exposure of the keys. We can deploy an appliance in GCP to manage the routing from behind a fairwins domain in order to protect the secrets. The app and api keys need to be validated to prevent abuse of the system or other apps piggybacking as the FairWins app."

---

## Context: What This Feature Is And Is Not

The platform's third-party credentials are already server-side and already behind a FairWins domain. The
routing appliance the request describes **exists**: Cloudflare fronts `*.fairwins.app`, terminates at
static-IP GCE origins, and the relay-gateway holds every upstream credential, delivered from Secret
Manager. Pinata's write credential is injected at the SPA's own edge, and the production build **fails**
if it is ever set as a client variable.

What does not exist is any answer to the question **"who is calling?"**

The `X-Origin-Auth` origin lock proves only that a request *transited Cloudflare*. The Transform Rule
injects that header zone-wide, so an outsider's request receives it exactly as the FairWins app does. It
is a real and valuable control — it defeats origin-IP bypass — but it is not caller authentication and
was never intended as one. Browser-side CORS is likewise not a server-side control: a script, a server,
or a native client ignores it. Existing quotas are keyed on IP or on an address the *caller supplies*,
and both rotate for free.

Consequently any third party can direct traffic at the platform's proxy routes and spend FairWins'
upstream credentials, rate limits, and commercial relationships at FairWins' cost.

**Therefore this feature is about caller identity and metering, not about routing or secret storage.**
Two things are explicitly **out of scope** because they are already solved and adding them would cost
real money and close nothing:

- **A second/new GCP routing appliance.** Another proxy adds a network hop, an operational surface, and
  a second home for every credential, while leaving the caller just as anonymous.
- **Moving credentials out of the client bundle.** Already done. The values that remain in the bundle
  (wallet-connect project identifier, gateway base URLs, public RPC defaults) are public-safe by design.

### Honesty constraint (binding on every requirement below)

**A web application cannot cryptographically prove its identity to a server.** Anything the app can
send, a member can read out of the shipped bundle and replay. Any requirement, control, log line, or
operator dashboard that implied otherwise would be stating something untrue, which the project
constitution forbids.

Three *different* and individually achievable assurances replace that impossible one, and this spec
requires each surface to be explicit about which one it actually obtained:

| Assurance | What it proves | Where it is obtainable |
|---|---|---|
| **Proof of human** | A real person on a real device, not automation | Any browser, via an interactive challenge |
| **Proof of member** | A specific account signed for this session, revocably | Any client, via the existing member capability grant |
| **Proof of app** | This exact signed application binary | **Native shells only** — hardware-rooted device attestation |

No surface may claim proof-of-app on the web.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor who has not connected a wallet still browses freely (Priority: P1)

Someone arrives at the platform with no wallet, no account, and no intention of connecting one yet. They
browse prediction markets, look at collectible listings, and read perpetuals market data. Everything
loads. They are never asked to sign anything, never shown a login wall, and — in the overwhelmingly
common case — never see a challenge at all.

**Why this priority**: This is the discovery funnel. A wall here converts an abuse-prevention feature
into a growth regression, which is a worse outcome than the abuse it prevents. It is P1 because it is
the constraint every other story must not break.

**Independent Test**: With no wallet connected and no stored credential of any kind, load each read
surface and confirm real data renders. Then confirm the same surfaces still render on a repeat visit
without a second challenge.

**Acceptance Scenarios**:

1. **Given** a first-time visitor with no wallet, **When** they open the market, listing, and perpetuals
   surfaces, **Then** live data renders and no signature or sign-in is requested.
2. **Given** that visitor returns within the credential's lifetime, **When** they browse again,
   **Then** no new challenge is presented.
3. **Given** the challenge service is unreachable, **When** the visitor browses, **Then** read surfaces
   still serve and the visitor is never shown a failure — an unreachable challenge service is not
   evidence of a hostile caller and must never be presented as one.

---

### User Story 2 - Actions that sign or spend require a member, and say so (Priority: P1)

A member wants to place an order that will be signed with the platform's commercial trading credentials,
or broadcast a Bitcoin transaction, or list an item for sale. These operations cost the platform money,
consume a commercial relationship, or emit something irreversible. Each one now requires proof that a
real member authorised this session, and the app asks for that authorisation once, in plain language,
before the operation rather than failing in the middle of it.

**Why this priority**: These are the routes where piggybacking is not merely expensive but
reputationally dangerous — a third party abusing the platform's trading-venue credentials risks
termination of that relationship for everyone.

**Independent Test**: Call each signing/spending route with no member credential and confirm a clear,
actionable refusal. Authorise a session, repeat, and confirm success. Confirm the self-submit path
remains available throughout.

**Acceptance Scenarios**:

1. **Given** a caller with no member credential, **When** they invoke a signing or spending operation,
   **Then** it is refused with a reason naming what is required and how to obtain it.
2. **Given** a member who has authorised a session, **When** they invoke the same operation, **Then** it
   proceeds and is metered against **their account**, never against a value they supplied in the request.
3. **Given** a member whose authorisation cannot be *verified* because a dependency is unreachable,
   **When** they invoke the operation, **Then** the answer is an explicitly retryable temporary failure
   — **never** a denial. An unverifiable credential is not an invalid one.
4. **Given** any refusal or outage of this feature whatsoever, **When** the member chooses to proceed
   independently, **Then** the self-submit path remains available and no member value is ever trapped.

---

### User Story 3 - An operator sees abuse and can stop it without a deploy (Priority: P2)

An operator notices upstream spend climbing. They can see which routes, which assurance tier, and which
upstream the traffic is hitting; they can tighten a limit or disable a route immediately; and they can
tell the difference between "this upstream is being abused", "this upstream is not configured", and
"we cannot currently read this upstream".

**Why this priority**: Detection and a same-minute response bound the damage of anything the preventive
layers miss. It is P2 because it mitigates rather than prevents.

**Independent Test**: Drive synthetic traffic at a metered route, confirm it is attributed correctly by
tier and upstream, exercise the disable control, and confirm traffic stops without a redeploy.

**Acceptance Scenarios**:

1. **Given** traffic across all three assurance tiers, **When** an operator inspects usage, **Then**
   each route's consumption is attributed to the tier that authorised it.
2. **Given** an upstream whose usage cannot be read, **When** it is displayed, **Then** it reports
   *unreadable* — **never** zero, and never counted into a total without that total being marked
   partial and naming what is missing.
3. **Given** an upstream that is deliberately not configured, **When** it is displayed, **Then** it
   reports *not configured*, which is distinct from both zero and unreadable and raises no alert.
4. **Given** an abuse burst, **When** it exceeds the configured ceiling for that upstream, **Then**
   further calls to that upstream are refused **before** reaching it, bounding the spend.

---

### User Story 4 - An operator cannot accidentally publish an unrestricted endpoint (Priority: P2)

An operator wires a keyed RPC endpoint into the client build to get better rate limits. The endpoint's
credential sits in the URL, so publishing it is publishing the credential; the only thing standing
between that and abuse is a usage restriction configured at the vendor. Today nothing checks that the
restriction exists — an unrestricted archive endpoint pasted into the same slot would ship to every
visitor with no gate firing.

**Why this priority**: Low likelihood, high consequence, and cheap to close. The existing tooling
already verifies these endpoints answer for the *right chain*; it simply has no notion of restriction.

**Independent Test**: Attempt a client build configured with an endpoint that has no usage restriction
and confirm the build refuses or emits a blocking finding.

**Acceptance Scenarios**:

1. **Given** a keyed endpoint with no verifiable usage restriction, **When** a production client build
   is attempted with it, **Then** the build fails loudly and names the endpoint.
2. **Given** a keyed endpoint whose restriction is verified, **When** the same build runs, **Then** it
   succeeds and records which endpoints were published and under what restriction.
3. **Given** a restriction that cannot be checked because the vendor is unreachable, **When** the build
   runs, **Then** it fails as *unverified* — the unverifiable case must not silently pass, because the
   consequence of a false pass is a published credential.

---

### Edge Cases

- **The challenge service is down.** Read surfaces continue to serve. Degradation favours availability
  because these routes are cheap and cached; the expensive routes are protected by member proof, which
  is independent of the challenge service.
- **The membership source is unreachable.** Authorisation is *unverifiable*, which is a retryable
  temporary condition, never a denial and never an assumption of zero entitlement.
- **A member's authorisation expires mid-session.** The app re-requests it before the next protected
  operation rather than failing the operation.
- **A credential is replayed from another origin.** Accepted if it verifies — the platform must not
  pretend origin is authentication. Containment is that the credential is short-lived, bound to an
  account, revocable, and metered against that account.
- **All controls disabled.** Every control is optional and its absence is stated honestly at startup;
  a disabled control never silently appears to be enforcing.
- **A native client with no attestation support.** Falls back to the member and human tiers rather than
  being refused; it must never be granted app-tier trust it did not prove.
- **Legitimate high-volume member.** Metering is per account, so a heavy member is limited without
  affecting anyone else, and the ceiling is configurable without a deploy.

---

## Requirements *(mandatory)*

### Functional Requirements

**Caller identity**

- **FR-001**: The system MUST establish a caller's assurance tier — anonymous, human-verified,
  member-verified, or app-attested — for every request to a route that consumes a platform-held
  upstream credential.
- **FR-002**: The system MUST treat edge transit (arrival through the platform's own edge) as evidence
  of network path only, and MUST NOT accept it as evidence of caller identity.
- **FR-003**: The system MUST reuse the existing member capability-grant credential for the
  member-verified tier. It MUST NOT introduce a second credential format, a second verifier, or a
  second store of usage counters.
- **FR-004**: The caller-identity layer MUST be extensible so that an additional credential type can be
  added without changing any route, so device attestation can be introduced later as a new tier rather
  than a redesign.
- **FR-005**: The system MUST NOT represent any web-surface assurance as proof of application identity,
  in any member-facing text, operator display, log field, or metric label.

**Tiered access**

- **FR-006**: Read-only routes MUST remain available to callers who have not authenticated, subject to
  metering.
- **FR-007**: Routes that produce a signature using a platform-held credential, broadcast a
  transaction, or otherwise commit platform funds or platform commercial standing MUST require at least
  the member-verified tier. At minimum this covers the trading-venue order-signing route, the Bitcoin
  broadcast route, and every marketplace and trading write path.
- **FR-008**: Refusals MUST state which assurance is required and how the caller can obtain it.
- **FR-009**: An assurance that cannot be *verified* due to an unreachable dependency MUST yield a
  retryable temporary failure, explicitly distinguished from a denial.
- **FR-010**: No control in this feature may prevent a member from completing an action independently
  of the platform's infrastructure; the self-submit path MUST remain available at all times.

**Metering**

- **FR-011**: Usage limits MUST be keyed on something the caller cannot freely rotate: the verified
  account for authenticated callers, the issued human-proof credential otherwise. Limits MUST NOT be
  keyed on an identifier supplied unverified in the request.
- **FR-012**: Each assurance tier MUST have independent limits, so exhausting the anonymous allowance
  cannot deny service to authenticated members.
- **FR-013**: Every upstream credential MUST have a configurable ceiling enforced **before** the
  upstream is called, so a burst is bounded at the platform rather than at the vendor's bill.
- **FR-014**: Every control introduced here MUST be independently configurable and independently
  disableable without a redeploy, following the platform's existing module configuration pattern.
- **FR-015**: Each control MUST be present and answering regardless of configuration, reporting its own
  state honestly, so "disabled" and "absent" are never indistinguishable.

**Human verification**

- **FR-016**: The system MUST support an interactive challenge issuing a short-lived, reusable
  credential, so a visitor is challenged at most once per lifetime rather than per request.
- **FR-017**: Failure or unavailability of the challenge service MUST NOT be presented to a visitor as
  suspicion, refusal, or error, and MUST NOT block read surfaces.
- **FR-018**: Permitting the challenge provider in the client's content policy MUST be a single named
  host in the narrowest applicable directives. The existing prohibition on scheme-wide script grants
  MUST remain intact and enforced, and this exception MUST be pinned by an automated check that records
  its justification so it remains countable and cannot be widened silently.
- **FR-019**: Every client content policy in the estate — each served policy and every policy derived
  from them for other channels — MUST remain in agreement, enforced by the existing parity check.

**Published endpoint safety**

- **FR-020**: A build that publishes a keyed endpoint into client-visible configuration MUST verify
  that endpoint carries a usage restriction, and MUST fail loudly when the restriction is absent
  **or cannot be verified**.
- **FR-021**: The system MUST record which keyed endpoints a build published and under which
  restriction, so exposure is auditable after the fact.
- **FR-022**: The platform MUST NOT expose any general-purpose passthrough that would let an outsider
  route arbitrary calls through a platform-held upstream credential.

**Blast radius and observability**

- **FR-023**: Every platform-held upstream credential MUST have a documented rotation procedure
  covering where it is stored, which components read it, and how to rotate it without an outage.
- **FR-024**: Upstream consumption MUST be observable per upstream and per assurance tier.
- **FR-025**: Every reported figure MUST carry an explicit state of *read*, *not configured*, or
  *unreadable*. A value MUST exist only in the *read* state, so a failed read has no path to render as
  zero. A total missing a contributing source MUST be labelled partial and MUST name what is missing.
- **FR-026**: Anomalous upstream consumption MUST raise an operator alert, and staleness of the
  underlying measurement MUST alert separately, so a stale reading can never silently resolve a
  consumption alert.
- **FR-027**: Metric and log labels MUST come from bounded sets and MUST NOT include member addresses,
  credentials, transaction identifiers, or any other unbounded value.
- **FR-028**: Credential material MUST NOT appear in any log, metric, error message, alert, or
  operator display.

### Key Entities

- **Assurance tier** — the level of confidence established about a caller (anonymous, human-verified,
  member-verified, app-attested), together with what was actually proven and how long it holds.
- **Caller credential** — an evidence artifact presented by a caller: a human-proof credential, a
  member capability grant, or (future) a device attestation assertion. Short-lived; carries the
  identifier used for metering.
- **Protected route** — a route consuming a platform-held upstream credential, annotated with the
  minimum assurance tier it demands and the upstream it draws on.
- **Upstream credential** — a platform-held third-party credential, with its storage location, reading
  components, spend/rate ceiling, and rotation procedure.
- **Usage counter** — consumption recorded against a non-rotatable identifier, scoped by tier and
  upstream.
- **Published endpoint record** — a client-visible keyed endpoint, the restriction verified for it, and
  the build that published it.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A caller presenting no credential other than arrival through the platform edge cannot
  invoke any operation that signs with a platform credential, broadcasts a transaction, or commits
  platform funds — verified by attempting every such operation.
- **SC-002**: A visitor with no wallet completes every read-only browsing task without connecting a
  wallet, signing anything, or encountering a wall.
- **SC-003**: In normal operation, at most one interactive challenge is presented per visitor per
  credential lifetime.
- **SC-004**: Usage limits cannot be evaded by varying request contents; a caller that changes only
  values it supplies remains subject to the same limit.
- **SC-005**: Consumption of every upstream credential is bounded by a configured ceiling, demonstrated
  by driving traffic past it and observing refusal before the upstream is reached.
- **SC-006**: An operator can disable any control or route in this feature within one minute and
  without a redeploy.
- **SC-007**: With every dependency of this feature unavailable, members can still complete every
  value-moving action independently, and no member value is trapped.
- **SC-008**: Every dependency failure produces a retryable temporary outcome, never a denial and never
  a fabricated zero — demonstrated by failing each dependency in turn.
- **SC-009**: A build attempting to publish a keyed endpoint without a verified usage restriction fails,
  demonstrated against a deliberately unrestricted fixture.
- **SC-010**: The prohibition on scheme-wide script grants remains enforced after this feature ships,
  with the single challenge-provider host recorded as an explicit, justified exception.
- **SC-011**: Every platform-held upstream credential has a rotation procedure that has been executed
  end-to-end at least once without a member-visible outage.
- **SC-012**: No credential material appears anywhere in logs, metrics, alerts, or operator displays,
  verified by scanning all emitted output during an exercise of every route.

---

## Assumptions

- **Cloudflare remains the edge.** The interactive challenge is assumed to be the edge provider's own,
  avoiding a new vendor relationship and a second content-policy exception.
- **The existing member capability grant is sufficient** for the member-verified tier without extension.
  If a scope for these routes proves absent, adding one is in scope; a second token format is not.
- **Read routes are cacheable** at short TTLs, so anonymous access can be served largely from cache and
  metering is dominated by cache misses.
- **Anonymous read access is worth defending.** Losing logged-out browsing is judged a worse outcome
  than the residual cost of metered anonymous reads.
- **Device attestation is designed for but not built here.** Publisher enrolment for both mobile
  platforms is operator-held and outstanding; this feature leaves a named seam and a follow-up issue,
  and ships nothing that pretends attestation is in force.
- **A determined party who reads the shipped bundle can still reach anonymous read routes.** This is
  accepted and unavoidable. The objective is that doing so is metered, bounded, attributable, and
  economically pointless — not that it is impossible.
- **Existing quota and killswitch configuration patterns** used by the current proxy modules are the
  template for new configuration, rather than a new mechanism.

---

## Dependencies

- The existing member capability-grant verifier (member API authentication).
- The existing shared counter store already deployed alongside the gateway.
- The edge provider's interactive challenge product and the content-policy parity checks.
- The cost-observability catalogue, whose three-state reporting rules bind every figure this feature
  reports.
- The native channels work, for the future attestation tier only — not a blocker here.

## Out of Scope

- Any new or additional routing appliance, proxy layer, or gateway deployment.
- Relocating credentials already held server-side.
- Device attestation verification for either mobile platform (designed for; deferred to a follow-up).
- Charging for access. Metered anonymous access stays free; monetising it is a separate decision on an
  existing, unrelated rail.
- Changes to the member capability-grant format, its signing flow, or its scope model beyond adding a
  scope if one is genuinely missing.
