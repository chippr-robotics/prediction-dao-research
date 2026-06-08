# Feature Specification: Compliance & Legal Gating Layer

**Feature Branch**: `007-compliance-gating`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Compliance & legal gating layer for FairWins: (1) geo-blocking enforced at the edge where the true client IP is visible, with the origin locked so the gate cannot be bypassed; (2) a layered eligibility/age attestation stack (entry modal → membership checkboxes → deterministic key-generation signature) with tamper-evident, fail-closed server-side audit logging; (3) on-chain wallet sanctions screening; and (4) versioned, SHA-256-hash-addressed Terms & Conditions and Risk Disclosure served on-site and referenced by every attestation record."

## Overview

FairWins must restrict access to eligible participants and produce a defensible,
tamper-evident record that each participant affirmed their eligibility against a
specific, verifiable version of the legal terms. The protection is a **stack**,
not a single click: a geographic gate at the network edge, on-chain sanctions
screening of the wallet, a three-layer consent flow (entry → membership →
signature), versioned legal documents the consent incorporates by reference, and
immutable on-chain consent records binding it all together. No single layer is sufficient;
the defensibility comes from the layers reinforcing one another, and from the
implemented controls matching what the legal documents represent.

## Clarifications

### Session 2026-06-06

- Q: Where is sanctions screening enforced (app-layer vs on-chain contract guard)? → A: Both (defense-in-depth) — app-layer screening for fast UX plus a non-bypassable on-chain guard in the contracts, since FairWins' contracts are publicly callable on Polygon and an app-layer-only screen would be bypassable by direct contract calls.
- Q: How are legal-document versions stored/anchored — content-addressed (IPFS) per event, server-hosted, or on-chain anchor? → A: No per-event artifact. Documents are served by the SPA and per-version IPFS-pinned, versioned by SHA-256 (re-hash to verify); the one-time deterministic key-generation signature is the per-account cryptographic anchor to the Terms, and each access/purchase records only the version hash — no IPFS pin per site access or membership purchase, keeping the account-to-Terms binding tied to wallet control.
- Q: How is re-consent enforced on a material T&C change for existing members/wagers? → A: Per-wager term-version binding. Each wager is cryptographically bound (via its encryption — the governing version hash carried as authenticated associated data) to the T&C version accepted/in force at creation, and is governed by that version for its entire lifetime; new material versions apply prospectively only and NEVER retroactively to existing wagers. Re-consent attaches at the next consequential act (membership purchase/upgrade, new wager creation), not by hard-gating general browsing.
- Q: Is the discretionary (illicit-finance) block-list in scope, and how rich? → A: Full scope (B). Operator-maintained block-list with an admin UI and its own audit trail of who added/removed entries (actor, timestamp, reason), enforced both at the app layer and via an updatable, access-controlled on-chain deny-list that the on-chain guard consults alongside the Chainalysis oracle. Risk-category scoring remains out of scope.
- Q: Can we add a backend service for the server-side tamper-evident audit pipeline? → A: NO. FairWins must stay in its current deployment footprint (React+Vite SPA served by nginx on Cloud Run, smart contracts on Polygon, IPFS/Pinata, Cloudflare edge, Cloud Logging) — no backend, no new compute. This replaces the server-side WORM/BigQuery audit pipeline with **on-chain consent-of-record** (the public chain is the immutable, fail-closed, queryable store) plus **existing Cloudflare/Cloud Run request logs** for geo/IP enforcement evidence; origin-lock is a Cloudflare-injected secret header verified in the existing nginx. The entry "21+" modal becomes a client-side notice gate whose legal weight is carried by the downstream on-chain consents (membership, wager, key registration) it precedes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Geographic access restriction that cannot be bypassed (Priority: P1)

A visitor from a restricted jurisdiction (a comprehensively-sanctioned country, the
United States under the current posture, or a prohibited gambling/prediction-market
jurisdiction) is denied access to FairWins before they can interact with the app —
and cannot reach the application by addressing the underlying origin directly.

**Why this priority**: This is the broadest, highest-stakes legal protection.
Comprehensively-sanctioned jurisdictions (OFAC) carry strict liability, so a single
served session from a prohibited location is a violation regardless of intent. A
geo-gate that only filters the "front door" while leaving the origin reachable is
theater; the gate is only real if it is enforced where the true end-user IP is
visible AND the origin refuses traffic that did not pass through the gate.

**Independent Test**: Issue requests from a permitted country, a comprehensively-
sanctioned country, the US, and a prohibited gambling jurisdiction — confirm only
the permitted country is served and the others receive a clear legal-reason refusal.
Separately, attempt to reach the origin directly (bypassing the edge, including from
a same-CDN-provider source spoofing the edge headers) and confirm the request is
refused. Delivers value standalone: the legal access boundary exists even before any
attestation or document work is built.

**Acceptance Scenarios**:

1. **Given** the default allowlist posture, **When** a visitor whose edge-observed
   country is not in the permitted set requests the site, **Then** they receive an
   HTTP 451 "Unavailable For Legal Reasons" response with a human-readable
   explanation, and no application content is served.
2. **Given** a visitor located in Cuba, Iran, North Korea, Syria, or the Crimea/
   Donetsk/Luhansk regions, **When** they request the site under any posture,
   **Then** access is denied — these jurisdictions are blocked unconditionally,
   including when their IP ranges are ambiguously labeled (e.g., occupied regions
   mislabeled as RU/UA).
3. **Given** a visitor located in the United States, **When** they request the site
   under the current posture, **Then** access is denied.
4. **Given** an actor who has discovered the origin's network address, **When** they
   send a request directly to the origin (not through the edge), **Then** the origin
   refuses the request rather than serving content.
5. **Given** a request that arrives at the origin carrying client-supplied geo/IP
   headers from a connection that is not cryptographically authenticated as the edge
   (including another tenant of the same CDN provider), **When** the origin processes
   it, **Then** the origin does not trust those headers and refuses the request.
6. **Given** a visitor whose country cannot be determined by the edge, **When** the
   default allowlist posture is in force, **Then** access is denied (fail-closed:
   "unknown" is not in the permitted set).
7. **Given** an operator changes the restricted-jurisdiction configuration, **When**
   the change is staged in preview/observation mode, **Then** the system records
   what *would* be blocked without enforcing, so the change can be validated before
   it takes effect.
8. **Given** the edge cannot evaluate the geo rule (edge/CDN evaluation failure),
   **When** a request arrives, **Then** access fails closed (denied) rather than
   serving ungated traffic.

---

### User Story 2 - On-chain wallet sanctions screening (Priority: P1)

When a user connects a wallet, FairWins screens the wallet address against an
authoritative on-chain sanctions list (and an operator-maintained discretionary
block-list). An address that is listed is blocked from proceeding (key generation,
membership, and at wager entry), and the screening outcome is recorded.

