# Feature Specification: White-label multi-tenant platform

**Feature Branch**: `claude/white-label-multi-tenant-m9uhsg` (feature id `072-white-label-tenants`)

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Evolve this into a white-label, multi-tenant platform where each
tenant (customer) can have an isolated instance with their own branding, configuration, and
(where appropriate) their own contract deployments. Smart contracts are on-chain. Each tenant
instance can be isolated. I need both strong isolation (especially for assets and contracts)
and full white-label capabilities (custom branding, custom domains, tenant-specific settings)."

## Overview

Today the platform is a single product with a single identity: one brand, one domain, one set
of contract deployments per network, one membership base, one treasury. Everything a member
sees and everything the contracts enforce assumes there is exactly one operator — FairWins —
and that every member belongs to it.

This feature turns that single product into a **platform that operators license**. A *tenant*
is a customer organization that runs its own instance of the platform: its own name, logo,
colors, and domain in front of its members; its own feature selection, fee schedule, and
network list; and — where value is at stake — its own contract deployments, so its members'
funds, memberships, roles, and treasury are isolated on-chain from every other tenant's.

Two properties are non-negotiable and in tension, and this spec holds both:

- **Strong isolation.** Assets, memberships, administrative authority, and treasury balances
  belong to exactly one tenant. Isolation for value-bearing state is enforced *on-chain* by
  separate contract instances — never by a frontend filter or a gateway check alone. A
  compromise or misconfiguration of one tenant must not be able to reach another tenant's
  funds or authority.
- **Full white-label.** A member of a tenant experiences a complete product under the
  tenant's identity. The platform's own brand does not leak into a tenant's UI, domain,
  metadata, notifications, or documents unless the tenant chooses to show it.

The existing FairWins product does not migrate anywhere: it becomes the **default tenant**,
whose manifest reproduces today's behavior byte-for-byte. A build with no tenant configured
is a FairWins build.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An operator launches a new branded tenant (Priority: P1)

The platform operator signs a customer. Using only configuration and the existing
deterministic deployment tooling — no code changes — they provision the tenant: record its
identity (name, brand assets, theme, legal and support links), choose its feature set and
networks, deploy its dedicated contract set on the networks it needs, and bind its custom
domain. A member who visits the tenant's domain sees a complete product under the tenant's
brand, can purchase the tenant's membership, and can create and settle wagers escrowed in the
tenant's own registry.

**Why this priority**: This is the product. If a tenant cannot be brought live from
configuration plus deployment records, there is no white-label business — every sale becomes
a fork of the codebase, which is exactly the outcome multi-tenancy exists to avoid.

**Independent Test**: Author a second tenant manifest beside the default one, run the
deployment tooling for a test network, build the frontend against the new tenant, and confirm
the resulting app carries only the new tenant's identity and resolves only the new tenant's
contract addresses.

**Acceptance Scenarios**:

1. **Given** a complete tenant manifest and a recorded contract set for a network, **When** the tenant's app is built and served, **Then** every member-visible surface (app name, logos, colors, page titles, PWA metadata, share text, document footers) shows the tenant's identity and none shows the platform default.
2. **Given** a tenant manifest that enables a subset of features, **When** the tenant's app renders, **Then** disabled features are absent from navigation and routes — not present-but-broken.
3. **Given** the tenant's recorded contract set, **When** a member creates a wager or purchases a membership, **Then** the transaction is escrowed/settled in the tenant's own contracts and never in another tenant's or the default tenant's.
4. **Given** a tenant manifest missing a required field or referencing an undeployed contract on an enabled network, **When** the build or app starts, **Then** it fails loudly (build) or degrades honestly by naming what is missing (runtime) — it never silently falls back to another tenant's value.

---

### User Story 2 - Tenant isolation holds on-chain and off (Priority: P1)

Members and administrators of tenant A interact only with tenant A's estate. Tenant A's
membership grants nothing in tenant B's app; tenant A's admin keys hold no role in tenant B's
contracts; fees accrued from tenant A's members flow only to tenant A's treasury; and no
frontend, gateway, or indexing surface shows tenant B's members, wagers, or balances inside
tenant A's instance.

