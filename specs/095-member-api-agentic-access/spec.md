# Feature Specification: Member API — Private Keys, MCP Server & Agentic Assistant

**Feature Branch**: `claude/openapi-agentic-chat-7cv5re` (spec directory `095-member-api-agentic-access`)

**Created**: 2026-08-22

**Status**: Implemented

**Input**: User description: "Members should be able to create private API keys so their own tools and
AI agents can reach their FairWins data programmatically. Publish an OpenAPI specification for that
member API. Ship an MCP server that consumes it so AI agents can connect safely with the relevant
tools, resources and prompts. Add an api-access mini-app as the member developer console. Add an
agentic chat assistant — opt-in, tethered to the bottom nav — that helps paid members navigate and
act across the app, with memory kept on the device and full preference controls. Update the docs and
the legal policies to describe the AI and data use."

## Overview

FairWins has no member-facing HTTP API. The relay gateway serves the app itself, authenticated by a
single zone-wide edge secret that carries no member identity; every member action reaches a chain
through the member's own wallet, and the platform is deliberately absent from the value path. That
absence is the product's core claim, and this feature must not weaken it.

This feature adds a **member API**: a read/quote/relay surface a member can reach from outside the
app, authorised by a **capability token the member signs themselves**. The platform issues nothing.
A token is an EIP-712 grant (account, key id, scopes, validity window) signed by the member's own
wallet and presented as a bearer credential; the gateway verifies the signature, the membership, the
sanctions status and the requested scopes on every request. Nothing about a key is created,
escrowed or recoverable server-side, and no scope in the vocabulary can move value: the API reads
data, quotes fees, and builds unsigned typed-data for the member to sign somewhere else.

On top of that surface sit three consumers:

- an **OpenAPI 3.1 document**, served by the API itself, so an agent or a developer can discover the
  contract without reading this repository;
- a **dependency-free MCP server** that exposes the API to AI agents as tools, resources and prompts
  — and which explicitly cannot sign, because the member's key never reaches it;
- an **api-access mini-app**: the member's developer console, a registry package that explores the
  OpenAPI document, introspects a pasted token and generates MCP client configuration. It cannot
  sign either — the mini-app host object has no signing capability at all, by design — so key
  creation deep-links back into the app.

Alongside them, an **opt-in agentic assistant**: a floating launcher on in-app routes that answers
questions about the member's own FairWins surfaces and points at the right screen. It is **off by
default**, renders nothing at all until a paid member turns it on, keeps its conversation memory on
the device, never signs or submits anything, and states so on every reply.

Because a member can now send conversation content to the platform and to a model provider, and can
create credentials that let third-party agents read their data, the live legal documents are amended
in the same change: the Privacy Policy's processing and sharing sections, the Risk Disclosure's
existing AI-agent section, and the Terms' existing automated-components clause.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A member creates a private API key (Priority: P1)

A paid member opens Settings, finds **API access**, names a key, picks the scopes it may use and how
long it lives, and signs one prompt in their wallet. The resulting token is shown **once**, with a
copy control and a plain statement that it will not be shown again and is not stored anywhere. The
card then lists the key's metadata — label, id, scopes, expiry — so the member can tell their keys
apart later, and offers a revoke control.

**Why this priority**: nothing else in this feature exists without a token. The MCP server, the
console and the assistant are all consumers of a credential the member creates here, and the
custody-free property of the whole feature is decided by how this key is made.

**Independent Test**: connect a paid member, create a key with two read scopes and a 30-day expiry,
confirm the token appears once and that no clear token is present in any browser storage key or in
the DOM afterwards; confirm the stored metadata lists the key without the secret.

**Acceptance Scenarios**:

1. **Given** a connected account with an active paid membership, **When** it opens the API access
   card and creates a key, **Then** exactly one signature is requested, the token is displayed once
   with a copy control, and only non-secret metadata is retained afterwards.
2. **Given** a connected account whose membership is still being read, **When** it opens the card,
   **Then** it sees a "checking your membership" state — never a denial and never an offer.
3. **Given** a connected account with no paid membership, **When** it opens the card, **Then** it is
   offered a route to upgrade, not a disabled control.