**Why this priority**: Geo-blocking addresses *location*; sanctions screening
addresses *identity at the address level*. OFAC SDN exposure is strict-liability and
not solved by IP filtering alone (a sanctioned party can appear from a permitted
location). On-chain screening closes that gap and is independent of the geo layer.
Because FairWins' contracts are publicly callable on Polygon, enforcement is
defense-in-depth: an app-layer screen (fast, blocks before gas) plus a non-bypassable
on-chain guard so a sanctioned address that calls the contracts directly is still
reverted.

**Independent Test**: Against a fork of the active network, connect a known
sanctioned address and a known clean address; confirm the sanctioned address is
blocked from proceeding and the clean address is allowed, that the unreachable-oracle
path fails closed, that a direct contract call from a sanctioned address reverts
on-chain (bypassing the app layer), and that all screening outcomes are recorded.
Delivers value standalone: sanctioned-address blocking works even before the
attestation copy is finalized.

**Acceptance Scenarios**:

1. **Given** a connected wallet whose address is on the on-chain sanctions list or
   the discretionary block-list, **When** the user attempts to proceed (generate
   keys, purchase membership, or enter a wager), **Then** the action is refused and
   the user is informed access is unavailable.
2. **Given** a connected wallet whose address is on neither list, **When** the user
   proceeds, **Then** screening does not block them.
3. **Given** an enforcement-level screening determination, **When** it blocks an action,
   **Then** the outcome is recorded on-chain (the reverted transaction / a deny-list
   event with address, network/chainId, and block timestamp); the advisory client-side
   pre-check needs no durable record.
4. **Given** the sanctions-screening source is unavailable, **When** a user attempts
   a screened action, **Then** the system fails closed (the action is refused rather
   than allowed unscreened) and the condition is surfaced/alerted.
