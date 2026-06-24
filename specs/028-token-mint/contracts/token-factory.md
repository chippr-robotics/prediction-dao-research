# Contract: TokenFactory (platform authority / registry)

> **Implementation note (2026-06-23 — `/speckit-implement`).** Shipped on **OpenZeppelin 5.4.0** (the latest
> ETC/Mordor-compatible OZ; OZ ≥5.5 needs the Cancun `mcopy` opcode that pre-Cancun ETC lacks). Two deviations
> from the sketch below, both within the spec's stated allowances:
> 1. **One clone impl per standard**, not per variant: `openERC20Impl`, `openERC721Impl`, `restrictedERC20Impl`.
>    Burnable/pausable are init **flags** on a single `OpenERC20` template (a disabled capability reverts), so
>    `setTemplate(TokenStandard standard, address impl)` drops the `variant` arg. (open-tokens.md explicitly
>    permits the flag form.)
> 2. **T-REX / ERC-3643 (createPermissionedERC3643, gateway, compliance module) is DEFERRED** — the canonical
>    suite only supports OZ 4.x + Solidity 0.8.17. `TokenStandard.PERMISSIONED_ERC3643` + `TokenRecord.suite`
>    are reserved so the registry shape stays forward-stable; the gateway/module storage will be appended (from
>    `__gap`) when the class lands.

UUPS-upgradeable. Inherits `contracts/upgradeable/UUPSManaged.sol` (UUPS + AccessControl + non-brickable upgrade
gate + impl-init lockout) and `ReentrancyGuardUpgradeable`. The only state-bearing platform contract; issued
tokens are separate. Maps to FR-001–007, FR-018–026.

## Roles

- `DEFAULT_ADMIN_ROLE` — set sanctions guard, templates, T-REX gateway, compliance module; grant/revoke roles.
- `UPGRADER_ROLE` — replace the implementation (from `UUPSManaged`).
- `TOKEN_ISSUER_ROLE` — required to call any `create*`.

## Initialization

```
initialize(
  address admin,
  address sanctionsGuard_,
  address openERC20Impl_, address openERC20BurnableImpl_, address openERC20PausableImpl_, address openERC20BurnablePausableImpl_,
  address openERC721Impl_, address openERC721BurnableImpl_,
  address restrictedERC20Impl_,
  address trexGateway_,
  address sanctionsComplianceModule_
) external initializer
```

- Calls `__UUPSManaged_init(admin)` first, then `__ReentrancyGuard_init()`.
- Stores guard, template, gateway, and compliance-module addresses. Constructor (via base) disables
  initializers; re-invocation reverts.

## Creation entrypoints (each: `onlyRole(TOKEN_ISSUER_ROLE) nonReentrant`, issuer screened by SanctionsGuard)

```
createOpenERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, string metadataURI, bool burnable, bool pausable) returns (uint256 id, address token)
createOpenERC721(string name, string symbol, string baseURI, bool burnable) returns (uint256 id, address token)
createRestrictedERC20(string name, string symbol, uint8 decimals, uint256 initialSupply, string metadataURI, address[] initialEligible) returns (uint256 id, address token)
createPermissionedERC3643(TrexParams params) returns (uint256 id, address token)   // deploys/wires T-REX suite + binds SanctionsComplianceModule
```

Each: validates inputs (non-empty name/symbol; decimals/supply bounds), screens `msg.sender` via
`sanctionsGuard.isAllowed` (fail-closed), clones/deploys, initializes the token with `msg.sender` as
owner/agent and the `sanctionsGuard`, **then** appends the `TokenRecord` (CEI — no registry write on revert),
and emits `TokenCreated`.

## Admin / config (`onlyRole(DEFAULT_ADMIN_ROLE)`)

```
setSanctionsGuard(address guard)            // address(0) disables (mirrors MembershipManager)
setTemplate(TokenStandard kind, uint8 variant, address impl)
setTrexGateway(address gateway)
setSanctionsComplianceModule(address module)
```

## Views

```
getToken(uint256 id) returns (TokenRecord)
getTokensByIssuer(address issuer) returns (uint256[])
getTokenIdByAddress(address token) returns (uint256)
tokenCount() returns (uint256)
```

## Events

```
TokenCreated(uint256 indexed id, TokenStandard indexed standard, address indexed token, address issuer, string name, string symbol)
TemplateUpdated(TokenStandard kind, uint8 variant, address impl)
SanctionsGuardUpdated(address indexed guard)
```

## Upgrade & storage

- Upgraded in place via `scripts/deploy/lib/upgradeable.js`; `_authorizeUpgrade onlyRole(UPGRADER_ROLE)`.
- Storage append-only with trailing `__gap`; registered in `check:storage-layout` as
  `{ name: "TokenFactory", deploymentsKey: "tokenFactory" }`.

## Test contracts (acceptance)

- Creation rejected without `TOKEN_ISSUER_ROLE` and for a sanctioned issuer (both revert; no registry write).
- Each `create*` deploys a working token, sets issuer as owner, appends exactly one record, emits `TokenCreated`.
- Registry views return network-scoped truth; reverted creation leaves no phantom record.
- Upgrade lifecycle: deploy → upgrade → state preserved → non-`UPGRADER_ROLE` rejected → re-init rejected →
  storage-incompatible impl rejected by `validateUpgrade`.