4. **Given** the platform gateway is unreachable, **When** the member creates a key, **Then** the key
   is still created (signing is local) and the card says which capabilities — introspection and
   revocation registration — need the gateway.
5. **Given** an existing key, **When** the member revokes it, **Then** one signature is requested, the
   revocation is registered, and the surface states honestly both that the revocation is registered
   on the live service and when the grant expires on its own.

---

### User Story 2 - An AI agent connects over MCP (Priority: P1)

A member configures an MCP client (their AI assistant of choice) with the FairWins MCP server, the
API base URL and their own token. The agent can then list the member's wagers, read their membership
and the live platform fee rates, browse public prediction markets and perp pairs, fetch the OpenAPI
document and the getting-started guide, and build an unsigned transaction payload for the member to
sign. Every one of those answers is either real data or an explicit statement that a read failed.
The agent cannot sign, cannot submit, and the server says so in the tool descriptions.

**Why this priority**: this is the "AI agents can connect safely" half of the ask, and it is the
consumer that proves the token design is genuinely custody-free — an agent holding the credential
still cannot move anything.

**Independent Test**: run the MCP server with a valid token, drive `initialize` → `tools/list` →
`tools/call get_membership` → `resources/read fairwins://openapi`, and confirm a failing upstream
read is reported as an error result rather than as empty or fabricated data.

**Acceptance Scenarios**:

1. **Given** a configured server with a valid token, **When** an agent calls a read tool, **Then** it
   receives the member's real data or an explicit failure — never an invented value.
2. **Given** a server with no API base URL configured, **When** an agent calls any tool, **Then** the
   tool answers with an honest "not configured" error result rather than failing silently or
   pretending the member has nothing.
3. **Given** an agent calling the intent-building tool, **When** it receives typed data, **Then** the
   response states that the member must sign it elsewhere and that the server holds no key.
4. **Given** a revoked or expired token, **When** an agent calls a tool, **Then** the failure names
   the reason (revoked / expired) rather than reporting an empty account.

---

### User Story 3 - A member turns on the assistant and asks for help (Priority: P2)

A paid member opens Settings, reads what the assistant does and what leaves the device, and turns it
on. A launcher appears on in-app screens, positioned above the bottom navigation without covering
it. Opening it shows a chat panel; the member asks "where do I change my RPC endpoint?" and gets an
answer with an in-app link. Every reply carries a standing note that the answer is AI-generated, must
be verified, and that the assistant never signs or submits anything.

**Why this priority**: valuable, but it depends on the token rail (US1) and must not be the thing
that ships first — an assistant that could be wrong about money is only safe once its refusal to act
is structural.

**Independent Test**: with the preference off, confirm nothing renders and no request is issued; turn
it on, confirm the launcher appears and clears the bottom navigation; with the service unreachable,
confirm an honest failure with a retry rather than a fabricated reply.

**Acceptance Scenarios**:

1. **Given** the assistant preference is off (the default), **When** the member uses the app, **Then**
   no launcher renders and no assistant request is ever issued.
2. **Given** the assistant is on and the service is unreachable, **When** the member sends a message,
   **Then** the panel states the service could not be reached and offers a retry — it never displays
   an invented reply.
3. **Given** a reply suggesting a destination, **When** it renders, **Then** the suggestion is an
   in-app link the member can follow, and the reply carries the AI-generated / never-signs notice.
4. **Given** a member whose membership cannot be read, **When** they use the app, **Then** the
   launcher renders nothing — an unreadable membership is never presented as a refusal.
5. **Given** the navigation drawer is open, or the member is scrolling down a long screen, **When**
   the launcher would overlap, **Then** it hides or recedes and returns afterwards; with reduced
   motion requested, the transition is opacity only.

---

### User Story 4 - A member controls what the assistant remembers and what leaves the device (Priority: P2)

A member opens the assistant preferences card. It says in plain language what happens when the
assistant is enabled (messages go to the platform service and its model provider), what does not
(memory stays on this device; nothing is sent while it is off), links to the Privacy Policy, and
offers a memory-retention toggle plus a "clear conversation memory" control showing how many entries
are held. Turning the assistant off returns the app to sending nothing.

