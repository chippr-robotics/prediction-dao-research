# Phase 1 Data Model: Token Mint & Compliant Token Administration

Entities are on-chain unless noted. The single platform-owned, state-bearing contract is `TokenFactory` (behind
an ERC1967 proxy); its state is **append-only** with a trailing `__gap`. Issued tokens hold their own state.

## Entity: TokenFactory (platform authority/registry — upgradeable)

The one upgradeable contract. Holds the issuance role, the sanctions guard reference, the implementation-template
addresses, and the network's token registry.

| Field | Type | Notes |
|-------|------|-------|
| `sanctionsGuard` | `ISanctionsGuard` | Screening for issuers + injected into issued tokens. `address(0)` disables (mirrors `MembershipManager`). |
| `openERC20Impl` | `address` | Immutable ERC-20 clone template (burnable/pausable are **init flags**, not separate impls — see note). |
| `openERC721Impl` | `address` | Immutable ERC-721 clone template (burnable is an init flag). |
| `restrictedERC20Impl` | `address` | ERC-1404 clone template. |
| ~~`trexGateway` / `sanctionsComplianceModule`~~ | `address` | **DEFERRED (US4/T-REX).** Not yet declared; will be appended from `__gap` when the OZ-4-only ERC-3643 class is unblocked. |

> **As-built note (2026-06-23):** one clone impl **per standard** (not per burnable/pausable variant); the
> capability flags live on the template and a disabled capability reverts. The T-REX/ERC-3643 fields are
> reserved but not yet in storage (deferred — OZ 4.x / Solidity 0.8.17 incompatibility).
| `tokenCount` | `uint256` | Monotonic id allocator. |
| `tokens` | `mapping(uint256 => TokenRecord)` | Registry by id. |
| `issuerTokens` | `mapping(address => uint256[])` | Issuer → token ids (admin list). |
| `tokenAddressToId` | `mapping(address => uint256)` | Reverse lookup. |
| `__gap` | `uint256[N]` | Append-only reserve. |

**Roles** (via `UUPSManaged` → `AccessControlUpgradeable`):
- `DEFAULT_ADMIN_ROLE` — set guard/templates/gateway, grant roles (floppy-keystore admin).
- `UPGRADER_ROLE` — replace the factory implementation (from base; least-privilege).
- `TOKEN_ISSUER_ROLE` — may create tokens. Granted by the admin/role-manager (R4).

**Lifecycle**: `constructor` disables initializers (via base) → `initialize(admin, sanctionsGuard_, templates…,
trexGateway_, complianceModule_)` once → issuers call `create*` → records appended (never mutated destructively;
metadata updates allowed where the standard allows).

**Validation**: caller holds `TOKEN_ISSUER_ROLE`; caller passes `sanctionsGuard.isAllowed` (fail-closed);
non-empty name/symbol; decimals within bounds; initial supply ≤ a configured max; rejects on revert with no
registry write (CEI — record appended only after successful deployment).

## Entity: TokenRecord (registry row)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uint256` | Registry id. |
| `standard` | `enum TokenStandard` | `OPEN_ERC20`, `OPEN_ERC721`, `RESTRICTED_ERC1404`, `PERMISSIONED_ERC3643`. |
| `tokenAddress` | `address` | Deployed token (clone or T-REX token proxy). |
| `issuer` | `address` | Creator / initial owner. |
| `name` / `symbol` | `string` | Metadata. |
| `metadataURI` | `string` | IPFS/URI (open/1404; collection or token base). |
| `flags` | `packed bools` | `isBurnable`, `isPausable` (open classes). |
| `suite` | `TrexSuiteRef` (3643 only) | Identity registry, compliance, claim-topics, trusted-issuers addresses. |
| `createdAt` | `uint64` | Block timestamp. |

State is per-network (the registry lives on each chain's factory; the frontend/subgraph never cross networks —
FR-023).

## Entity: Issued Open Token (ERC-20 / ERC-721 clone)

OZ-standard token initialized once at creation. Holds: `name`, `symbol`, supply/owner, optional
burnable/pausable behavior, and a `sanctionsGuard` reference.