5. **Given** a user who passed earlier screening, **When** they submit a wager,
   **Then** the wallet is re-screened and the eligibility representation is renewed at
   wager entry (matching the Terms' per-wager renewal), and the result is recorded.
6. **Given** a sanctioned address that bypasses the app entirely, **When** it calls
   the wager or membership-affecting contract directly, **Then** the on-chain guard
   reverts the transaction (the app-layer screen is not the only control).
7. **Given** an authorized admin adds an address to the discretionary block-list,
   **When** the change is applied, **Then** that address is blocked at the app layer and
   on-chain (via the deny-list), and the add is audit-logged with the admin's identity,
   timestamp, and reason.
8. **Given** an unauthorized actor, **When** they attempt to modify the on-chain
   deny-list, **Then** the transaction reverts — only the authorized admin role may
   update it.

---

### User Story 3 - Versioned, hash-addressed legal documents (Priority: P2)

A user (or later, an auditor) can read the FairWins Terms & Conditions, Risk
Disclosure, and Privacy Policy on the site, see a version identifier that is the
SHA-256 hash of the exact (canonicalized) document content, and retrieve any specific
past version by its hash so the precise text that was in force at any moment is
verifiable.

**Why this priority**: Every consent layer incorporates the legal documents by
reference, and every attestation record must name the exact version accepted. A
hash-based version makes the agreed text tamper-evident and reproducible: the
version string *is* a fingerprint of the content. This is foundational for the
attestation stories (they reference the version), so it is high priority but can be
built and demonstrated independently of the consent flows.

**Independent Test**: Open each document on the site; confirm each displays a version
string containing the content hash; recompute the hash from the served content using
the documented canonicalization and confirm it matches and is independently
reproducible; retrieve a prior version by its hash and confirm the exact text is
returned. Delivers value standalone: accessible, verifiable legal documents.

**Acceptance Scenarios**:

1. **Given** a published legal document, **When** a user opens it on the site,
   **Then** the document content is displayed together with a version identifier
   that is (or contains) the SHA-256 hash of that exact canonicalized content.
2. **Given** a displayed version string, **When** an independent party recomputes the
   hash from the served content using the documented canonicalization algorithm,
   **Then** the recomputed hash matches the displayed version (the version is a true,
   reproducible fingerprint of the content).
3. **Given** a document's content is changed, **When** the new version is published,
   **Then** it receives a new hash-based version and all prior versions remain
   retrievable by their hashes.
4. **Given** a recorded consent that names a document version, **When** an auditor
   retrieves that version by its hash, **Then** the exact text the user agreed to is
   returned and its hash re-verifies — for the full statutory retention window, even
   if that version is no longer the published one.
5. **Given** the Terms & Conditions, Risk Disclosure, and Privacy Policy, **When**
   they are published, **Then** each incorporates the others by reference, and the
   placeholder "Last updated · Version" header is populated with the real hash-based
   version.
6. **Given** an immaterial edit (e.g., a typo fix) produces a new content hash,
   **When** an operator marks the new version as immaterial, **Then** returning users
   are not forced to re-consent solely because the hash changed.

---

### User Story 4 - Entry eligibility notice gate (client-side) (Priority: P2)

On first arrival (before connecting a wallet), a visitor is presented with a
low-friction entry gate requiring an affirmative confirmation of eligibility and
acceptance of the Terms and Risk Disclosure. Because there is no backend, the gate is
a **client-side notice gate**: it blocks the app until acknowledged and records
acceptance in client state; its legal weight is carried by the downstream **on-chain**
consents (membership, wager, key registration) it precedes and the versioned documents
it links. The edge (Cloudflare/Cloud Run) request logs capture the country-of-record/IP
for the session as enforcement evidence.

**Why this priority**: This is the first-touch notice — it surfaces eligibility and the
versioned Terms/Risk Disclosure before any interaction, and carries the VPN/circumvention
warning. The durable records of record are the on-chain consents (US-5/US-6 and wager
creation).

**Independent Test**: Load the site fresh; confirm the gate blocks the app until the
user affirmatively acknowledges; accept and confirm the app becomes accessible and the
acknowledged document version is captured in client state; decline and confirm access is
withheld. Delivers value standalone: a first-touch eligibility notice that surfaces the
current versioned terms.

**Acceptance Scenarios**:

1. **Given** a first-time visitor (no prior acknowledgement in client state), **When**
   the site loads, **Then** an entry gate is shown before any application content,
   requiring the user to affirm: 21+, not a U.S. person and not in a restricted
   jurisdiction, not sanctioned, that access is lawful where they are located, and that
   they have read and agree to the Terms & Conditions and Risk Disclosure.
2. **Given** the entry gate, **When** the user selects "Enter" (affirmative), **Then**
   access is granted and the acknowledged document version(s) are captured in client
   state.
3. **Given** the entry gate, **When** the user selects "Leave" (decline), **Then**
   access is not granted.
4. **Given** the entry gate, **When** it is displayed, **Then** it links the current
   versioned Terms & Conditions and Risk Disclosure (by hash version) so the user sees
   exactly what they are acknowledging.
5. **Given** the entry gate, **When** it is displayed, **Then** it includes a clear
   warning that using a VPN, proxy, or any means to misrepresent location or
   eligibility breaches the Terms and voids access.
6. **Given** a geo-blocked visitor, **When** they request the site, **Then** they never
   reach the entry gate (Cloudflare returns 451 first), and the block is captured in the
   edge request logs.
7. **Given** a returning visitor who previously acknowledged (even if a newer *material*
   version has since published), **When** they revisit, **Then** they may browse without
   being hard-gated; the entry-gate skip is driven by client state, and any required
   re-acceptance is enforced authoritatively **on-chain** at their next consequential act
   (new wager / membership records the in-force version), so a forged client state cannot
   create a binding consent.

---

### User Story 5 - Membership purchase/upgrade attestation (Priority: P3)

When purchasing or upgrading a membership pass, the user must individually
acknowledge a set of discrete eligibility and risk attestations — each presented as
a separate, un-pre-ticked checkbox — and the accepted document version in force is
recorded **on-chain** with the membership purchase (block timestamp = the dated record);
the individual checkbox ticks are captured in client state.

**Why this priority**: This is the dated, versioned, itemized consent record — the
strongest documentary layer. It builds on the audit backbone (US-4) and the versioned
documents (US-3), so it follows them.

**Independent Test**: Begin a membership purchase/upgrade; confirm all checkboxes
are un-ticked by default and that the purchase cannot complete until each required
box is individually ticked; complete it and confirm each acknowledgement is recorded
with its own timestamp and the in-force document version. The audit-write step can be
exercised against a minimal standalone store for independent testing. Delivers value
standalone: an itemized, dated consent record tied to payment.

**Acceptance Scenarios**:

1. **Given** the membership purchase/upgrade step, **When** it is displayed, **Then**
   each attestation is a discrete checkbox, all un-ticked by default (no pre-ticked
   boxes), and the membership is clearly described as a non-refundable fee for access
   only — not a wager, stake, deposit, investment, security, or balance held on the
   user's behalf, conferring no ownership interest, no profit expectation, and no
   claim on any pool of funds.
2. **Given** the membership attestations, **When** the user attempts to confirm
   without ticking every required box, **Then** the purchase/upgrade cannot proceed.
3. **Given** the required attestations, **When** presented, **Then** they cover at
   minimum: (a) 21+; (b) not a U.S. person / not in a restricted jurisdiction; (c)
   not a sanctioned or restricted party (incl. OFAC SDN); (d) understanding that
   FairWins is not a registered exchange/broker/regulated operator, that there is no
   regulator or authority to appeal to, and that outcomes are settled by smart
   contract and the published dispute mechanism; (e) understanding of total-loss
   risk, sole tax responsibility, and sole key control; (f) no use of VPN/proxy to
   circumvent restrictions; and (g) having read and agreed to the Terms.
4. **Given** a completed membership attestation, **When** the membership purchase/upgrade
   transaction is submitted, **Then** the accepted document version in force is recorded
   **on-chain** with the membership (and emitted in an event), with the discrete
   checkbox acknowledgements captured in client state and reflected in the signed/confirmed
   transaction; no off-chain server record is created.
5. **Given** the membership transaction reverts or is not confirmed, **When** the user
   attempts to confirm membership, **Then** the consent fails closed by construction — no
   membership and no consent record exist until the transaction is mined.

---

### User Story 6 - Deterministic key-generation eligibility signature (Priority: P3)

When a user generates their account key, they sign a deterministic wallet message
that carries the standing eligibility facts and references the Terms generically.
The message contains no nonce or timestamp (so any key derived from it is
reproducible), the user is told the signature derives their account encryption key,
and the *event* of signing is dated by the on-chain key registration (KeyRegistry)
rather than by a date inside the signed payload.

**Why this priority**: This is the cryptographic, non-repudiable layer of the stack.
It depends on the existing key-generation/encryption and key-registration flow, so it
comes after the documents and membership layers.

**Independent Test**: Trigger key generation; confirm the presented message is
deterministic (byte-identical across repeated signings for the same account and
contains no nonce/timestamp) and that an independent party can reproduce both the
exact signed bytes and the recovered address from the documented serialization; confirm
the key registration is recorded on-chain (block timestamp = the dated record). Delivers
value standalone: a reproducible cryptographic eligibility attestation dated on-chain.

**Acceptance Scenarios**:

1. **Given** the key-generation step, **When** the message to sign is presented,
   **Then** it states the standing eligibility facts (21+, not a U.S. person, not in
   a restricted jurisdiction, not a sanctioned/restricted party, sole wallet
   control), references the Terms generically (e.g., "as published" at the Terms
   URL), includes the wallet address, and discloses that signing deterministically
   derives the account encryption key.
2. **Given** the key-generation message, **When** it is generated repeatedly for the
   same account, **Then** it is byte-identical each time (deterministic — no nonce,
   no timestamp, fixed serialization), so any encryption key derived from the
   signature is reproducible.
3. **Given** the user signs the message, **When** the key is registered on-chain
   (KeyRegistry), **Then** the registration transaction provides the dated record (block
   timestamp + recovered/registering address) for the signing event, without a date
   embedded in the signed payload; the session's country-of-record/IP remain only in the
   edge request logs.
4. **Given** the key-registration transaction reverts or is not confirmed, **When** the
   user signs, **Then** the flow fails closed by construction — only a confirmed on-chain
   registration counts as the dated record; an unconfirmed signing grants no standing.

---

### Edge Cases

- **Header spoofing at the origin / shared-CDN tenant**: a direct-to-origin request
  (or a request from another tenant of the same CDN provider) forging the
  edge-injected country/IP headers must not be trusted; the origin honors those
  headers only on connections cryptographically authenticated as the edge. A bare
  source-IP allowlist is insufficient on its own.
- **Unknown / undeterminable country**: under the allowlist posture, treat as denied
  (fail-closed); record the country-of-record as "unknown".
- **Edge/CDN outage or rule-evaluation failure**: if the geo-gate cannot evaluate,
  fail closed (deny) rather than serving ungated traffic.
- **Geo-data inaccuracy for occupied regions**: Crimea/Donetsk/Luhansk ranges are
  often mislabeled as RU/UA; the locked sanctioned-region set is enforced with
  conservative, subdivision-granular matching so ambiguous ranges covering those
  regions are denied.
- **Location drift across the stack**: a user permitted at entry whose membership,
  signing, or wager occurs from a restricted location — each access renews the
  eligibility representation, the geo-gate re-evaluates per request, and the
  country-of-record is captured at each event independently.
- **Newly-restricted location / newly-listed wallet mid-lifecycle**: a user blocked
  by a new list entry is stopped at the next gated action (incl. wager entry);
  previously-settled on-chain wagers are not reversed and fees are not refunded.
- **Document version drift mid-session**: if a document changes between when a user
  opens it and when they accept, the recorded version must reflect the exact text
  shown at the moment of acceptance, not a newer version.
- **Immaterial re-versioning**: a typo/whitespace fix changes the content hash; an
  operator-set materiality flag (not hash inequality) decides whether returning users
  must re-consent, so immaterial changes do not force re-consent and material ones do.
- **Terms change after a wager exists**: a wager is governed for its lifetime by the
  T&C version cryptographically bound to it at creation; a new (even material) version is
  prospective only and never retroactively governs an existing wager. Re-consent to a
  new material version attaches at the next consequential act (new wager / membership),
  not as a hard gate on browsing.
- **Content normalization for hashing**: the hash is computed over a single,
  documented canonical representation so trivial encoding differences (line endings,
  Unicode form, trailing whitespace, encoding) never change the hash for identical
  text, and the hash is reproducible by a third party.
- **Sanctioned wallet after entry**: a user may pass the entry gate (location-based)
  but connect a sanctioned wallet — wallet screening blocks them at that point.
- **Sanctions-source / audit-store unavailable**: both fail closed (refuse the
  action) and surface/alert, consistent with the fail-closed posture.
- **Lost-acknowledgement retry**: if the immutable record is written but the
  acknowledgement to the client is lost, a retry must not create a duplicate record
  (idempotent on event ID).
- **Audit completeness challenge**: defending against "you deleted/cherry-picked
  logs" requires detecting deletion/reordering, not just per-record immutability.
- **Declined / blocked visitors and privacy**: records for declined or geo/sanctions-
  blocked (non-consenting) visitors capture only the minimized, compliance-relevant
  fields, under a distinct lawful basis and bounded retention disclosed in the
  Privacy Policy.

## Requirements *(mandatory)*

### Functional Requirements

**Geographic restriction (geo-gate)**

- **FR-001**: The system MUST evaluate geographic access using the true end-user IP
  as observed at the network edge, not an address that only reflects intermediate
  infrastructure.
- **FR-002**: The system MUST support an **allowlist** posture (deny all locations
  except an explicitly permitted set) as the default operating mode, and a
  **denylist** posture (permit all except an explicitly blocked set) as an available
  alternative.
- **FR-003**: Regardless of posture, the system MUST unconditionally deny access from
  the comprehensively-sanctioned set — Cuba, Iran, North Korea, Syria, and the
  Crimea, Donetsk, and Luhansk regions — and these MUST NOT be removable except by an
  explicit, logged configuration change.
- **FR-004**: The system MUST deny access from the United States under the current
  posture, while allowing this specific entry to be revisited if a regulated route is
  later adopted.
- **FR-005**: The system MUST support a configurable ("tunable") set of additional
  prohibited jurisdictions (e.g., gambling/prediction-market bans such as France,
  Belgium, Singapore) that operators can adjust without code changes.
- **FR-006**: When access is denied for geographic reasons, the system MUST return an
  HTTP 451 ("Unavailable For Legal Reasons") response with a human-readable
  explanation of the geo-restriction (not a bare or generic error).
- **FR-007**: The origin (the Cloud Run service serving the SPA) MUST reject any request
  that did not pass through the edge geo-gate, so the geo-restriction cannot be bypassed
  by addressing the origin directly.
- **FR-008**: The origin MUST reject any request that is not authenticated as coming
  from the edge before serving content. Within the current footprint this is a
  high-entropy secret header injected by a Cloudflare Transform Rule and verified in the
  existing nginx (requests lacking/with a wrong secret are refused); a bare source-IP
  allowlist MUST NOT be the sole control because shared-CDN egress IPs let same-provider
  tenants spoof headers. Stronger cryptographic edge authentication (Cloud Run ingress
  restriction + Global LB frontend mTLS / Cloudflare Authenticated Origin Pulls) is a
  documented future hardening that lies outside the current footprint.
- **FR-009**: The system MUST derive a **country-of-record** from the edge-observed
  client IP (Cloudflare `CF-IPCountry`) and make it available for geo-enforcement
  evidence via the existing edge/Cloud Run request logs (no backend). On-chain consent
  records do NOT carry IP/country (privacy); the geo/IP evidence lives in the edge logs
  and is correlated to consents by time and, where present, wallet address.
- **FR-010**: Country determination MUST use ISO 3166-1 alpha-2 country codes (with
  subdivision codes where needed for occupied-region matching).
- **FR-011**: The system MUST support staging geo-configuration changes in a
  preview/observation mode that records what would be blocked before enforcement is
  applied.
- **FR-012**: The system MUST fail closed under the allowlist posture when the edge
  cannot determine a country, and when the edge cannot evaluate the geo rule at all
  (edge/CDN evaluation failure) — denying access rather than serving ungated traffic.
- **FR-013**: The system MUST acknowledge IP-geolocation accuracy limits and enforce
  the locked comprehensively-sanctioned regions with conservative, subdivision-granular
  matching, treating ambiguous ranges that may cover occupied regions (e.g.,
  Crimea/Donetsk/Luhansk mislabeled as RU/UA) as denied.
- **FR-014**: The system MUST periodically reconcile the locked comprehensively-
  sanctioned set against the authoritative OFAC source and log any additions, so the
  enforced list and Schedule A's open-ended category stay in sync.
- **FR-015**: The system MUST detect and flag known anonymizing infrastructure
  (VPN/proxy/Tor exit nodes, datacenter/hosting ASNs) as a recorded risk signal that
  informs the geo decision and supports the discretionary block/void path the Terms
  contemplate for circumvention.

**Wallet sanctions screening**

- **FR-016**: The system MUST screen a connected wallet address against an
  authoritative on-chain sanctions list before allowing the user to proceed to key
  generation, membership purchase, or wager entry. This app-layer screen is a
  **client-side (frontend) read** of the oracle via RPC for fast UX (advisory); it is one
  of two enforcement layers — the non-bypassable on-chain backstop required by FR-054 is
  what actually enforces (so a bypassed/forged frontend check cannot grant access).
- **FR-017**: The system MUST refuse to let a listed wallet proceed, and MUST inform
  the user that access is unavailable.
- **FR-018**: Enforcement-level screening outcomes MUST be recorded **on-chain**: a
  blocked attempt reverts on-chain (the failed transaction is the evidence), and every
  deny-list entry and mutation is an on-chain event (address, actor, reason, block
  timestamp). The advisory client-side pre-check needs no durable record.
- **FR-019**: If the sanctions-screening source is unavailable, the system MUST fail
  closed (refuse the screened action rather than allow it unscreened) and surface/
  alert the condition.
- **FR-020**: The system MUST provide an operator-maintained discretionary block-list
  of addresses associated with sanctioned activity or illicit finance (beyond on-chain
  SDN-list membership), to back the broader screening right asserted in the Terms (s.11),
  with the same fail-closed treatment as oracle screening. The block-list MUST be managed
  through an admin interface, MUST keep its own audit trail of every add/remove (acting
  admin identity, timestamp, reason), and MUST be enforced both at the app layer AND via
  an updatable, access-controlled on-chain deny-list consulted by the on-chain guard
  (FR-054). Risk-category/proximity scoring beyond list membership remains an explicit
  future extension on this seam.
- **FR-021**: The system MUST re-screen the wallet and renew the eligibility
  representation at wager entry (consistent with the Terms' per-wager renewal), record
  the result, and bind the in-force, accepted T&C version to the wager (see FR-056).
- **FR-022**: Production screening MUST query the real on-chain oracle on the active
  network — no mock, stub, or allow-all path in shipped code (mocks confined to test
  scope) — and screening results and on-chain consent records MUST be scoped to the
  network (chainId) on which they were produced and never honored across testnet/mainnet
  boundaries.

**Versioned legal documents**

- **FR-023**: The system MUST serve the FairWins Terms & Conditions, Risk Disclosure,
  and Privacy Policy on the site, accessible to users.
- **FR-024**: Each legal document version MUST carry a version identifier that is the
  SHA-256 hash of its exact canonicalized content, and the displayed "Last updated /
  Version" string MUST include that hash.
- **FR-025**: Each version MUST be individually addressable and retrievable by its
  hash, and publishing new content MUST create a new version while leaving all prior
  versions retrievable. Retrieval is from the FairWins versioned store / legal-hold copy
  (server-hosted); content-addressed or decentralized (e.g., IPFS) distribution is
  explicitly NOT required (clarified 2026-06-06), and verification is by recomputing the
  content hash from the returned bytes.
- **FR-026**: The content hash MUST be computed over a single, documented,
  version-pinned canonical representation (defining Unicode normalization form,
  line-ending policy, encoding, whitespace trimming, and whether the hash covers the
  document source or rendered text) so identical text always yields the same hash and
  the hash is independently reproducible by a third party.
- **FR-027**: The version string referenced by every attestation record MUST match
  the document version presented to the user at the moment of consent, so the exact
  text accepted can be retrieved and re-verified. Each consent event records only the
  version hash (a cheap reference) — no per-event document copy or external artifact is
  created.
- **FR-028**: The published Terms, Risk Disclosure, and Privacy Policy MUST incorporate
  one another by reference, and their placeholder version headers MUST be populated
  with the real hash-based version on publication.
- **FR-029**: The canonical bytes of each document version (retained once per version,
  NOT per event) MUST be held under the same write-once/retention regime as the audit
  records that reference it, so the exact accepted text remains reproducible for the
  full statutory retention window — not merely while the version remains published. No
  per-access or per-purchase document snapshot or content-addressed pin is required.
- **FR-030**: The system MUST track an operator-set "materiality" flag for each
  document version, distinct from the content hash; re-consent for returning users
  MUST be triggered by this flag (an authorized, audit-logged operator determination),
  not by content-hash inequality alone, so that immaterial re-versioning does not
  silently force re-consent and material changes are not silently skipped. Re-consent is
  enforced prospectively at the next consequential act (membership purchase/upgrade and
  new wager creation), NOT by hard-gating general browsing; existing memberships and
  existing wagers remain governed by the version in force when they were created (see
  FR-056–FR-059).

**Layered consent — entry gate**

- **FR-031**: On first visit (before wallet connection), the system MUST present an
  entry gate that requires the user to affirmatively confirm eligibility (21+, not a
  U.S. person / not in a restricted jurisdiction, not sanctioned, lawful where
  located) and acceptance of the Terms and Risk Disclosure before any application
  content is accessible.
- **FR-032**: The entry gate MUST provide an explicit decline path and MUST NOT grant
  access without affirmative acceptance.
- **FR-033**: The entry gate MUST display a VPN/proxy/circumvention warning.
- **FR-034**: A returning visitor who has already acknowledged a prior version MUST NOT
  be hard-gated from browsing by a new version; the current terms are shown and the
  binding re-acceptance of a new material version is enforced **on-chain** at the next
  consequential act (FR-030/FR-058 — the membership/wager records the in-force version).
  The entry-gate skip itself is driven by client state (no backend); because a forged
  client state cannot produce an on-chain consent, it cannot create a binding agreement.

**Layered consent — membership attestation**

- **FR-035**: At membership purchase or upgrade, the system MUST present discrete,
  individually-ticked attestation checkboxes, all un-ticked by default (no pre-ticked
  boxes).
- **FR-036**: The system MUST prevent completion of the membership purchase/upgrade
  until every required attestation checkbox is individually ticked.
- **FR-037**: The membership attestations MUST cover, at minimum: 21+; not a U.S.
  person / not in a restricted jurisdiction; not a sanctioned or restricted party
  (incl. OFAC SDN); acknowledgement that FairWins is not a registered exchange/broker/
  regulated operator and that there is no regulator or authority to appeal to and that
  outcomes settle by smart contract and the published dispute mechanism;
  acknowledgement of total-loss risk, sole tax responsibility, and sole key control;
  no VPN/circumvention; and having read and agreed to the Terms.
- **FR-038**: The system MUST present the membership pass as a non-refundable fee for
  access only — explicitly not a wager, stake, deposit, investment, security, or
  balance held on the user's behalf, conferring no ownership interest, no profit
  expectation, and no claim on any pool of funds, with fees not pooled, staked,
  wagered, or returned as winnings.
- **FR-039**: The system MUST record the accepted document version in force **on-chain**
  with the membership purchase/upgrade transaction (block timestamp = the dated record);
  the individual checkbox selections are captured in client state at confirmation time.

**Layered consent — key-generation signature**

- **FR-040**: At account key generation, the system MUST present a deterministic
  message for the user to sign with their wallet that carries the standing eligibility
  facts, references the Terms generically (as published, at the Terms URL), and
  includes the wallet address.
- **FR-041**: The key-generation message MUST contain no nonce and no timestamp, MUST
  remain stable for the life of the account, and MUST use a single documented
  byte-serialization (encoding, signing scheme, and address checksum casing) so any
  encryption key derived from the signature is reproducible and the recovered address
  is independently reproducible by a third party.
- **FR-042**: The system MUST NOT embed dated or versioned consent in the
  key-generation signed payload; the dated record is provided by the **on-chain key
  registration** (KeyRegistry block timestamp) instead.
- **FR-043**: The dated record of the key-generation signing event MUST be the on-chain
  key registration (block timestamp + registering address); the session's
  country-of-record/IP remain only in the edge request logs (no backend signing-event log).
- **FR-044**: The system MUST disclose to the user that signing this message
  deterministically derives their account encryption key (consistent with the Risk
  Disclosure), and the design MUST treat the **on-chain key-registration record** — not the
  signed payload — as the source of the signing's dated evidentiary weight. This
  one-time, wallet-bound signature is the per-account cryptographic anchor binding the
  wallet to acceptance of the Terms as published; per-event, version-specific consent is
  captured by the on-chain consent's version-hash reference (FR-027/FR-045), so no
  per-event cryptographic or content-addressed artifact is needed.

**Consent records & evidence (cross-cutting, no-backend)**

- **FR-045**: The legally-operative consents MUST be recorded **on-chain** as the
  records of record: (a) membership purchase/upgrade records the accepted T&C version
  hash and emits an event; (b) wager creation binds the governing T&C version hash into
  the wager (FR-056) and is itself an on-chain transaction; (c) key registration
  timestamps the deterministic eligibility signature. Each on-chain consent carries the
  wallet address, the referenced document version hash, and the block timestamp. The
  entry "21+" modal is a client-side notice gate (no server to record it) whose legal
  weight is carried by these downstream on-chain consents and the versioned documents
  they reference.
- **FR-046**: The on-chain consent records inherit the public blockchain's immutability
  and permanence (the chain is the tamper-evident store of record); the canonical bytes
  of each referenced document version are retained per FR-029 (SPA + per-version IPFS
  pin). No server-side WORM/BigQuery store is introduced.
- **FR-047**: Consent records MUST be queryable by wallet address via the chain
  (directly and/or via the subgraph indexer); geo/IP enforcement evidence MUST be
  queryable in the existing Cloud Logging request logs.
- **FR-048**: The consent records MUST be fail-closed by construction: an on-chain
  consent either commits or reverts — a reverted transaction grants no consent and
  leaves no partial record, so no consent action takes effect without its durable
  on-chain record. (There is no separate server-side audit write that could fail
  independently.)
- **FR-049**: On-chain consent recording MUST be idempotent at the contract-state level
  — re-submitting the same membership/version acknowledgement converges to the same
  state rather than creating contradictory records; client retries of a dropped
  transaction reconcile against on-chain state before re-submitting.
- **FR-050**: Completeness and ordering integrity for consent records MUST be provided
  by the blockchain itself (total ordering, immutability, and non-deletability of
  confirmed transactions); no additional hash-chaining layer is required for on-chain
  records.
- **FR-051**: Geo/sanctions-blocked and declined (non-consenting) visitors leave NO
  on-chain record (they never transact); their enforcement evidence is the existing
  Cloudflare/Cloud Run request logs, retained under the configured log-retention window
  and minimized to the compliance-relevant fields (country-of-record, IP, timestamp,
  decision). The Privacy Policy MUST disclose this edge logging.
- **FR-052**: Neither the on-chain records nor the edge request logs MUST contain
  secrets/credentials, and on-chain records MUST NOT contain off-chain PII (IP, user
  agent) — those remain only in the edge logs (data minimization across both surfaces).

**Cross-cutting quality requirements**

- **FR-053**: All new user-facing surfaces (entry gate modal, checkbox attestation
  set, document/version pages, the 451 page) MUST meet WCAG 2.1 AA — keyboard-operable,
  focus-trapped and labeled modal, programmatically-associated checkbox labels, and
  sufficient contrast — and MUST pass automated accessibility checks (axe/Lighthouse)
  in CI.
- **FR-054**: Sanctions enforcement MUST include a non-bypassable on-chain guard (in
  addition to the app-layer screen of FR-016): the wager and membership-affecting
  contracts MUST consult both the on-chain sanctions oracle and the updatable on-chain
  deny-list (FR-020) and revert transactions from listed addresses, so a listed party
  cannot evade screening by calling the contracts directly. The on-chain deny-list's
  update function MUST be access-controlled (only an authorized admin role may modify it)
  and MUST emit events on mutation. Because this is a `contracts/` change on the
  access-control risk axis, it MUST follow the constitution's Security-First principle
  (checks-effects-interactions; reentrancy and access-control-bypass guards; Slither and
  Medusa clean of new high/critical findings; EthTrust-SL L2 target with documented gaps;
  and a smart-contract-security review), with explicit security reasoning in the plan.
- **FR-055**: The Chainalysis oracle address, ABI, and network configuration consumed
  by the frontend MUST come from the generated contract-sync artifacts, never hand-copied
  or hardcoded.

**Wager-bound term governance** (clarified 2026-06-06)

- **FR-056**: At wager creation, the wager MUST be bound to the T&C version that is in
  force and accepted by the creator at that moment, with the governing version hash
  cryptographically incorporated into the wager's encrypted record (e.g., as
  authenticated associated data) so the binding is tamper-evident. This per-wager
  version binding is separate from the account encryption-key derivation, which remains
  versionless and deterministic per FR-041.
- **FR-057**: A wager MUST remain governed for its entire lifetime by the T&C version
  bound at creation; a later T&C version — even a material one — MUST NOT retroactively
  govern an existing wager. New versions apply prospectively only, to wagers created
  after they are in force.
- **FR-058**: To create a new wager, the creator MUST have accepted the in-force T&C
  version (re-accepting if it changed materially since their last acceptance); the
  newly-accepted version is the one bound to the wager (FR-056) and recorded with the
  on-chain wager creation.
- **FR-059**: The T&C version bound to any wager MUST remain retrievable and
  re-verifiable for at least the wager's lifetime plus the statutory retention window
  (per FR-029), so the exact governing terms of any historical wager can be reproduced.

### Key Entities *(include if feature involves data)*

- **Restricted-Jurisdiction Configuration**: the active posture (allowlist/denylist)
  and the three list buckets — comprehensively-sanctioned (locked), United States
  (posture decision), and tunable prohibited jurisdictions — expressed as ISO
  3166-1 alpha-2 (and subdivision) codes.
- **Country-of-Record**: the edge-derived country attributed to a request (Cloudflare
  `CF-IPCountry`), with any anonymizer/risk signal, used for gating and surfaced in the
  edge/Cloud Run request logs as geo-enforcement evidence.
- **Sanctions-Screening Result**: the outcome of screening a wallet address against the
  on-chain sanctions oracle and discretionary deny-list — enforced on-chain (a revert is
  the record) with an advisory client-side pre-check; deny-list state is on-chain.
- **Discretionary Block-List Entry**: an operator-maintained blocked address with its
  reason, the acting admin's identity, add/remove timestamps, and the on-chain deny-list
  reflection — each mutation captured in the block-list's admin audit trail.
- **Legal Document Version**: a published document (Terms, Risk Disclosure, or Privacy
  Policy) with its canonical content/bytes, document type, content-hash version, and
  operator-set materiality flag; individually retrievable by hash; prior versions
  retained.
- **Wager Term-Binding**: the governing T&C version hash cryptographically bound into a
  wager's encrypted record at creation (e.g., as authenticated associated data), fixing
  the rules that govern that wager for its lifetime — prospective-only and never
  retroactively changed by later versions.
- **On-chain Consent Record**: the record-of-record for a consequential consent — a
  membership purchase/upgrade (carrying the accepted document version hash + event), a
  wager creation (carrying the bound version hash), or a key registration — identified by
  wallet address and block timestamp; immutable and queryable on-chain.
- **Membership Attestation Set**: the discrete checkbox acknowledgements captured in
  client state at a membership purchase/upgrade, tied to the on-chain-recorded document
  version at confirmation time.
- **Key-Generation Signature**: the one-time deterministic signed message (recovered
  address derivable) whose dated record is the on-chain key registration — distinct from
  the signed message itself, which carries no date.
- **Edge Enforcement Log Entry**: the existing Cloudflare/Cloud Run request-log record of
  a geo/sanctions decision (country-of-record, IP, timestamp, decision) — the evidence
  tier for blocked/declined non-consenting visitors; retained per the log-retention window.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of requests originating from any comprehensively-sanctioned
  jurisdiction or the United States are denied access, verified with test traffic from
  each restricted region (including occupied-region ranges that may be mislabeled).
- **SC-002**: 0% of attempts to reach application functionality by addressing the
  origin directly (bypassing the edge) succeed — every such request is refused.
- **SC-003**: Geo-denied visitors receive a clear, human-readable legal-reason
  explanation (not a generic error or a broken page) in 100% of denial cases tested.
- **SC-004**: 100% of connected wallets are screened before proceeding, and known
  sanctioned addresses are blocked in 100% of test cases; unscreenable cases are
  blocked, never allowed through — verified via a fork test against the active network
  (known sanctioned address, clean address, and the unreachable-oracle fail-closed
  path), not mocks.
- **SC-005**: For any recorded consent, the exact document text the user agreed to can
  be retrieved and its content hash re-verified to match the logged version string,
  with 100% reproducibility, and an independent third party can reproduce the hash from
  the documented canonicalization.
- **SC-006**: Every completed consent action (membership purchase/upgrade, wager
  creation, key registration) produces a confirmed **on-chain** record carrying the
  accepted/bound document version hash; the record cannot be altered or deleted (chain
  immutability), and a retry of a dropped transaction reconciles against on-chain state
  rather than creating a contradictory record.
- **SC-007**: An auditor can retrieve the complete on-chain consent history for any
  given wallet address (which documents, which versions, when) via the chain/subgraph
  within 5 minutes, and can correlate geo/IP enforcement evidence for the relevant
  window from the edge request logs.
- **SC-008**: No pre-ticked attestation checkbox ever appears, and a membership
  purchase/upgrade cannot complete with any required box un-ticked, verified across
  all required attestations.
- **SC-009**: The key-generation message is byte-identical across repeated signings
  for the same account (deterministic), and both the recovered address and the derived
  key are independently reproducible from the pinned serialization.
- **SC-010**: A user can locate and open the current Terms, Risk Disclosure, and
  Privacy Policy from the site in under 30 seconds (within two interactions).
- **SC-011**: When a consent transaction reverts or is not confirmed, 0% of consent
  actions take effect (fail-closed by construction verified for membership purchase,
  wager creation, and key registration — no partial/orphan consent state).
- **SC-012**: A request carrying spoofed edge geo/IP headers from a connection that is
  not cryptographically authenticated as the edge (including a same-CDN-provider,
  different-tenant source) is refused in 100% of attempts — the spoofed geo is never
  honored.
- **SC-013**: When the edge cannot evaluate the geo rule (edge/CDN evaluation failure),
  access fails closed (denied) in 100% of tested cases.
- **SC-014**: Confirmed on-chain consent records cannot be deleted or reordered (the
  blockchain provides total ordering and immutability); the edge request logs are
  retained for the configured window for the geo-evidence tier.
- **SC-015**: All new UI surfaces (entry gate modal, checkbox attestation set, document
  pages, 451 page) pass automated WCAG 2.1 AA accessibility checks in CI.
- **SC-016**: A sanctioned address that calls the wager or membership-affecting
  contract directly (bypassing the app layer) is reverted on-chain in 100% of test
  cases, verified via a fork test — proving the sanctions control is non-bypassable.
- **SC-017**: A wager created under T&C version V remains provably governed by V after a
  newer version is published — the governing version hash is recoverable from the
  wager's encrypted record and re-verifies — in 100% of test cases, and no existing
  wager is ever retroactively re-bound to a newer version.
- **SC-018**: Every discretionary block-list add/remove is recorded with the acting
  admin's identity, timestamp, and reason, and an unauthorized attempt to modify the
  on-chain deny-list is reverted (access control verified) — in 100% of test cases.

## Assumptions

- **No backend / current footprint** (clarified 2026-06-06): The feature MUST stay
  within today's deployment footprint — React+Vite SPA served by **nginx on Cloud Run**,
  **smart contracts on Polygon** (137 + Amoy 80002), **IPFS/Pinata**, **Cloudflare** edge,
  and **Cloud Logging** (Cloud Run request logs). No backend service, no new compute, no
  WORM bucket, no BigQuery sink. "Server-side" needs are met on-chain, at the edge, or
  client-side.
- **Deployment topology**: Cloudflare (edge) observes the true client IP, does
  per-country detection, and filters with WAF custom rules; the Cloud Run origin (SPA +
  nginx) sits behind it. No load balancer / Cloud Armor is added (that would be new infra
  outside the footprint).
- **Origin lock**: A Cloudflare Transform Rule injects a high-entropy secret header that
  the existing nginx verifies (reject if missing/wrong) — the footprint-preserving
  load-bearing control for FR-007/FR-008. A bare edge-IP allowlist is insufficient alone.
  Cloud Run ingress restriction + Global-LB frontend mTLS / Authenticated Origin Pulls is
  documented as future hardening outside the current footprint.
- **Country-of-record source**: Cloudflare injects `CF-IPCountry` (and `CF-Connecting-IP`)
  which nginx forwards into the Cloud Run request logs; that is the geo/IP evidence tier.
  No backend reads these per consent event.
- **Sanctions list**: Wallet screening uses the Chainalysis on-chain Sanctions Oracle
  (the chosen authoritative source) read on the active network (Polygon), plus the
  discretionary block-list. Enforcement is defense-in-depth across **both** layers
  (clarified 2026-06-06): an app-layer screen (FR-016) for fast UX and a non-bypassable
  on-chain contract guard (FR-054) so listed addresses cannot proceed even via direct
  contract calls.
- **Existing flows reused**: A membership purchase/upgrade flow and a wallet
  signature-based account key-generation/encryption flow already exist; this feature
  adds the attestation gating, copy, and logging to them rather than building them
  from scratch.
- **Records of record are on-chain**: Tamper-evident, fail-closed, queryable consent
  records are provided by the public chain (membership purchase records the accepted T&C
  version + event; wager creation binds the version; key registration timestamps the
  eligibility signature) — no backend, WORM bucket, or queryable index is introduced;
  queryability by address is via the chain and the subgraph indexer.
- **Discretionary block-list administration** (clarified 2026-06-06): The block-list is
  managed via an admin UI with a full add/remove audit trail (actor, timestamp, reason)
  and enforced both at the app layer and via an updatable, access-controlled on-chain
  deny-list. The on-chain deny-list admin key follows the constitution's air-gapped
  floppy keystore flow; deny-list mutations are access-controlled and emit events; the
  admin UI is subject to the project's frontend standards (ESLint, accessibility).
- **Document storage & anchoring** (clarified 2026-06-06): Legal documents are served by
  the SPA and each **version** (not each event) is pinned to **IPFS/Pinata** and kept in
  the repo, versioned by SHA-256. The per-account cryptographic anchor binding a wallet to
  the Terms is the one-time deterministic key-generation signature; each subsequent
  consent records only the version hash **on-chain**. No document/IPFS artifact is created
  per site access or membership purchase, and the account-to-Terms binding stays tied to
  wallet control.
- **Canonicalization default**: Pending finalization in the plan, document hashing
  canonicalizes to Unicode NFC, LF line endings, UTF-8, with trailing-whitespace
  trimming, hashing the document source; the signed-message serialization uses UTF-8
  with the standard personal-sign (EIP-191) scheme and checksummed address casing.
- **Materiality flag**: Whether a new document version requires re-consent is an
  authorized operator decision recorded as a logged configuration change, independent
  of the content hash.
- **Legal copy is draft**: The three consent texts and the legal documents are drafts
  to be hardened with a gaming/CFTC attorney before launch; bracketed placeholders
  (governing law, arbitral institution, seat, contact, entity domicile, problem-gambling
  resources, confirmed prohibited-jurisdiction list) remain pending counsel and do not
  block building the gating mechanisms.
- **Retention window**: Accepted-user consent records live permanently on-chain (no
  expiry). Non-consenting-visitor evidence is the edge/Cloud Run request logs, retained
  under the configured Cloud Logging retention window (set to the applicable window
  pending counsel); the chain's immutability is what makes the consent record defensible.
- **Default posture**: The launch geo posture is allowlist (deny unless explicitly
  permitted); the specific permitted-country set is operator-curated configuration, not
  fixed by this spec (a defined launch set is needed for the "allow path" acceptance
  test — deferred to planning/ops).
- **Legacy wagers** (pre-dating versioned binding): wagers created before this feature
  are governed by the document version in force at this feature's launch (the first
  published version) and are not retroactively re-bound by later versions (the
  prospective-only rule of FR-057 protects them); exact migration handling is finalized
  in the plan.
