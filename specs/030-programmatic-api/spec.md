# Feature Specification: Programmatic Read API with Tier-Based Rate Limiting

**Feature Branch**: `claude/app-api-architecture-klaomm`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "Programmatic REST API for FairWins providing authenticated read access to the platform's current features, with rate limits tied to on-chain membership tiers (None/Bronze/Silver/Gold/Platinum). Scope: read endpoints over existing subgraph + RPC data (wagers, wager detail, transfers/tax data, draw proposals, oracle conditions, vouchers, site/user stats, membership info), plus Sign-In With Ethereum (SIWE) authentication issuing API credentials, and membership-tier-based rate limiting (per-tier request quotas). Write endpoints are explicitly out of scope for this feature (deferred to a future phase) but the design must not preclude them. Documented via OpenAPI/Swagger. The service is the first off-chain backend, hosted in this monorepo and containerized onto Cloud Run behind Cloudflare like the frontend. Must respect network scoping (testnet/mainnet isolation), honest state (no mocks), and the project constitution."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read platform data programmatically (Priority: P1)

A developer or integrator wants to query FairWins data from their own application,
script, or agent without scraping the web UI or running their own subgraph
indexer. They obtain API credentials, call documented read endpoints (e.g. "list
my wagers", "get wager detail", "get site stats"), and receive structured,
network-scoped JSON responses.

**Why this priority**: This is the core value of the feature — programmatic access
to the data the app already exposes. Without it, nothing else matters. It is a
viable MVP on its own: a public, documented, rate-limited read API delivers
immediate value to integrators even before per-tier differentiation is rich.

**Independent Test**: Can be fully tested by authenticating, calling each read
endpoint against a known network, and asserting the response matches the
equivalent data the frontend renders for the same account/wager on that network.

**Acceptance Scenarios**:

1. **Given** a valid API credential, **When** the caller requests their wager
   list for a supported network, **Then** the API returns the same wagers
   (creator + opponent roles, paginated, with status) that the app shows for
   that account on that network.
2. **Given** a valid API credential, **When** the caller requests a specific
   wager's detail, **Then** the API returns the full wager state, its transfer
   history, and metadata references for that wager.
3. **Given** a request that omits or specifies an unsupported network, **When**
   the API processes it, **Then** it responds with a clear error and does not
   return data from a different network.
4. **Given** the upstream data source is unavailable, **When** a read is
   attempted, **Then** the API returns an honest error (not stale or fabricated
   data) and indicates the data source is degraded.

---

### User Story 2 - Authenticate by proving wallet ownership (Priority: P1)

A user proves control of an Ethereum address (the same address that holds their
membership) and receives an API credential scoped to that address. They use the
credential on subsequent requests. They can revoke or rotate the credential.

**Why this priority**: Authentication is the prerequisite for both per-account
data scoping and for tier-based rate limiting. Without identity, the API cannot
tie quotas to membership. It is tightly coupled to P1 read access and ships with it.

**Independent Test**: Can be tested by completing the sign-in challenge/response
flow with a wallet, receiving a credential, calling an authenticated endpoint
successfully, then revoking the credential and confirming subsequent calls are
rejected.

**Acceptance Scenarios**:

1. **Given** a wallet that can sign messages, **When** the user completes the
   sign-in challenge by signing the issued challenge, **Then** the API issues a
   credential bound to that wallet address.
2. **Given** an expired or tampered sign-in challenge, **When** the user attempts
   to redeem it, **Then** authentication fails with a clear error.
3. **Given** an issued credential, **When** the user revokes it, **Then**
   subsequent requests using that credential are rejected.
4. **Given** a credential, **When** it is presented after its validity period,
   **Then** the API rejects it and prompts re-authentication.

---

### User Story 3 - Rate limits reflect membership tier (Priority: P2)

A member with a higher tier (e.g. Gold) gets a higher request quota than a member
with a lower tier (e.g. Bronze) or an authenticated non-member (None). When a
caller exceeds their quota they receive a clear "rate limited" response that tells
them when they can retry. Anonymous/unauthenticated access (if allowed at all)
gets the most restrictive quota.

**Why this priority**: This is the differentiating monetization/fairness layer the
user explicitly asked for. It depends on P1 (read access) and P2-auth (identity +
tier resolution) being in place first, so it is the next increment.

**Independent Test**: Can be tested by authenticating as accounts of each tier and
confirming that the allowed request rate per window matches the configured quota
for that tier, and that exceeding it yields a rate-limit response with retry
guidance.

**Acceptance Scenarios**:

1. **Given** an authenticated caller whose address holds an active Gold
   membership, **When** they make requests up to the Gold quota within a window,
   **Then** all succeed; the request that exceeds the quota is rejected with a
   rate-limit response and retry-after guidance.
2. **Given** an authenticated caller whose address holds an active Bronze
   membership, **When** they reach the (lower) Bronze quota, **Then** they are
   rate-limited sooner than an equivalent Gold caller.
3. **Given** a caller whose membership has expired (effective tier None), **When**
   they make requests, **Then** they are limited at the None/default quota, not
   their former tier's quota.
4. **Given** a caller approaching their quota, **When** they make a request,
   **Then** the response communicates remaining quota and reset timing.

---

### Edge Cases

- **Tier changes mid-window**: a membership is purchased, upgraded, or expires
  between requests — the effective quota MUST reflect the current on-chain tier
  within a bounded, documented staleness window.
- **Address with no membership**: an authenticated address that has never held a
  membership resolves to the None tier and its quota.
- **Multiple networks**: the same address may have different membership/wager
  state per network; responses and any per-network quotas MUST NOT cross-
  contaminate testnet and mainnet.
- **Frozen / sanctioned accounts**: an address flagged on-chain (frozen or
  sanctions-screened) — the API MUST NOT expose privileged data or grant elevated
  quotas to it, consistent with on-chain gating.
- **Upstream lag**: the subgraph is behind chain head — responses MUST be honest
  about freshness and never fabricate missing records.
- **Credential abuse**: a single credential used from many sources, or many
  credentials minted for one address — quota MUST be enforced per identity
  (address), not merely per credential, so minting extra credentials cannot
  multiply quota.
- **Clock/window boundaries**: requests landing exactly on a window reset MUST be
  accounted consistently (no double-spend or lost allowance).
- **Pagination limits**: requests for very large result sets MUST be bounded by a
  maximum page size to protect the service.

## Requirements *(mandatory)*

### Functional Requirements

#### Access & Read Surface

- **FR-001**: The system MUST expose read-only HTTP endpoints that return the
  platform data the app currently consumes: a user's wagers (creator and opponent
  roles), individual wager detail, wager transfer history (tax/activity data),
  active draw proposals for a user, oracle conditions and their resolution state,
  vouchers and their lifecycle state, site-wide stats, per-user stats, and a
  user's membership info (tier, expiry, usage/limits).
