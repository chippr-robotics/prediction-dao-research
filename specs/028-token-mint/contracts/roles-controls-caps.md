# Contract: Role-based v2 token templates (US6/US7/US8/US9/US11)

Evolves the issued-token clone templates from `OwnableUpgradeable` to
`AccessControlEnumerableUpgradeable`, adding optional supply caps, generalized transfer
controls, and bounded batch distribution. **OZ 5.4.0**; immutable clones; constructor
`_disableInitializers`; one-time `initialize`. New tokens use these v2 templates (the
factory's swappable template slots); already-deployed v1 `Ownable` tokens are unchanged
(immutable). Maps to FR-030–FR-040, FR-045. See research R9–R12, R14.

## Roles (AccessControlEnumerable)

| Role | Authorizes | Granted at init |
|------|-----------|-----------------|
| `DEFAULT_ADMIN_ROLE` | grant/revoke roles, ownership transfer/renounce, set policy | issuer |
| `MINTER_ROLE` | `mint`, `batchMint` | issuer |
| `PAUSER_ROLE` | `pause`/`unpause` | issuer |
| `BURNER_ROLE` | privileged `burn` (holder burn stays open if burnable) | issuer |
| `COMPLIANCE_ROLE` (restricted only) | `setEligible[Batch]`, `setFrozen`, `setDefaultRestrictionMessage` | issuer |

Granting all roles to the issuer at init preserves the "owner-as-admin" default (FR-037).
The on-chain roles table comes from `getRoleMember`/`getRoleMemberCount` (US9 table).

## Initialization (clone, once)

```
initialize(string name, string symbol, uint8 decimals /*ERC20*/, uint256 initialSupply /*ERC20*/,
           uint256 cap /*0 = uncapped*/, address owner, address sanctionsGuard,
           bool burnable, bool pausable, address[] initialEligible /*restricted*/)
```

Grants the role set to `owner`, sets `cap` (0 ⇒ uncapped), stores `sanctionsGuard`,
mints `initialSupply` to `owner` (respecting `cap`), seeds eligibility (restricted).

## Supply & caps (FR-030/FR-031)

- `mint(to, amount)` — `MINTER_ROLE`; reverts `ERC20ExceededCap` past a non-zero cap
  (OZ `ERC20Capped._update`).
- `burn` — holder burn (if burnable) + `BURNER_ROLE` privileged burn; reduces supply.
- `cap()` view; uncapped when 0. Frontend shows progress/headroom only when capped.

## Transfer controls (FR-032–FR-034) — shared policy in `_update`

Evaluation order (most-restrictive first), identical to the ERC-1404 detector (parity,
SC-003): **sanctioned → paused → sender/recipient frozen → (restricted) not-eligible**.

- `pause()`/`unpause()` — `PAUSER_ROLE` (OZ Pausable).
- `setFrozen(account, bool)` — `COMPLIANCE_ROLE`; frozen tracked in an enumerable set so
  the UI can list currently-frozen addresses (FR-033).
- Non-bypassable `SanctionsGuard` Check (unchanged), fail-closed.

## Compliance (restricted class, FR-035/FR-036)

- `setEligible(account, ok)` / `setEligibleBatch(accounts[], ok)` — `COMPLIANCE_ROLE`.
- `detectTransferRestriction` / `messageForTransferRestriction` (fixed code enum) — as v1.
- `setDefaultRestrictionMessage(string)` — `COMPLIANCE_ROLE`.
- Per-address **labels are off-chain** (subgraph/frontend), not stored on-chain (R12).

## Batch distribution (FR-040)

- `batchTransfer(address[] to, uint256[] amounts)` and (minter) `batchMint(...)`, bounded
  by `MAX_BATCH` (e.g. 200); over-limit reverts with a clear error so the caller splits
  (no silent truncation). Each leg passes the same `_update` policy + cap checks.

## Ownership (FR-038)

- Transfer ownership = grant `DEFAULT_ADMIN_ROLE` to new owner, then renounce from caller
  (atomic helper `transferOwnership(newOwner)`).
- `renounceOwnership()` = renounce `DEFAULT_ADMIN_ROLE` — irreversible; frontend gates it
  behind an explicit confirmation.

## Storage / safety

Append-only template storage; `_disableInitializers` in constructor; one-time `initializer`.
Issued tokens are **not** upgradeable (immutable clones) — no `__gap` needed on the token
itself, but field order is fixed at the template version. New template versions are new
impls registered via `TokenFactory.setTemplate` (existing tokens unaffected).

## Test contracts (acceptance)

- Each role authorizes only its actions; unauthorized callers revert (SC-011).
- Capped mint over cap reverts; uncapped (cap 0) mints freely (SC-010).
- `_update` policy == detector code for every case (sanctioned/paused/frozen/ineligible/ok).
- `batchTransfer`/`batchMint` update all recipients in one tx; over `MAX_BATCH` reverts.
- Ownership transfer moves `DEFAULT_ADMIN_ROLE`; renounce leaves no admin.
- Template re-init locked; clone init once.