**Why this priority**: Isolation is the trust promise being sold. A single cross-tenant fund
path or authority path is a platform-ending defect, and it must be impossible by
construction (separate contract instances), not merely unlikely by filtering.

**Independent Test**: Deploy two tenants' contract sets on one test network. Verify a member
with tenant A membership is unentitled in tenant B's app; verify tenant A's admin cannot call
admin functions on tenant B's contracts; verify a fee-bearing action in tenant A credits only
tenant A's treasury; verify tenant B's wagers are invisible in tenant A's app and indexes.

**Acceptance Scenarios**:

1. **Given** two tenants with dedicated contract sets on the same network, **When** a member of tenant A opens tenant B's app, **Then** they are treated as a non-member of B, offered B's purchase path, and their A-membership is neither recognized nor revealed.
2. **Given** an account holding an admin role in tenant A's contracts, **When** it attempts the same admin action against tenant B's contracts, **Then** the contracts revert; no shared role or key grants authority across tenants.
3. **Given** fee-bearing activity in tenant A, **When** fees settle, **Then** they accrue only in tenant A's fee router/treasury, and tenant B's treasury reads are unaffected.
4. **Given** tenant A's app, gateway, and index, **When** queried by any means they expose, **Then** no wager, pool, member, balance, or event originating in tenant B's contracts is returned.
5. **Given** a relayer/gateway instance serving a tenant, **When** it receives an intent addressed to a contract outside that tenant's recorded contract set, **Then** it refuses the intent.

---

### User Story 3 - Existing FairWins behavior is preserved as the default tenant (Priority: P1)

Nothing changes for today's members. The FairWins app, domain, contracts, membership base,
and treasury continue exactly as they are; internally they are now described by the default
tenant's manifest rather than by scattered hardcoded values.

**Why this priority**: The migration risk is regression of a live product. Making the default
tenant the first consumer of the tenant abstraction proves the abstraction is real while
guaranteeing the live product is untouched.

**Independent Test**: Build the app with no tenant override and diff observable behavior
against the pre-feature build: same name/branding, same contract addresses resolved, same
features enabled, same fees disclosed. Existing test suites pass unmodified.

**Acceptance Scenarios**:

1. **Given** a build with no tenant specified, **When** it starts, **Then** it is the FairWins product: identical branding, contract addresses, feature set, and fee behavior to the pre-feature build.
2. **Given** the existing frontend and contract test suites, **When** run after this feature lands, **Then** they pass without weakening.

---

### User Story 4 - A tenant administrator manages their own instance (Priority: P2)

A tenant's own administrator — not the platform operator — signs in to their instance's admin
surface and manages what is theirs: brand assets and theme, support/legal links, membership
tier pricing, fee rates within platform-set caps, and feature toggles the operator has made
available to them. They cannot touch another tenant, and they cannot exceed the guardrails
(fee caps, mandatory compliance surfaces) the platform sets.

**Why this priority**: Self-service is what makes tenants cheap to operate, but it is
worthless before US1–US3 exist, and every control it exposes must respect the isolation and
guardrails those stories establish.

**Independent Test**: As tenant A's admin, change a fee rate within cap and a brand asset;
confirm both take effect in tenant A only. Attempt to exceed the fee cap and confirm refusal.
Confirm tenant A's admin surface offers no control naming tenant B.

**Acceptance Scenarios**:

1. **Given** a tenant admin authorized in their tenant's contracts, **When** they adjust a fee rate at or below the platform cap, **Then** the change takes effect for their tenant and is disclosed to members before signature, per existing fee rules.
2. **Given** a tenant admin, **When** they attempt to set a fee above the platform cap, **Then** the change is refused on-chain, not merely hidden in the UI.
3. **Given** a tenant admin, **When** they update branding or settings, **Then** the change affects only their tenant's instance.

---

### User Story 5 - A tenant starts shared and graduates to dedicated deployments (Priority: P3)

A small customer launches as a **branding-only tenant**: their own domain, identity, and
settings in front of the platform's shared contract estate (shared membership, shared
registry, platform treasury). Later, when their volume justifies it, the operator provisions
dedicated contracts and the tenant's members are pointed at the new estate going forward,
with the transition disclosed honestly (existing positions settle where they were opened;
new activity opens on the dedicated estate).