- **Privacy basis**: Logging IP/country for declined and blocked visitors is treated as
  compliance evidence (the record of enforcement) under a documented lawful basis with
  data minimization; on-chain activity is pseudonymous per the Privacy Policy.
- **Test-first (constitution Principle II)**: Each functional area (geo decision logic,
  origin lock, sanctions screen, hash/version computation, each consent layer, audit
  write + fail-closed + idempotency + chain-of-custody) ships with automated tests at
  the appropriate level — Vitest for frontend logic (gate, screening read, hash/version,
  encrypted-metadata binding), Hardhat unit/integration tests for the SanctionsGuard,
  deny-list, on-chain version recording, and a fork test (Polygon 137) for the Chainalysis
  oracle read — and the full suite must pass in CI before merge.
- **CI fail-loud (Principle IV)**: All new code paths are wired into CI under the
  fail-loud policy (lint/type/build/test fail the pipeline; security scans fail on
  critical findings; no `continue-on-error` on these steps).
- **New core technologies (Additional Constraints)**: Only two genuinely new elements
  require constitution-check justification in `plan.md`: (a) the on-chain SanctionsGuard +
  admin deny-list contracts (and the external Chainalysis oracle dependency they read),
  and (b) the Cloudflare edge security configuration (WAF geo rule + secret-header
  Transform Rule) consumed by the existing nginx. No backend, WORM store, or BigQuery is
  added — the footprint is otherwise unchanged.