- **FR-002**: Every read response MUST be scoped to a single, explicitly
  identified supported network, and the system MUST NOT return data from a
  different network than the one requested.
- **FR-003**: The system MUST return data that faithfully reflects real on-chain /
  indexed state; it MUST NOT return mock, stubbed, fabricated, or placeholder
  records in production paths.
- **FR-004**: When an upstream data source (indexer or chain RPC) is unavailable
  or degraded, the system MUST return an honest error response indicating
  degradation rather than stale-as-fresh or invented data.
- **FR-005**: List endpoints MUST support pagination and MUST enforce a maximum
  page size.
- **FR-006**: The system MUST publish machine-readable API documentation
  (OpenAPI) and a human-browsable documentation view, kept consistent with the
  actual endpoint behavior.
- **FR-007**: Write operations (creating, accepting, resolving, claiming, or
  otherwise mutating on-chain state) are OUT OF SCOPE for this feature; the API
  MUST NOT custody user private keys or sign transactions on a user's behalf. The
  design MUST NOT preclude adding non-custodial write support in a later phase.

#### Authentication & Identity

- **FR-008**: The system MUST allow a caller to authenticate by proving control of
  an Ethereum address via a challenge the caller signs with that address's wallet.
- **FR-009**: Upon successful authentication, the system MUST issue a credential
  bound to the proven address, with a defined validity period.
- **FR-010**: The system MUST allow a user to revoke an issued credential, after
  which requests using it are rejected.
- **FR-011**: The system MUST reject expired, revoked, malformed, or tampered
  credentials and challenges with clear errors.
- **FR-012**: The system MUST resolve the authenticated address to its current
  effective on-chain membership tier (None/Bronze/Silver/Gold/Platinum) per
  network, treating an expired membership as None.
- **FR-013**: Account-scoped data (e.g. "my wagers") MUST only be returned for the
  authenticated address, or MUST be limited to data that is already publicly
  observable on-chain. [NEEDS CLARIFICATION: Should any read endpoints be public
  (no credential), or must every request be authenticated? See Assumptions for the
  default taken.]

#### Rate Limiting

- **FR-014**: The system MUST enforce request rate limits keyed to the caller's
  effective membership tier, with higher tiers granted higher quotas.
- **FR-015**: The per-tier quotas MUST be configurable without code changes to the
  request-handling logic, and the configured values MUST be documented.
- **FR-016**: Rate limiting MUST be enforced per identity (authenticated address),
  such that minting additional credentials for the same address does not increase
  the address's total quota.
- **FR-017**: When a caller exceeds their quota, the system MUST reject the request
  with a standard rate-limit response that communicates when the caller may retry.
- **FR-018**: Responses to successful requests MUST communicate the caller's
  remaining quota and the window reset timing.
