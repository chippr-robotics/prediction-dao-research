# Phase 0 Research: Token Mint & Compliant Token Administration

This document resolves the open decisions deferred by `spec.md` (Assumptions) and the Technical Context, so the
design (Phase 1) has no unresolved unknowns.

## R1. How to deliver the four token classes

**Decision**: One upgradeable platform authority (`TokenFactory`) deploys per-issuer tokens. Open ERC-20/721 and
ERC-1404 are produced as **minimal-proxy clones** of pre-deployed implementation templates. ERC-3643/T-REX
tokens are produced via the **vendored canonical T-REX suite**. The factory records all tokens in one
network-scoped registry.

**Rationale**: The clone pattern (from the archived `TokenMintFactory`) keeps issuance gas low and is proven for
open/restricted tokens that need only standard ERC behavior plus a screening hook. The permissioned class needs
a full identity/compliance framework, which is exactly what the T-REX suite provides — re-implementing it would
violate Principle I. A single registry + single issuance role gives a uniform discovery and admin surface across
all classes.

**Alternatives considered**:
- *One monolithic token contract with feature flags* — rejected: bloats every token with unused compliance code,
  harder to audit, and cannot express ERC-3643's multi-contract identity/compliance topology.
- *Deploy full bytecode per token (no clones)* — rejected: far higher issuance gas for the open/1404 classes
  with no benefit (templates are immutable anyway).

## R2. ERC-3643 / T-REX — vendor vs. build

**Decision**: Vendor the audited reference implementation: `@tokenysolutions/t-rex` (token + Identity Registry
+ Identity Registry Storage + Modular Compliance + Claim Topics Registry + Trusted Issuers Registry, plus the
TREX factory/gateway for per-token suite deployment) and `@onchain-id/solidity` (ONCHAINID identity + claims).
Use them **unforked**; integrate, don't modify.

**Rationale**: ERC-3643 *is* the T-REX design; its security rests on identity/claim/compliance crypto that is
already audited and widely deployed. Constitution Principle I prioritizes secure, proven patterns and forbids
new high/critical findings — re-rolling this stack would invert that. Vendoring also future-proofs against
standard updates.

**Integration points**:
- The platform's `SanctionsGuard` is exposed to T-REX tokens as a **compliance module**
  (`SanctionsComplianceModule`) implementing the modular-compliance interface and delegating
  `canTransfer/transferred/created/destroyed` checks to `SanctionsGuard.isAllowed`. This keeps sanctions
  non-bypassable for the permissioned class without forking T-REX.
- `TokenFactory` invokes the T-REX deployment path (factory/gateway) and records the resulting token + suite
  addresses in its registry, so discovery and the admin surface treat all classes uniformly.

**Alternatives considered**:
- *Build a minimal ERC-3643-compatible subset in-house* — rejected per Complexity Tracking: high-risk,
  non-standard, and unaudited.
- *Skip T-REX, offer only ERC-1404* — rejected: T-REX is an explicit requirement (FR-005, User Story 4) and the
  main "compelling platform" differentiator the user asked for.

**New dependency note**: This is the single justified new core dependency (see plan Complexity Tracking). It is
added to `package.json`, pinned, and its contracts are deployed via scripts — never copied into `contracts/`.

## R3. ERC-1404 enforcement model

**Decision**: The `RestrictedERC20` template implements the Simple Restricted Token interface —
`detectTransferRestriction(from, to, value) returns (uint8)` and `messageForTransferRestriction(uint8) returns
(string)` — and enforces the **same** policy inside its transfer hook (`_update`), reverting with the matching
reason when a transfer is restricted. Restriction codes are a small fixed enum (e.g. `0 = SUCCESS`, `1 =
SENDER_NOT_ELIGIBLE`, `2 = RECIPIENT_NOT_ELIGIBLE`, `3 = SENDER_FROZEN`, `4 = SANCTIONED`), each mapped to a
human-readable message.

**Rationale**: Enforcing the identical policy in both the detector and the transfer path guarantees the
pre-transfer eligibility check and the actual transfer agree (FR-009, SC-003). A fixed enum keeps messages
deterministic and gas-cheap.

**Policy admin**: Per-token eligibility list + per-account freeze are mutated by the token's owner/admin
(FR-010); sanctions is always consulted via `SanctionsGuard` (fail-closed). The "more restrictive wins" rule
from the spec edge cases is satisfied by checking sanctions and freeze before eligibility.

**Alternatives considered**: Off-chain allowlist signatures — rejected: not honest on-chain state, can't be
checked by third-party wallets/explorers via the standard interface.

## R4. Issuance authorization & platform-role integration

**Decision**: `TokenFactory` defines `TOKEN_ISSUER_ROLE` in its own `AccessControl` (via `UUPSManaged`), granted
by the platform's air-gapped floppy-keystore admin (`DEFAULT_ADMIN_ROLE`) — the same actor that administers
`MembershipManager` and `SanctionsGuard`. Issuance is additionally gated by the issuer passing `SanctionsGuard`
screening at creation time. Membership-tier gating (requiring an active membership to be granted the issuer
role) is supported as an admin policy but not hard-coded.