- **Secrets/keys (Additional Constraints)**: The only new secret is the Cloudflare→nginx
  origin-lock secret header; it follows the constitution's key/secret handling (never
  committed or logged; `.env` local; `.env.example` documents required vars; injected at
  runtime like the existing Pinata JWT). The deny-list admin key uses the air-gapped
  floppy keystore flow.

## Open Legal-Reconciliation Items (pending counsel)

These are alignment items between the implemented controls and the drafted documents;
they are tracked here so the plan and counsel can resolve them, and do not block
building the mechanisms:

- **T&C s.11 breadth**: The implemented screening is on-chain SDN list + discretionary
  block-list. Either narrow s.11 to match, or extend screening to risk-category/illicit-
  finance signals on the FR-020 seam, so represented and actual controls match.
- **T&C s.5 per-wager renewal**: Backed by FR-021 (re-screen + renew at wager entry);
  confirm the wager-entry attestation surface is acceptable or amend s.5.
- **T&C s.7 "immediately voids"**: Detection (FR-015) is in scope; automated
  void/forfeiture is discretionary/phased — align s.7 wording with the discretionary
  enforcement actually provided.
- **Privacy Policy**: Brought under the versioned/hash-addressed regime (FR-023/FR-028);
  confirm it is authored and that it discloses the compliance logging (FR-051).

