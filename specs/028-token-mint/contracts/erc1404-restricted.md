# Contract: RestrictedERC20 (ERC-1404 Simple Restricted Token)

Open ERC-20 clone template plus the Simple Restricted Token interface and a per-token policy. The detector and
the transfer hook evaluate the **same** policy, so a pre-transfer eligibility check always agrees with the
actual transfer. Maps to FR-004, FR-008–010, FR-018–021, User Story 3.

## Interface (`IERC1404`)

```
function detectTransferRestriction(address from, address to, uint256 value) external view returns (uint8 code);
function messageForTransferRestriction(uint8 code) external view returns (string memory);
```

Standard ERC-20 surface otherwise (transfer/transferFrom/approve/balanceOf/…).

## Restriction codes (fixed enum)

| Code | Name | Message |
|------|------|---------|
| 0 | `SUCCESS` | "No restriction" |
| 1 | `SENDER_NOT_ELIGIBLE` | "Sender is not eligible to transfer this token" |
| 2 | `RECIPIENT_NOT_ELIGIBLE` | "Recipient is not eligible to hold this token" |
| 3 | `SENDER_FROZEN` | "Sender account is frozen" |
| 4 | `SANCTIONED` | "Address is sanctioned" |

## Policy & enforcement

Per-token state: `eligible[address]`, `frozen[address]`, `sanctionsGuard`. Evaluation order (most restrictive
first): **sanctioned → frozen → not-eligible**. The same function backs both:

- `detectTransferRestriction(from,to,value)` returns the code (view, no state change) — FR-009.
- `_update(from,to,value)` computes the code and **reverts with the matching reason** when `code != SUCCESS`
  (mint/burn endpoints handled appropriately) — FR-008.

This guarantees detector/transfer parity (SC-003).

## Administration (`onlyOwner`/admin)

```
setEligible(address account, bool ok)        // FR-010
setEligibleBatch(address[] accounts, bool ok)
setFrozen(address account, bool frozen)
mint(address to, uint256 amount)             // owner; recipient must be eligible & not sanctioned
```

`sanctionsGuard` is always consulted (fail-closed) regardless of the eligibility list (FR-021); it can be set to
`address(0)` only as a deliberate per-network config (consistent with the platform).

## Test contracts (acceptance)

- Transfer to an ineligible recipient reverts; `detectTransferRestriction` returns code 2 with matching message.
- Pre-check and actual transfer agree for sender-frozen, recipient-ineligible, sanctioned, and success cases.
- Transfer between two eligible, unsanctioned parties succeeds.
- A sanctioned sender or recipient is blocked regardless of eligibility (more-restrictive-wins).
- Eligibility/freeze admin restricted to owner; non-owner rejected.
