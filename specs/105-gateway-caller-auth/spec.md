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

**Therefore this feature is primarily about caller identity and metering, not about routing.** One
thing is explicitly **out of scope** because it is already solved and adding it would cost real money
and close nothing:

- **A second/new routing appliance.** Another proxy adds a network hop, an operational surface, and a
  second home for every credential, while leaving the caller just as anonymous.

### The second problem: keyed data access

There is a related exposure the caller-identity work does not reach, and it runs the other way.

Most client-visible configuration is genuinely public-safe — the wallet-connect project identifier,
gateway addresses, public chain endpoints. But the product also needs **keyed** data-provider capacity
for reads: public endpoints throttle a multi-chain portfolio view into partial or missing data, which
is why keyed capacity was procured at all. The obvious way to give a browser that capacity is to
compile the credential into the build, and the slots for doing so already exist.

They are currently empty, so nothing is exposed today. But that design has two defects that only appear
later. **Rotation and chain-addition each become a frontend release**, which is how a credential ends up
long-lived — the operation that would shorten its life is the one made expensive. And the protection
usually cited for publishing it, provider-side referrer restriction, is described by the provider
itself as bypassable by any non-browser client; it is not a security control.

Nothing currently verifies any of this. The existing tooling checks that a keyed endpoint answers for
the *right chain* — because a mistyped one returns another chain's state rather than an error — but has
no notion of restriction at all, and the hygiene check only emits a non-failing note for client-visible
credentials. An unrestricted full-privilege endpoint placed in that slot would ship to every visitor
with nothing firing.

So this feature also covers **how a client obtains keyed read capacity**: at runtime, expiring, from a
platform-controlled issuing point, gated by the same assurance tiers — never as a build-time constant.

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

### User Story 4 - An operator rotates a key or adds a chain without shipping a frontend (Priority: P1)

An operator needs to rotate a keyed data-provider credential, or bring a newly supported chain online.
They change server-side configuration and the change takes effect for every client already running.
There is no frontend rebuild, no redeploy, no version skew between members who reloaded and members who
did not, and no window during which some clients hold a revoked credential.

**Why this priority**: This is why keyed access cannot be a published build-time value. Rotation and
chain-addition are routine, expected operations; a design that makes each of them a frontend release
means they are deferred, which is how a credential ends up long-lived. It is P1 because it is the
requirement that eliminates the otherwise-obvious design.

**Independent Test**: Rotate a credential while clients are actively reading, and confirm no client
observes an interruption. Separately add a chain and confirm existing clients can read it without
updating.

**Acceptance Scenarios**:

1. **Given** clients actively reading data, **When** an operator rotates the underlying credential,
   **Then** reads continue uninterrupted and no client requires a reload or a new build.
2. **Given** a rotation, **When** it completes, **Then** the superseded credential no longer grants
   access, and the window in which both are valid is bounded and deliberate.
3. **Given** a newly configured chain, **When** an already-running client requests access for it,
   **Then** access is granted without that client being updated.
4. **Given** a client holding access that expires mid-session, **When** it next reads, **Then** it
   renews without member-visible interruption.

---

### User Story 5 - Data-heavy screens work at full speed, for everyone (Priority: P1)

A member opens a screen that reads across several chains at once — balances, holdings, positions. It
loads completely and quickly. The same is true for a visitor who has connected no wallet. Neither is
throttled into partial or missing data, because both are served through keyed capacity rather than
shared public infrastructure.

**Why this priority**: Public endpoints rate-limit these screens into unusability, which is the entire
reason keyed access exists. Any design that leaves the un-authenticated path on public infrastructure
has not solved the problem it was built for.

**Independent Test**: Load the heaviest multi-chain read surface as an anonymous visitor and as a
member, and confirm both complete without throttling and without missing data.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** they open a multi-chain read surface, **Then** it obtains
   keyed capacity and completes without throttling — keyed read access is NOT reserved for members.