## Dependencies

- Cloudflare (proxied/orange-cloud) on fairwins.app: WAF custom rule for the geo gate +
  a Transform Rule injecting the origin-lock secret header. (No Cloud Armor / load
  balancer added.)
- Existing nginx (in the Cloud Run container) extended to verify the origin-lock secret
  header and forward `CF-IPCountry`/`CF-Connecting-IP` into request logs.
- On-chain Chainalysis sanctions oracle reachable on Polygon mainnet (137), plus a
  Polygon-137 fork-test environment and a mock oracle for Amoy/local (no oracle on 80002).
- On-chain SanctionsGuard + admin deny-list contracts; existing WagerRegistry,
  MembershipManager, and KeyRegistry contracts (modified to consult the guard / record
  the accepted version).
- Existing wallet-connection, membership, key-generation/encryption, and IPFS/Pinata flows.
- Generated contract-sync artifacts extended to carry the oracle + guard + deny-list
  addresses/ABIs/network config (FR-055); the subgraph optionally extended to index
  consent/version events for address-keyed queryability.
- Legal counsel sign-off on the consent copy and documents before production launch.

## Out of Scope

- Finalizing or legally reviewing the document/consent wording (counsel's role; this
  feature hosts and versions whatever text is published).
- Identity verification / KYC with document upload or PII collection beyond self-
  attestation and on-chain/address screening.
- Risk-category / illicit-finance proximity *scoring* beyond on-chain list membership
  and the discretionary block-list (FR-020 provides the extension seam; scoring itself
  is future work).
- Automated void/forfeiture *enforcement* on circumvention detection (detection and the
  discretionary block path are in scope; automatic forfeiture is phased/discretionary).
- Fiat payment processing and any membership refund mechanism (membership is
  non-refundable per Terms).
- Selecting region-specific problem-gambling helpline resources (placeholder pending
  counsel).
- A separate dated, on-chain EIP-712 consent signature (noted as a possible future
  addition that must not be entangled with key derivation), unless later prioritized.