**Why this priority**: the disclosure and the control are what make the opt-in meaningful. Shipping
the assistant without them would make a live, versioned, consent-bound policy document say something
untrue.

**Independent Test**: enable the assistant, exchange messages, confirm the memory count rises,
clear it and confirm it returns to zero; confirm the memory is absent from the backup bundle;
confirm the card's summary line states the actual current state.

**Acceptance Scenarios**:

1. **Given** the assistant preferences card, **When** it renders, **Then** it discloses what leaves
   the device when enabled, links to the Privacy Policy, and its summary line states the real state
   ("Off — nothing is sent").
2. **Given** stored conversation memory, **When** the member clears it, **Then** the count returns to
   zero and no residue remains in device storage.
3. **Given** the member takes a backup of their account data, **When** the bundle is inspected,
   **Then** conversation memory and assistant preferences are absent from it.
4. **Given** the member disconnects or switches accounts, **When** the assistant is next opened,
   **Then** the previous session's authorisation is gone and must be re-authorised.

---

### User Story 5 - A developer explores the API from the console (Priority: P3)

A member (or their developer) opens the **API Access** app from the Apps catalog, points it at the
API base URL, pastes a token, and browses the endpoints the OpenAPI document declares — path,
summary, required scope. They introspect the token, try a read endpoint, and copy a ready-made MCP
client configuration snippet. The console explains that key creation happens in the app, and links
there, because the app cannot sign.

**Why this priority**: a convenience surface over capabilities that already exist. It must ship
after them, and it is the story most safely deferred.

**Independent Test**: launch the app, enter a base URL, confirm the endpoint list renders from the
fetched document; with the URL unreachable, confirm the honest failure state and the absence of the
endpoint list; confirm the pasted token is never written to app storage.

**Acceptance Scenarios**:

1. **Given** a reachable API base URL, **When** the console loads the document, **Then** it lists the
   endpoints with their summaries and required scopes.
2. **Given** an unreachable base URL, **When** the console tries, **Then** it states the failure and
   renders no endpoint list — "nothing here" and "we could not ask" are never the same screen.
3. **Given** a pasted token, **When** the member reloads the app, **Then** the token is gone (it was
   never persisted) while the base URL preference remains.
4. **Given** the member wants a key, **When** they use the console's explainer, **Then** they are
   taken to the app's API access card, with the console stating that signing lives there.

---

### Edge Cases

- **Membership cannot be read** (reference-chain RPC failure): the API answers with a retryable
  "membership unreadable" state, never a denial and never tier zero; the assistant launcher renders
  nothing; the settings card shows a checking/unknown state rather than an upgrade offer.
- **Revocation durability**: the revocation register is in-process, like every other gateway store.
  A restart forgets it. Every surface that reports a revocation states that fact and names the grant's
  own expiry as the durable bound; no surface claims a permanent revocation the service cannot keep.
- **The gateway (or the whole module) is off**: every member API path answers with a machine-readable
  "not configured" state rather than a missing route; the app hides or degrades the dependent
  surfaces honestly; key creation still works because signing is local.
- **Token expiry mid-session**: an expired token fails with an expiry-specific reason, so a client can
  tell "your key ran out" from "your key was rejected". The assistant's session authorisation is
  short-lived by design and re-asks rather than silently failing.
- **Contract-account signers** (smart accounts, passkey members): a signature that does not recover
  to the account is checked against the account contract itself. If that check cannot be performed —
  the chain did not answer — the request fails as *unverifiable and retryable*, never as forged. A
  smart-account signature and a forgery look identical from outside without that read.
- **A key with more scopes than the caller needs**: scope is checked per endpoint; an under-scoped
  token is refused with a scope-specific reason rather than a generic denial.
- **Quota exhaustion**: refused with a retry-after hint. The allowance is keyed on the verified
  account, so one member's agent polling hard cannot exhaust another member's budget — and cannot be
  evaded by changing network address either, because the address is not what is counted.
- **Model provider unavailable or unconfigured**: an explicit "assistant unavailable / not
  configured" state. The assistant never falls back to a canned answer presented as a model reply.