2. **Given** keyed access is unavailable, **When** a member reads, **Then** the app falls back to
   public capacity, still functions, and discloses the degraded state honestly rather than silently
   rendering partial data as if complete.
3. **Given** a member who has configured their own endpoint, **When** they read, **Then** their choice
   takes precedence over platform-provided access, unchanged by this feature.
4. **Given** any failure in this feature, **When** a member reads, **Then** they are never left with no
   route to the chain at all.

---

### User Story 6 - A credential is never published unprotected (Priority: P2)

Keyed access reaches a client alongside a second, expiring credential, and the underlying endpoint only
honours requests presenting both. That second factor is what makes the first one safe to transmit. An
operator therefore cannot hand a client an endpoint whose second-factor enforcement is switched off,
because the system refuses to serve one.

**Why this priority**: This is the load-bearing invariant of the chosen design, and the one that fails
silently. An endpoint with enforcement disabled looks identical in every log to one with it enabled —
right up until the transmitted credential turns out to have been sufficient on its own.

**Independent Test**: Configure an endpoint with second-factor enforcement disabled and confirm the
system refuses to serve access for it, naming the endpoint.

**Acceptance Scenarios**:

1. **Given** an endpoint whose second-factor enforcement is not verified as active, **When** a client
   requests access for it, **Then** access is refused and the operator is alerted.
2. **Given** enforcement that cannot be checked because the provider is unreachable, **When** access is
   requested, **Then** it is refused as *unverified* — the unverifiable case MUST NOT pass, because a
   false pass transmits an unprotected credential.
3. **Given** a verified endpoint, **When** access is served, **Then** the system records which endpoint
   was served, under which enforcement, and to which assurance tier.

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
- **Issued access expires mid-read.** The client renews and retries transparently; a member never sees
  a failed read caused by an expiry the app could have anticipated.
- **Issuing is unavailable.** Clients fall back to public capacity — degraded but functional — and say
  so. They never present throttled or partial results as if complete, and never leave a member with no
  route to a chain.
- **A member configured their own endpoint.** Their choice wins, ahead of anything the platform issues.
  This feature changes what the platform offers as a default, never the member's precedence over it.
- **Issued access is stolen from a browser.** Assumed possible, not prevented. It is bounded by its
  lifetime, confined to read operations, metered on re-acquisition, and revocable immediately.
- **A provider endpoint's second-factor enforcement is switched off.** The system refuses to serve
  access for it. The unverifiable case is treated as the disabled case, because a false pass here
  transmits an unprotected credential.
- **A rotation is in flight.** Predecessor and successor keys are simultaneously valid for a bounded,
  deliberate window; no client observes a failure, and the predecessor is genuinely retired afterwards.
- **A chain is added.** Already-running clients obtain access for it without being updated.

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

**Keyed data access**

- **FR-020**: Keyed access credentials MUST NOT be embedded in client-visible build configuration.
  Clients MUST obtain them at runtime from a platform-controlled issuing point.
- **FR-021**: Issued access MUST expire, and its lifetime MUST be configurable without a client update.
- **FR-022**: Issuing MUST be available to every assurance tier including anonymous, so keyed read
  capacity is never reserved for authenticated members. Tier MAY determine the lifetime, rate ceiling,
  and permitted operations of what is issued; it MUST NOT determine whether anything is issued at all.
- **FR-023**: Issued access MUST permit read operations only. It MUST NOT be usable to broadcast a
  transaction or to invoke administrative or debugging operations against the provider.
- **FR-024**: An operator MUST be able to rotate the underlying credential, and to add or remove a
  chain, entirely through server-side configuration, with no client rebuild and no member-visible
  interruption.
- **FR-025**: Multiple signing keys MUST be able to be valid simultaneously, so rotation proceeds by
  introducing a successor before retiring its predecessor rather than by a cutover.
- **FR-026**: The system MUST verify that an endpoint enforces the expiring second factor before
  serving access for it, and MUST refuse when enforcement is absent **or cannot be verified**.