**Rationale**: Every contract in this system holds its own roles granted to the shared admin (see
`MembershipManager`, `SanctionsGuard`); the factory follows that established pattern rather than introducing a
parallel permission system (FR-022). Keeping issuer-granting at the admin/role-manager layer mirrors
`grantMembership`. This avoids a hard runtime dependency on `MembershipManager` while still integrating with the
platform's single access-control authority.

**Alternatives considered**:
- *Factory calls `MembershipManager.hasRole(...)` on every creation* — rejected for v1: couples issuance to
  membership state and adds an external call; the role-on-factory model is simpler and equally controlled, and
  tier-gating can be layered by only granting the issuer role to members.
- *Open, permissionless issuance* — rejected: conflicts with FR-007 and the platform's role-based model.

## R5. Non-bypassable sanctions across all classes

**Decision**: All four classes enforce `SanctionsGuard`:
- **Open ERC-20/721 & ERC-1404**: a fail-closed `SanctionsGuard.isAllowed` check on sender and recipient in the
  token's transfer hook (`_update`), plus issuer screening at creation.
- **ERC-3643**: via the `SanctionsComplianceModule` bound to the token's Modular Compliance.

**Rationale**: FR-021 requires sanctioned addresses cannot create, send, or receive for *any* standard. The
check is a Checks-phase staticcall (CEI preserved) and reuses the existing audited guard. Fail-closed semantics
match `SanctionsGuard`'s existing contract (a configured-but-unreachable oracle denies).

**Cost note**: One extra staticcall per transfer; acceptable and consistent with how `WagerRegistry`/
`MembershipManager` already consult the guard.

## R6. Upgradeability scope (factory vs. issued tokens)

**Decision**: Only `TokenFactory` is platform-upgradeable (UUPS via `UUPSManaged`, append-only storage +
`__gap`, registered in `check:storage-layout`). Issued **open and ERC-1404 tokens are immutable** clones — once
created, their logic never changes. **ERC-3643 tokens** use the T-REX suite's own proxy/ownership model
(upgraded, if ever, only by their token owner per the standard), which the platform does not manage.

**Rationale**: The factory holds state and authority, so it must be upgradeable to fix bugs / extend classes
without losing the registry. Individual issued tokens carry no platform state and benefit from immutability
(stronger guarantees for holders, simpler audit). This matches the spec assumption and CLAUDE.md's upgradeable
guidance (new upgradeable contracts inherit `UUPSManaged`, keep storage append-only).

**Alternatives considered**: Making every issued token UUPS — rejected: large attack surface and admin burden
for no platform benefit; holders generally prefer immutable open tokens.

## R7. Deployment, indexing, and frontend wiring

**Decision**:
- **Deploy** (`scripts/deploy/deploy.js` + `lib/upgradeable.js`): deploy implementation templates and the
  `SanctionsComplianceModule`; deploy/wire the T-REX suite; deploy `TokenFactory` as proxy+impl; grant roles to
  the floppy admin; record all addresses in `deployments/*.json` (`tokenFactory`, `tokenFactoryImpl`, template
  addresses, suite addresses). Register `TokenFactory` in `check:storage-layout`.
- **Index**: a subgraph datasource on `TokenFactory.TokenCreated` provides network-scoped discovery and the
  issuer's admin list.
- **Frontend**: rebuild as a creation wizard, a token list (subgraph + on-chain reads), and a per-token admin
  surface that reads the token's standard/capabilities and renders only valid controls. All addresses/ABIs from
  `sync:frontend-contracts`; honest pending/confirmed/failed tx state; network-scoped; disabled on unsupported
  networks. No mock flows (the archived mock UI is not reused).

**Rationale**: Mirrors how every other feature in the repo deploys, indexes, and surfaces contracts (Principles
III & V), and reuses the 025/027 upgrade tooling unchanged.

## R8. Explicit scope exclusions (confirmed)

- **DEX listing**: the archived `listOnDex` placeholder is **out of scope** (no stubbed feature ships —
  Principle III). May be a later spec.
- **Platform governance token**: the archived `FairWinsToken` use case is **out of scope** here; this feature
  delivers the issuance machinery only. A specific governance token belongs to the forthcoming DAO-manager
  feature (spec 029), which can consume this factory.

## Summary of resolved unknowns

| Unknown (from spec/Technical Context) | Resolution |
|---------------------------------------|------------|
| Per-token upgradeability | Factory upgradeable; open/1404 tokens immutable; 3643 uses T-REX's own model (R6) |
| On-chain identity provider | ONCHAINID + T-REX reference suite, vendored audited (R2) |
| Issuance role / membership integration | `TOKEN_ISSUER_ROLE` on factory, granted by shared admin; sanctions-screened; optional tier-gating (R4) |
| ERC-1404 enforcement | Detector + transfer-hook parity, fixed reason enum (R3) |
| Sanctions across classes | Transfer-hook check (open/1404) + compliance module (3643), fail-closed (R5) |
| Deployment / indexing / UI | Reuse 025/027 tooling; subgraph TokenCreated; rebuilt real-Web3 UI (R7) |
| DEX listing / governance token | Out of scope (R8) |