**Why this priority**: It lowers the cost of acquiring small tenants, but it is an economic
optimization on top of the isolation model — never a substitute for it. A tenant on shared
contracts has cosmetic isolation only, and the platform must say so plainly to the tenant.

**Independent Test**: Configure a tenant whose manifest points at the shared contract set;
confirm the branded app works end-to-end against shared contracts. Then repoint the manifest
at a dedicated set and confirm new activity lands on the dedicated contracts while previously
opened wagers remain claimable where they were escrowed.

**Acceptance Scenarios**:

1. **Given** a branding-only tenant manifest, **When** its app runs, **Then** all value flows use the shared estate and the tenant's operator-facing documentation states that asset isolation is not in effect.
2. **Given** a tenant graduating to dedicated contracts, **When** the manifest is repointed, **Then** new wagers/memberships use the dedicated estate and existing escrowed positions remain resolvable and claimable at their original addresses.

---

### Edge Cases

- A domain reaches the platform that no tenant manifest claims: the request must not render
  any tenant's instance (including the default) with another tenant's data; it lands on a
  neutral "unknown instance" response.
- A tenant's manifest enables a network on which its contract set has no recorded deployment:
  the network is treated as not-deployed for that tenant (honest absence), never resolved via
  another tenant's addresses.
- Two tenants' manifests claim the same domain, or a manifest claims the platform's own
  domain: provisioning validation refuses the manifest.
- A tenant is suspended by the operator: its app states unavailability honestly; members'
  on-chain positions remain claimable directly (a suspension must never trap value —
  contracts do not know about suspension).
- A member holds memberships in two tenants from one wallet: each instance sees only its own
  membership; neither instance reveals the other's existence.
- Tenant branding assets fail to load: the instance degrades to neutral placeholders, never
  to another tenant's or the platform's brand.
- The tenant registry/manifest store is unreachable at runtime: already-built tenant apps
  (which carry their manifest) keep working; anything requiring a live manifest read degrades
  honestly.
- A backup/sync object created in one tenant's instance is restored in another tenant's
  instance: tenant-scoped data does not cross; the restore surfaces what was skipped and why.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST define a **tenant manifest** as the single source of truth for
  a tenant's identity (name, brand assets, theme tokens, domains, legal/support links),
  settings (features, networks, fee services, membership tiers), and **contract set**
  (per-network addresses for every platform contract the tenant uses). No shipped code path
  may hardcode a tenant identity value that the manifest defines.
- **FR-002**: The system MUST resolve every member-visible identity surface (app name, logos,
  favicon, theme colors, page titles, PWA manifest, share/QR text, notification copy,
  document/report headers and footers, email/legal links) from the active tenant manifest.
- **FR-003**: The system MUST resolve all contract addresses for the active tenant from the
  tenant's contract set, layered on the existing per-network deployment records; a contract
  absent from the tenant's set on a network MUST read as not-deployed for that tenant there.
- **FR-004**: Dedicated-tenant provisioning MUST reuse the existing deterministic deployment
  scripts to produce a complete, recorded, per-tenant contract set (registry, membership,
  fee router, and the optional modules the tenant enables), with per-tenant admin/guardian
  keys and per-tenant treasury addresses.
- **FR-005**: Isolation of value-bearing state between dedicated tenants MUST be enforced by
  distinct contract instances. No frontend, gateway, or indexer check may be the only barrier
  between one tenant's assets/authority and another's.
- **FR-006**: The default (FairWins) tenant manifest MUST reproduce current behavior exactly;
  a build with no tenant selected uses the default manifest.
- **FR-007**: Tenant selection MUST be determined at build/serve time per instance (one
  origin, one tenant); a served instance MUST NOT switch tenants based on client-side input.
- **FR-008**: Manifest validation MUST fail provisioning/build loudly on: missing required
  identity fields, unclaimed or conflicting domains, fee rates above platform caps, enabled
  features whose required contracts are absent from the contract set on every enabled network.
- **FR-009**: The gateway/relayer layer MUST be tenant-scoped: an instance serving a tenant
  MUST accept intents/sponsorship requests only for addresses in that tenant's contract set,
  and per-tenant quotas/killswitches MUST be independent.