- **FR-027**: The signing key for issued access is key material: it MUST be held in the platform
  secret store, MUST NOT fall back to an ambient environment value on any public network, and MUST NOT
  appear in any log, metric, or error.
- **FR-028**: When issuing is unavailable, clients MUST fall back to public capacity, MUST remain
  functional, and MUST disclose the degraded state rather than presenting throttled or partial results
  as complete.
- **FR-029**: A member's own configured endpoint MUST continue to take precedence over any
  platform-provided access.
- **FR-030**: The platform MUST NOT expose an unrestricted passthrough to a provider. Any
  platform-mediated access MUST be confined to an explicit set of permitted read operations, metered
  per caller, and disableable without a redeploy.
- **FR-031**: The system MUST record which endpoints were served, to which assurance tier, and under
  which enforcement, so exposure is auditable after the fact.

**Blast radius and observability**

- **FR-032**: Every platform-held upstream credential MUST have a documented rotation procedure
  covering where it is stored, which components read it, and how to rotate it without an outage.
- **FR-033**: Upstream consumption MUST be observable per upstream and per assurance tier.
- **FR-034**: Every reported figure MUST carry an explicit state of *read*, *not configured*, or
  *unreadable*. A value MUST exist only in the *read* state, so a failed read has no path to render as
  zero. A total missing a contributing source MUST be labelled partial and MUST name what is missing.
- **FR-035**: Anomalous upstream consumption MUST raise an operator alert, and staleness of the
  underlying measurement MUST alert separately, so a stale reading can never silently resolve a
  consumption alert.
- **FR-036**: Metric and log labels MUST come from bounded sets and MUST NOT include member addresses,
  credentials, transaction identifiers, or any other unbounded value.
- **FR-037**: Credential material MUST NOT appear in any log, metric, error message, alert, or
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
- **Issued access** — a short-lived, expiring credential handed to a client at runtime, carrying its
  lifetime, the assurance tier it was issued to, the operations it permits, and the signing key that
  produced it.
- **Provider endpoint** — a keyed data-provider endpoint, its enforcement state, the chains it serves,
  and whether it is currently eligible to be served to clients.
- **Access issuance record** — which endpoint was served, to which tier, under which enforcement, and
  when — retained for audit without retaining the credential itself.

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
- **SC-009**: No keyed access credential appears in any client build artifact, verified by scanning a
  production build for every configured provider credential.
- **SC-009a**: A request for access against an endpoint whose enforcement is disabled, or cannot be
  checked, is refused — demonstrated against both a disabled fixture and an unreachable one.
- **SC-010**: The prohibition on scheme-wide script grants remains enforced after this feature ships,
  with the single challenge-provider host recorded as an explicit, justified exception.
- **SC-011**: Every platform-held upstream credential has a rotation procedure that has been executed
  end-to-end at least once without a member-visible outage.
- **SC-012**: No credential material appears anywhere in logs, metrics, alerts, or operator displays,
  verified by scanning all emitted output during an exercise of every route.
- **SC-013**: A credential rotation completes with clients actively reading and produces zero failed
  reads, and requires no client rebuild or redeploy.
- **SC-014**: A chain added purely through server-side configuration becomes readable by a client that
  has not been updated.
- **SC-015**: An anonymous visitor obtains keyed read capacity, demonstrated by completing the heaviest
  multi-chain read surface with no wallet connected and no throttling.
- **SC-016**: Issued access cannot broadcast a transaction or invoke an administrative or debugging
  provider operation, demonstrated by attempting each and observing refusal at the provider.
- **SC-017**: With issuing unavailable, every read surface still returns data via public capacity and
  states that it is degraded; no surface renders throttled or partial results as complete.
- **SC-018**: The exposure window of a stolen issued credential is bounded by its configured lifetime,
  demonstrated by replaying one past expiry and observing refusal.

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

### Assumptions specific to keyed data access

The mechanism for FR-020 through FR-031 was chosen deliberately over two alternatives, and the choice
carries consequences the requirements above encode:

- **Chosen: the platform issues short-lived credentials; clients read directly from the provider.**
  Read traffic is the heaviest the application generates — a multi-chain portfolio view fans out across
  every supported chain on a single screen. Routing it through platform infrastructure would put a
  capacity ceiling and an added round trip on every screen in the product. Issuing keeps that traffic
  on the direct path while removing any long-lived credential from the client.
- **Rejected: publishing a restricted endpoint into the build.** It fails FR-024 outright — every
  rotation and every added chain becomes a frontend release. The provider additionally states that
  referrer restriction is not a security control and is bypassed by any non-browser client, so the
  protection it appears to offer is weaker than it reads.
- **Rejected: proxying all read traffic through platform infrastructure.** Strictly better credential
  containment, and worth revisiting if the accepted residual below proves unacceptable — but it makes
  the platform a hard dependency of every read and moves the product's heaviest traffic onto
  infrastructure sized for its lightest.

- **ACCEPTED RESIDUAL, stated plainly**: the client necessarily holds both the endpoint address and its
  expiring credential, and both are readable from a browser for the credential's lifetime. This design
  does not make theft impossible; it bounds theft to that lifetime, confines what a stolen credential
  can do to read operations (FR-023), meters re-acquisition (FR-022), and makes revocation immediate
  (FR-025). **The endpoint address alone must never be sufficient** — which is why FR-026 refuses to
  serve an endpoint whose second-factor enforcement is not positively verified, and why an
  unverifiable check must fail rather than pass.
- **The provider supports simultaneous valid signing keys.** FR-025's rotation-by-succession depends on
  it; the provider's key-identifier mechanism is assumed to allow more than one active at a time.
- **RESOLVED (2026-09-04) — provider plan tier.** The operator confirmed from the provider dashboard
  that expiring-credential authentication is enabled on the account. That places the platform on a tier
  which also carries provider-side operation restriction, so FR-023 and FR-026 both have a mechanism and
  the design above stands; the proxy alternative stays recorded as the fallback but is not needed. The
  finding belongs in the network-endpoints guide, written as part of implementation rather than now —
  documenting a capability before it is built would state something the product does not yet do.
- **Account-level availability is NOT per-endpoint enforcement, and FR-026 turns on the difference.**
  "Enabled on the account" means the control *can* be applied; it does not mean it *is* applied to any
  particular endpoint. An endpoint with enforcement switched off is indistinguishable in every log from
  one with it on — until the address transmitted to a client turns out to have been sufficient by
  itself. FR-026 therefore verifies enforcement **per endpoint, at the moment access is served**, and
  treats the unverifiable case as the disabled case. Confirming the tier removes the mechanism risk; it
  removes none of the configuration risk.

---

## Dependencies

- The existing member capability-grant verifier (member API authentication).
- The existing shared counter store already deployed alongside the gateway.
- The edge provider's interactive challenge product and the content-policy parity checks.
- The cost-observability catalogue, whose three-state reporting rules bind every figure this feature
  reports.
- The platform secret store, for the new signing key material (FR-027).
- The existing endpoint-resolution seam, whose member-override precedence FR-029 preserves.
- The data provider's expiring-credential authentication and operation-restriction features — **gated
  on the open plan-tier question above.**
- The native channels work, for the future attestation tier only — not a blocker here.

## Out of Scope

- Any new or additional routing appliance, proxy layer, or gateway deployment. Issuing a credential is
  not proxying traffic; no read traffic is redirected onto platform infrastructure by this feature.
- Relocating credentials already held server-side. Server-side consumers continue to read the provider
  credential directly from the secret store, unchanged.
- Device attestation verification for either mobile platform (designed for; deferred to a follow-up).
- Charging for access. Metered anonymous access stays free; monetising it is a separate decision on an
  existing, unrelated rail.
- Changes to the member capability-grant format, its signing flow, or its scope model beyond adding a
  scope if one is genuinely missing.
- Changing which chains the product supports. This feature changes how access to a chain is obtained,
  never which chains exist.
