# Contract: MembershipManager — redeemVoucher (append-only upgrade)

An **append-only, in-place upgrade** of the (by then upgradeable) `MembershipManager`. It is the **first
upgrade** of the membership proxy, mirroring how feature 024 is the first upgrade of the WagerRegistry proxy.

> **Prerequisite**: this assumes the sibling "Upgradeable MembershipManager" migration has already converted
> `MembershipManager` onto `UUPSManaged` (constructor→`initialize`, trailing `__gap`). This upgrade adds **no**
> second initializer and changes **no** existing storage slot, function, event, or error — additions only.

## Added state (append-only)

```text
address public voucher;   // the MembershipVoucher contract (one appended slot; consumes __gap)
```

## Added external interface

| Function | Auth | Behavior |
|----------|------|----------|
| `setVoucher(address v)` | `DEFAULT_ADMIN_ROLE` | Require non-zero; set `voucher`; emit `VoucherSet(v)`. |
| `redeemVoucher(uint256 voucherId, bytes32 acceptedTermsHash)` | anyone owning the voucher | Redeem → soulbound membership (see flow). `nonReentrant`. |

`redeemVoucher` deliberately has **no** recipient parameter (research D2 — redeem-to-self; relayer deferred).

## Redemption flow (CEI, single-use, fail-closed)

```text
1. require(voucher != address(0))                                  // configured
2. info = IMembershipVoucher(voucher).voucherInfo(voucherId)       // {role, tier, durationDays}
3. require(IMembershipVoucher(voucher).ownerOf(voucherId) == msg.sender)   // ownership
4. require(!_isActive(msg.sender, info.role))                      // FR-011 (else revert, voucher intact)
5. _screen(msg.sender)                                             // FR-012 fail-closed (else revert, voucher intact)
   --- effects (atomic) ---
6. IMembershipVoucher(voucher).burn(voucherId)                     // single-use burn (FR-010)
7. m = _memberships[msg.sender][info.role];
   m.tier = info.tier;
   m.expiresAt = uint64(block.timestamp) + uint64(info.durationDays) * 1 days;   // duration snapshot (D7)
   m.monthCount = 0; m.monthAnchor = uint64(block.timestamp);      // counters reset, like a fresh purchase
8. _recordTerms(info.role, acceptedTermsHash)                      // FR-013 (records for msg.sender)
9. emit MembershipRedeemed(msg.sender, info.role, info.tier, voucherId, m.expiresAt)
```

- **No funds move** in redemption (research D10); USDC was taken at mint.
- Steps 3–5 (checks + screen) precede the burn and membership write; no external interaction follows the
  effects → checks-effects-interactions preserved. `nonReentrant` guards defensively.
- Redemption does **not** check tier `active`/price (FR-009) — the voucher is a bearer claim on `(role, tier)`;
  duration comes from the token snapshot, not live config.
- Usage **limits** are unchanged: enforced live by the existing `checkCanCreate`/`recordCreate` reading current
  tier config — identical to a directly purchased membership (FR-008).

## Added events / errors

- `VoucherSet(address indexed voucher)`
- `MembershipRedeemed(address indexed user, bytes32 indexed role, Tier tier, uint256 indexed voucherId, uint64 expiresAt)`
- Errors: `VoucherNotSet` · `NotVoucherOwner` · `AlreadyActive` (reuse) · plus existing `_screen` revert.

## Interface additions

`IMembershipManager`: add `setVoucher`, `redeemVoucher`, and the `MembershipRedeemed`/`VoucherSet` events.
New `IMembershipVoucher`: `voucherInfo(uint256)` + `burn(uint256)` + `ownerOf(uint256)` (the subset the manager
calls).

## Storage-layout safety (Constitution I)

- Only `voucher` is appended, after all existing state, drawing from `__gap`; nothing is reordered/removed/
  retyped. `npm run check:storage-layout` (OZ `validateUpgrade`) gates CI and blocks any violating upgrade
  before it is applied (FR-024, reuse of 025 tooling).
- No new initializer; `_disableInitializers()` (from `UUPSManaged`) still protects the bare implementation.
- Least privilege (FR-025): redemption writes the membership through the manager's own internal state; the
  voucher contract receives no role. Upgrade authorization stays the `UPGRADER_ROLE` gate from `UUPSManaged`.