- **Sanctioned account**: refused; a screening system that cannot answer refuses too (fail closed),
  and says which of the two it is.
- **Testnet cohort**: reads stay within the build's cohort. A member API deployment never mixes
  testnet and mainnet data in one answer.
- **The mini-app is asked to sign**: it cannot, and says so. It must not simulate a signature, and
  must not ask the member to paste anything secret other than the token it holds in memory.

## Requirements *(mandatory)*

### Functional Requirements

**Capability tokens and authentication**

- **FR-001**: A member API credential MUST be a capability token the **member signs**, carrying the
  account, a key id, the granted scopes and an explicit validity window. The platform MUST NOT issue,
  escrow, or be able to reconstruct a token, and MUST NOT need to store anything in order for one to
  be valid.
- **FR-002**: A token MUST travel in a request header, never in a URL, and MUST NEVER be written to
  logs, audit records, persistent storage, or any display surface after the single post-creation
  disclosure.
- **FR-003**: Every grant MUST carry an expiry, and the service MUST enforce both that expiry and a
  configured maximum lifetime — a grant asking for longer than the service permits is refused rather
  than silently truncated.
- **FR-004**: Signature verification MUST accept both externally-owned and contract accounts. When the
  contract-account check cannot be performed because a chain read failed, the request MUST fail as
  **unverifiable and retryable** — never as invalid. An unknown answer is not a forged signature.
- **FR-005**: A member MUST be able to revoke a key by signing a revocation for that key id, without
  presenting the token itself. The response, and every surface reporting it, MUST state the
  durability of that revocation honestly, including that the grant's own expiry is the bound the
  service can always keep.
- **FR-006**: Every authenticated request MUST require an active paid membership on the membership
  reference chain. A membership that cannot be read MUST yield a retryable "unreadable" outcome —
  never a denial, and never treated as tier zero.
- **FR-007**: Every authenticated request MUST screen the token's account against the platform's
  sanctions source, failing closed: a screening source that cannot answer refuses the request and
  says so distinctly from a positive match.
- **FR-008**: Access MUST be scoped. The scope vocabulary MUST be least-privilege and MUST NOT contain
  any scope that can move value; a request outside its token's scopes is refused with a
  scope-specific reason.
- **FR-009**: The API MUST apply per-account and global request allowances keyed on the **verified**
  account — never the caller's network address, which on this deployment is the proxy's and would pool
  every member into one bucket — and MUST refuse an over-limit request with a retry hint. Assistant
  turns MUST be subject to the same enforcement.

**API surface**

- **FR-010**: The API MUST publish an OpenAPI 3.1 document describing itself — including every path,
  the authentication scheme, the scope required per operation, and the error codes — served from the
  API, and derived from the same constants the implementation enforces so the two cannot disagree.
- **FR-011**: The API MUST offer token introspection returning the token's own claims plus the live
  membership state and the current revocation state, so a client can tell why it is being refused.
- **FR-012**: Every read that spans chains or external sources MUST return a per-source state of
  `read` / `not configured` / `unreadable`, with values present only in the `read` state. A failed
  read MUST NEVER serialise as `0`, `[]`, or `false`, and a partial total MUST be labelled partial and
  name what is missing.
- **FR-013**: Fee figures MUST be read from the platform's single fee source. The API MUST NOT
  hardcode a rate or introduce a second fee-configuration store.
- **FR-014**: The API MUST be able to build an unsigned EIP-712 payload for a supported member action,
  with the acting party **forced to the token's account** and never taken from the request body.
  Actions whose authorisation is not an intent struct MUST return their true shape rather than a
  fabricated one, and an action that cannot be expressed safely over a relay MUST be refused with a
  stated reason.
- **FR-015**: Submission of a signed payload MUST reuse the platform's existing relay path; the API
  MUST NOT duplicate the relay pipeline, and every build response MUST name the self-submit
  alternative so a relay outage never strands a member.
- **FR-016**: No part of this feature — API, MCP server, assistant, or console — may hold, derive,
  request or reconstruct a member's private key, seed, passkey secret, or any third-party credential
  derived from them, and none may sign on a member's behalf.