- **FR-019**: The effective tier used for rate limiting MUST reflect on-chain tier
  changes within a bounded, documented staleness window.
- **FR-020**: The system MUST apply a most-restrictive default quota to callers
  resolving to the None tier (and to anonymous callers, if any anonymous access is
  permitted).

#### Compliance, Safety & Operability

- **FR-021**: The system MUST NOT grant elevated quotas or expose privileged data
  to addresses that are frozen or fail on-chain sanctions screening, consistent
  with existing on-chain gating.
- **FR-022**: The system MUST NOT expose, log, or persist user private keys,
  mnemonics, or other secrets; signed challenges are used only to verify ownership.
- **FR-023**: The system MUST emit operational signals (health, error rates,
  rate-limit events) sufficient to monitor availability and abuse without logging
  sensitive data.
- **FR-024**: The system MUST handle the configured supported networks and clearly
  reject requests for unsupported networks.

### Key Entities *(include if feature involves data)*

- **API Consumer / Identity**: An Ethereum address that has authenticated. Carries
  the effective membership tier (per network), accumulated rate-limit usage, and
  associated credential(s). Tier and frozen/sanctioned status are derived from
  on-chain state, not stored authoritatively by the API.
- **Credential**: A revocable, time-bound token issued to an authenticated
  identity and presented on subsequent requests. Bound to one address; one address
  may have multiple credentials but shares one quota.
- **Sign-In Challenge**: A short-lived, single-use value the caller signs to prove
  address ownership.
- **Tier Quota Policy**: The mapping from membership tier (None/Bronze/Silver/
  Gold/Platinum) to a request quota over a defined window. Configurable.
- **Rate-Limit Counter**: The per-identity, per-window usage record consulted and
  updated on each request.
- **Read Resource**: The data objects exposed for reading — wager, wager transfer,
  draw proposal, oracle condition, voucher, site stats, user stats, membership
  info — each scoped to a network and mirroring existing app/subgraph entities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An integrator can authenticate and retrieve their wager list for a
  supported network using only the published documentation, with no access to the
  source code, in under 15 minutes from a standing start.
- **SC-002**: For every read endpoint, the data returned for a given account/wager
  on a given network matches the data the web app displays for the same input
  (100% agreement on the fields both surfaces expose).
- **SC-003**: No response ever returns data scoped to a different network than the
  one requested (0 cross-network leaks across the test matrix).
- **SC-004**: Callers of each membership tier are allowed exactly their configured
  quota per window and are rate-limited on the first request beyond it (verified
  for None, Bronze, Silver, Gold, Platinum).
- **SC-005**: Minting additional credentials for one address does not increase
  that address's effective quota (combined usage across credentials is capped at
  the tier quota).
- **SC-006**: A membership tier change (purchase/upgrade/expiry) is reflected in
  the caller's effective quota within the documented staleness window.
- **SC-007**: Rate-limited responses include actionable retry timing in 100% of
  cases, and successful responses include remaining-quota information.
- **SC-008**: When the upstream data source is forced into a degraded state, the
  API returns an honest degradation error rather than stale-as-fresh or fabricated
  data in 100% of probed cases.
- **SC-009**: No private keys, mnemonics, or secrets appear in any API response,
  log line, or persisted record (verified by inspection of the logging/storage
  surface).

## Assumptions

- **Read-only scope**: This feature delivers reads only. Write/transaction
  endpoints are deferred to a future phase; the design keeps that door open but
  implements no on-chain mutation and no key custody.
- **Authentication default**: Unless clarified otherwise (FR-013), the default
  taken is that account-scoped endpoints require authentication, while purely
  public on-chain aggregate data (e.g. site stats) MAY be served to authenticated
  callers under the same rate-limit regime; a small set of unauthenticated public
  endpoints is treated as optional and most-restrictively limited.
- **Tier source of truth**: Membership tier and frozen/sanctioned status come from
  existing on-chain state (membership management + sanctions/freeze gating) and the
  existing indexer; the API derives, but does not own, this state.
- **Data sources reused**: The API reads from the platform's existing indexer and
  chain RPC for the already-supported networks; it introduces no new authoritative
  store of platform/wager data. A store MAY be used for API-specific state
  (credentials, challenges, rate-limit counters).
- **Supported networks**: The API supports the same networks the platform already
  supports, with strict testnet/mainnet isolation.
- **Hosting**: The service lives in this monorepo and is deployed as a container
  behind the existing edge (Cloudflare) like the frontend; exact infrastructure
  details are resolved during planning.
- **Tier→quota values**: Specific numeric quotas per tier are a configuration
  decision to be finalized in planning; the spec requires only that they are
  tiered, configurable, documented, and enforced.
- **Honest finality**: Where on-chain state is non-final (challenge periods,
  pending oracle resolution), read responses surface that status truthfully rather
  than implying finality.