- **FR-010**: Indexing MUST be tenant-scoped: a tenant's instance queries an index (or index
  scope) covering only its own contract set.
- **FR-011**: Tenant administrators MUST be able to change tenant-scoped settings only within
  platform guardrails, with value-affecting guardrails (fee caps) enforced on-chain in the
  tenant's own contracts.
- **FR-012**: Platform-operator tooling MUST support the tenant lifecycle: create (validate
  manifest), provision (deploy/record contract set), bind domain, suspend/resume, and
  graduate a branding-only tenant to dedicated contracts — each step auditable.
- **FR-013**: Suspension or decommissioning of a tenant MUST NOT trap member value: on-chain
  positions remain resolvable/claimable via direct contract interaction, and the platform
  MUST document that path.
- **FR-014**: Member-scoped stored data (preferences, backups, address books, activity
  ledger) MUST be scoped so data created under one tenant is not read into another tenant's
  instance.
- **FR-015**: Branding-only (shared-estate) tenants MUST be supported as an explicit manifest
  mode, with operator-facing disclosure that asset isolation is not in effect; graduation to
  dedicated contracts MUST preserve claimability of positions opened on the shared estate.

### Key Entities

- **Tenant**: A customer organization operating an instance. Identity + settings + contract
  set + lifecycle state (draft, live, suspended, retired). Exactly one manifest per tenant.
- **Tenant Manifest**: The validated document describing a tenant. Versioned; the record of
  what the tenant's instance is built and served from.
- **Contract Set**: A per-tenant, per-network mapping of platform contract names to deployed
  addresses, layered over the existing deployment-record format. May be `shared` (points at
  the platform estate) or `dedicated` (tenant-owned proxies with tenant-held admin keys).
- **Instance**: A served origin (domain) bound to exactly one tenant manifest and one
  environment cohort (mainnet or testnet), running the frontend and any tenant-scoped
  gateway/index services.
- **Default Tenant**: The manifest reproducing today's FairWins product; the fallback for
  builds with no tenant configured and the reference for regression testing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new branding-only tenant can be brought live by authoring a manifest and
  serving a build — zero application-code changes — and a new dedicated tenant additionally
  requires only running the existing deployment tooling.
- **SC-002**: In a two-tenant test deployment, automated isolation tests show zero
  cross-tenant results across all probed surfaces: membership recognition, admin authority,
  fee accrual, wager visibility, and gateway intent acceptance.
- **SC-003**: The default-tenant build is behaviorally identical to the pre-feature build:
  existing frontend and contract test suites pass unmodified, and resolved contract addresses
  are unchanged on every supported network.
- **SC-004**: An audit of a built tenant instance finds no platform-brand string, asset, or
  domain in member-visible surfaces beyond what the tenant's manifest opts into.
- **SC-005**: Every tenant lifecycle action (create, provision, bind, suspend, graduate) is
  recorded in an auditable artifact identifying who, what tenant, and when.

## Assumptions

- The platform operator (FairWins) remains the deployer/operator of record for tenant
  provisioning; tenants do not self-deploy contracts in v1. Tenant admin keys may be handed
  to the tenant after provisioning per the existing key-management workflow.
- One served origin maps to exactly one tenant (per-instance builds/config), rather than one
  origin dynamically serving many tenants; this matches the strong-isolation requirement and
  the existing static-hosting model. Multi-tenant-per-origin serving is out of scope for v1.
- Per-tenant subgraph/indexing scope may initially be delivered by address-filtering at the
  query layer for shared-estate tenants and by dedicated index deployments for dedicated
  tenants; a shared cross-tenant index is acceptable only where the query layer cannot leak
  another tenant's data into an instance.
- Contract *code* is shared (same audited implementations); isolation comes from separate
  proxy instances and storage, not from per-tenant forks. Tenants do not get custom contract
  logic in v1.
- Existing constitution rules (security-first contracts, honest state, deterministic
  deployments, no secrets in repo) apply unchanged to every tenant instance.
- Billing/settlement between the platform and tenants (revenue share on tenant fees) is
  out of scope for v1 beyond what per-tenant fee routers already make accountable.