**Behaviors**: owner `mint` (and `pause`/`unpause` if pausable); holder `burn` if burnable; standard transfers.
**Transfer hook (`_update`)**: fail-closed `sanctionsGuard.isAllowed(from)` and `isAllowed(to)` (skips the
zero-address mint/burn endpoints appropriately). Implementation template constructor calls
`_disableInitializers()`-equivalent guard (`_initialized`) so the template can't be hijacked.

**State transitions**: `Active → Paused → Active` (pausable only); supply changes via mint/burn. Ownership
transferable (FR-020).

## Entity: Issued Restricted Token (ERC-1404 clone)

Open ERC-20 plus the Simple Restricted Token interface and a policy.

| Field | Type | Notes |
|-------|------|-------|
| `eligible` | `mapping(address => bool)` | Per-token eligibility list. |
| `frozen` | `mapping(address => bool)` | Per-account freeze. |
| `sanctionsGuard` | `ISanctionsGuard` | Always consulted. |

**Restriction codes** (`uint8`, fixed enum): `0 SUCCESS`, `1 SENDER_NOT_ELIGIBLE`, `2 RECIPIENT_NOT_ELIGIBLE`,
`3 SENDER_FROZEN`, `4 SANCTIONED`. `messageForTransferRestriction(code)` returns the matching human-readable
string. `detectTransferRestriction(from,to,value)` and the `_update` hook evaluate the **same** policy (sanctions
→ freeze → eligibility; more restrictive wins).

**Admin** (owner/admin): set eligibility, set freeze (FR-010); mint/pause as for open tokens.

## Entity: Issued Permissioned Token (T-REX / ERC-3643)

Delivered by the vendored suite; the platform records it and wires sanctions. Per-token suite (managed by T-REX):

- **Token** — ERC-3643 token (transfers gated by identity + compliance).
- **Identity Registry (+ Storage)** — holder → ONCHAINID identity + country; the eligibility source.
- **Modular Compliance** — bound rule modules, including the platform `SanctionsComplianceModule`.
- **Claim Topics Registry** — required claim topics.
- **Trusted Issuers Registry** — issuers whose claims are accepted.

**Actors / authority**: `owner` (token issuer) and one or more `agents`. Agent/owner actions (FR-013–016):
freeze/unfreeze account or partial balance, forced transfer, recovery (lost wallet → replacement carrying the
same identity), mint, burn, pause/unpause. Identity-registry and trusted-issuer/claim-topic management is
restricted to authorized roles (FR-017).

**Transfer validation**: sender & recipient must have valid required claims from trusted issuers AND satisfy all
bound compliance modules (including sanctions) — else revert (FR-011/FR-012).

## Entity: HolderIdentity (ONCHAINID, 3643 only)

On-chain identity contract carrying claims (topic → claim from a trusted issuer). Referenced by the Identity
Registry. Determines transfer eligibility. **Recovery** moves balance + frozen status to a replacement wallet
that is registered to the **same** identity; recovery to a wallet without it is rejected (FR-015).

## Off-chain entities

| Entity | Store | Notes |
|--------|-------|-------|
| Token discovery index | Subgraph | From `TokenFactory.TokenCreated`; network-scoped; powers list/detail + issuer admin list. |
| Deployment record | `deployments/*.json` | `tokenFactory` (proxy), `tokenFactoryImpl`, template addresses, suite/gateway addresses — source of truth. |
| Frontend contract artifacts | `sync:frontend-contracts` output | Addresses/ABIs the UI consumes (never hand-copied). |

## Cross-entity rules

- **Sanctions non-bypassable** across every class (FR-021): issuer at creation; sender/recipient on transfer.
- **Network scoping** (FR-023): all reads scoped to the active chain; unsupported networks disable the feature.
- **Honest state** (FR-024): a registry row exists only after a confirmed deployment; UI shows no token until
  confirmed.
- **Append-only factory storage** (FR-026): new fields only at the end before `__gap`; gated by
  `check:storage-layout`.