- **FR-017**: The member API MUST be an optional module: off by default, individually killable, and
  answering with a machine-readable "unconfigured"/"killed" state rather than a missing route.
  Configuration validation MUST fail loudly at start-up **only** when the module is enabled, so an
  unconfigured optional feature can never take down the platform's relay path. Its liveness MUST be
  reported on the platform's public status surface.

**Assistant**

- **FR-018**: The assistant MUST be opt-in and **off by default**. While off, no assistant UI renders
  and no assistant request is ever issued. It MUST additionally render nothing unless the tenant
  enables the feature, a wallet is connected, and an active paid membership has been **positively
  read** — a pending or unreadable membership renders nothing rather than a refusal.
- **FR-019**: Assistant replies MUST NEVER claim to have performed an action, MUST NEVER request a
  private key, seed phrase or password, MUST state fees and risks honestly, and MUST carry a standing
  notice that the content is AI-generated, should be verified, and that the assistant never signs or
  submits anything.
- **FR-020**: Conversation memory MUST be device-local, bounded, and clearable by the member, MUST be
  scoped to the connected account, and MUST NOT be transmitted, synced, or included in any backup
  bundle.
- **FR-021**: Assistant message content MUST NEVER be logged or written to an audit record. Operational
  records may carry counts and outcomes only.
- **FR-022**: The assistant's own authorisation MUST be a short-lived token held in memory only,
  never persisted, and discarded when the member disconnects or switches accounts.
- **FR-023**: Every assistant failure MUST be stated honestly with a retry where recovery is possible.
  The panel MUST NEVER render a fabricated reply, and MUST distinguish "not configured" from
  "unreachable".
- **FR-024**: The launcher MUST sit above the bottom navigation without covering it, re-position when
  that navigation appears or disappears, recede while the navigation drawer or its own panel is open,
  honour reduced-motion preferences, and announce replies politely rather than assertively.

**Console (mini-app)**

- **FR-025**: The console MUST be a registry package with no privileged capability beyond the standard
  host surface. It MUST NOT be able to sign, MUST hold a pasted token in component memory only —
  never in app storage — and MUST direct key creation back into the app.
- **FR-026**: Every fetch in the console MUST render three states (loading / unreachable / data). An
  unreachable source MUST NEVER render as an empty result.

**Disclosure**

- **FR-027**: The Privacy Policy MUST be amended to name the new processing — assistant conversation
  content sent to the platform and its model provider **only while the member has enabled the
  assistant**, and API access grants (public address, key id, scopes, validity, revocation records) —
  and to name the model provider as a processor for that content. Its existing statement of what is
  not collected MUST remain true after the amendment.
- **FR-028**: The Risk Disclosure's existing automation/AI section and the Terms' existing automated
  components clause MUST be extended to cover member-facing AI and member-created API keys (output may
  be wrong; verify before signing; the assistant never signs; a token lets a third-party agent read
  your data — guard it like a credential; the member is responsible for safeguarding tokens). No
  fourth legal document is added, and the existing legal link set is unchanged.
- **FR-029**: Product documentation MUST describe the API, the MCP server and the assistant, MUST
  carry an operations runbook covering enabling, killing, key rotation and revocation semantics, and
  MUST correct any existing documentation that asserts the platform has no HTTP API.
- **FR-030**: Key creation and revocation, and enabling or disabling the assistant, MUST be recorded
  in the member's durable activity record with metadata only (key id, label, scopes) — never a token
  and never message content.

### Key Entities

- **API key grant**: what the member signs. Account, key id, granted scopes, issue time, expiry. The
  display label is deliberately outside the signed material — renaming a key must not invalidate it.
- **Capability token**: the transportable encoding of a grant plus its signature. Presented as a
  bearer credential; never stored by the platform; shown to the member exactly once.
- **Revocation**: a member-signed statement that a key id is withdrawn, with the time. Self-authorising
  — presenting the token is not required to revoke it.
- **Scope**: a named, least-privilege capability (profile, wagers, membership, fees, intent building,
  assistant). No scope can move value.
- **Key metadata record**: the non-secret description of a key held on the member's device so keys can
  be told apart and revoked: id, label, scopes, issue and expiry times.
- **Assistant preference**: per-account, device-scoped: enabled (default off) and memory retention.
- **Conversation memory**: bounded, device-local, account-scoped message history; clearable; never
  synced or backed up.
- **Assistant session authorisation**: a short-lived, memory-only token the member signs when they
  first open the assistant after enabling it.
- **MCP tool / resource / prompt**: the agent-facing projection of the API — read tools, an
  intent-building tool that cannot sign, the OpenAPI and status resources, a getting-started guide,
  and two instruction templates.
- **Member API module configuration**: the operator's switches — enabled, killed, allowances, lifetime
  cap, per-chain data sources, and the assistant's own sub-configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A paid member can create a working API key with exactly one wallet signature and no
  server-side account, and the created token is retrievable from no surface after its single
  disclosure — verified by sweeping every browser storage key and the rendered document.
- **SC-002**: A holder of a valid token can read their own profile, membership, wagers and the live
  fee rates, and can obtain unsigned typed data for a supported action — and can perform **no**
  operation that moves value, with the acting party in every built payload equal to the token's
  account in 100% of cases.
- **SC-003**: Every failure mode of the authenticated path is distinguishable by its reason code:
  malformed, expired, over-lifetime, revoked, unverifiable, membership-required,
  membership-unreadable, sanctioned, screening-unavailable, insufficient-scope, over-quota — with an
  unverifiable signature and an unreadable membership answered as retryable, never as denials.
- **SC-004**: An MCP client configured with the server and a member token completes an
  initialise/list/call round trip and receives real data or an explicit failure for every tool; no
  tool ever returns a fabricated value for a failed read.
- **SC-005**: With the assistant preference off — the shipped default — the app issues zero assistant
  requests and renders zero assistant elements, verified in an end-to-end run.
- **SC-006**: Conversation memory and assistant preferences are absent from the backup bundle, and
  clearing memory returns the reported entry count to zero with no residue in device storage.
- **SC-007**: Every member-facing surface in this feature renders its unreachable state as a stated
  failure with a retry, and never as an empty list — verified for the console, the assistant panel
  and the API access card.
- **SC-008**: The published OpenAPI document describes every served path, its required scope and its
  error codes, and is generated from the same constants the service enforces, so a scope or code
  added to one appears in the other without a second edit.
- **SC-009**: The Privacy Policy, Risk Disclosure and Terms each describe the member-facing AI and the
  API-key credential, and the Privacy Policy's "what we do not collect" statement remains true.
- **SC-010**: Disabling the module, or the whole gateway, leaves key creation working and every
  dependent surface honestly degraded — no member-facing capability that existed before this feature
  is removed or weakened by it.

## Assumptions

- **Stateless issuance is a requirement, not a shortcut** (confirmed against the platform's own
  constraints): the gateway persists nothing and runs as a single instance with in-process stores. A
  design requiring durable server-side key records would have to introduce that durability
  deliberately; a member-signed grant needs none, so the credential model is chosen to fit the
  service that verifies it. The one genuinely stateful behaviour — revocation before expiry — is
  therefore best-effort and is disclosed as such everywhere it is reported.
- **The membership reference chain decides paid status**, exactly as everywhere else in the platform;
  the API reads it there and nowhere else.
- **The assistant is a guide, not an operator.** It never gains a write path in this feature. If an
  execution capability is ever wanted it is a separate spec with its own security lifecycle.
- **The model provider is an optional upstream.** The assistant is configured independently of the
  rest of the API, so the API can ship with the assistant unconfigured, and does so by default.
- **The console cannot sign because the mini-app host object has no signing capability**, and adding
  one would grant it permanently to every third-party package. Deep-linking to the app is the correct
  shape, not a limitation to be engineered around.
- **No contract changes.** Nothing in this feature is verified on chain: the grant is an off-chain
  EIP-712 structure the gateway verifies. No storage layout, no deployment, no upgrade.
- **The existing relay path is reused for submission**; this feature adds no second write rail and
  removes no self-submit fallback.
