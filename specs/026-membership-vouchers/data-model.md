# Phase 1 Data Model: Membership Vouchers

This feature adds one new token contract with its own state and **appends one slot** to the (upgradeable)
membership authority. The redeemed membership reuses the **existing** `Membership` struct unchanged (FR-008).

## Entities

| Entity | What it is | Lifecycle |
|--------|-----------|-----------|
| **MembershipVoucher (token contract)** | Immutable ERC-721 + ERC-2981. Mints bearer claims, holds per-token `VoucherInfo`, renders on-chain `tokenURI`, advertises royalty. | Deployed once per network; address recorded in `deployments/`. Not upgradeable (D1). |
| **Voucher (token instance)** | A single ERC-721 `tokenId` representing the right to claim one membership of a `(role, tier)`. Confers no membership while held. | Minted → (transferred/gifted/resold any number of times) → burned on redemption, **or** voluntarily burned by owner (value forfeited). Single-use. |
| **VoucherInfo** | The snapshot a token carries: `{ role, tier, durationDays }`. | Written once at mint; immutable; read at redemption. |
| **Redemption** | The act, on `MembershipManager`, of burning a voucher and writing a soulbound membership to the redeemer. | One-shot per voucher; atomic; gated by ownership + not-active + screening + Terms. |
| **Membership (existing)** | The soulbound, time-bound, address-keyed access record (`{tier, expiresAt, monthCount, activeCount, monthAnchor}`). | Unchanged; produced identically by direct purchase and by redemption. |

## New on-chain state

### MembershipVoucher (immutable contract)

| # | Variable | Type | Notes |
|---|----------|------|-------|
| 1 | `membershipManager` | `address` (immutable) | config source for price + treasury; sole authorized burner |
| 2 | `_info` | `mapping(uint256 => VoucherInfo)` | per-token snapshot `{bytes32 role, uint8 tier, uint32 durationDays}` |
| 3 | `_nextId` | `uint256` | monotonically increasing token id counter |
| 4 | `_royaltyBps` | `uint96` | default `250` (2.5%); setter reverts above `500` (5%) |

`treasury` and per-tier `priceUSDC`/`durationDays`/`active` are **read live** from `membershipManager` (not
duplicated). Royalty `receiver` is `membershipManager.treasury()` resolved via ERC-2981 `royaltyInfo`.

### VoucherBatchMinter (immutable helper — batch & gift)

A stateless, custody-free helper over the immutable voucher (whose `mint()` makes one token, to the caller).
All fields are `immutable` (no mutable storage):

| # | Variable | Type | Notes |
|---|----------|------|-------|
| 1 | `voucher` | `address` (immutable) | the `MembershipVoucher` it mints from |
| 2 | `manager` | `address` (immutable) | config source (tier price), read from the voucher's `membershipManager()` |
| 3 | `paymentToken` | `address` (immutable) | USDC-like token, read from the manager |
| — | `MAX_QUANTITY` | `constant = 50` | per-batch cap (bounded gas) |

`mintBatch(role, tier, quantity, recipient)`: price `quantity × priceUSDC`, pull it once from the buyer,
`forceApprove` the voucher, loop `mint()` (each mint pulls `price` to the treasury) and `transferFrom` every
token to `recipient`, then reset the allowance to 0. `nonReentrant`; `IERC721Receiver` so it can hold the
freshly minted token for the same-tx forward. Emits `BatchMinted(buyer, recipient, role, tier, quantity,
totalPaid, firstId, lastId)`. No admin, no withdrawal path, no upgradeability (FR-001a–FR-001c).

### MembershipManager (append-only upgrade)

Existing slots (tiers, memberships, payment token, treasury, accruedFees, sanctionsGuard, memberTermsHash,
authorizedCallers, …) are **unchanged and never reordered** (validated by `check:storage-layout`). The upgrade
appends exactly:

| # | Variable | Type | Notes |
|---|----------|------|-------|
| +1 | `voucher` | `address` | the `MembershipVoucher` contract; set once via `setVoucher` (`DEFAULT_ADMIN_ROLE`) |

`__gap` (added by the sibling migration) is reduced by 1. No other state is added — redemption needs no extra
ledger (the burn + membership write are the only effects).

## Validation rules (from requirements)

**Mint** (`MembershipVoucher.mint`)
- Tier MUST be active with `priceUSDC > 0` (per `getTierConfig(role, tier)`) — else revert (FR-001).
- Pull exactly `priceUSDC` USDC from the minter → treasury (`SafeERC20`); recognize at mint (FR-004).
- Snapshot `VoucherInfo{role, tier, durationDays}` from current config (D7); mint token to minter.
- No screening of the minter (FR-014). Permissionless caller (FR-001).

**Transfer/resale** — standard ERC-721; no membership effect (FR-003). Royalty advertised via ERC-2981
(2.5%, receiver = treasury), best-effort (FR-021).

**Batch mint** (`VoucherBatchMinter.mintBatch`)
- `recipient != 0` and `1 ≤ quantity ≤ MAX_QUANTITY` — else revert (FR-001a/FR-001b).
- Tier active with `priceUSDC > 0` — else revert.
- Pull exactly `quantity × priceUSDC` from the buyer once; forward every minted token to `recipient` in the
  same tx; reset allowance to 0; atomic (any mint reverts the batch). No funds/NFTs held at rest (FR-001c).

**Redeem** (`MembershipManager.redeemVoucher(voucherId, acceptedTermsHash)`)
- `voucher` MUST be configured; caller MUST own `voucherId` — else revert.
- Redeemer MUST NOT already have an active membership for the token's `role` — else revert, voucher intact
  (FR-011/FR-015).
- `_screen(msg.sender)` MUST pass (fail-closed) — else revert, no burn, voucher intact (FR-012/FR-015).
- Effects (atomic): burn the voucher; write membership `{tier, expiresAt = now + durationDays·1d, counters
  reset}`; `_recordTerms(role, acceptedTermsHash)`; emit `MembershipRedeemed`.
- Single-use: a burned token cannot be redeemed again (FR-010).
- No funds move (D10). `nonReentrant`.

**tokenURI** — fully on-chain Base64 JSON+SVG reflecting `(role, tier)` (FR-005b).

## State machine — Voucher

```text
        mint(role,tier) [USDC→treasury]
absent ───────────────────────────────▶ HELD ──(ERC-721 transfer/resale, any number)──▶ HELD
                                          │
                          redeemVoucher   │  (owner-only voluntary burn)
                       [own + !active +    │
                        screen pass]       ▼
                                        BURNED (terminal) ──▶ membership written to redeemer
                                          ▲
              blocked / already-active ───┘  (redeem reverts; voucher stays HELD, re-tradable)
```

## State machine — Membership (unchanged, reached via either rail)

```text
None ──purchaseTier / redeemVoucher──▶ Active(tier, expiresAt) ──expiry/ revoke──▶ None
            (direct USDC)  (voucher)          │
                                              └─ upgrade / extend (direct rail only; unchanged)
```

## Invariants

- A `HELD` voucher confers **no** membership standing, usage allowance, or clock (FR-002/SC-002).
- Redemption is the **only** transition that writes a membership from a voucher, and it is atomic with the burn
  (FR-006/FR-010).
- A redeemed membership is **indistinguishable** from a directly purchased one of the same `(role, tier)` for
  every downstream read/enforcement (`hasActiveRole`, `checkCanCreate`, limits, expiry, revoke) (FR-008).
- The membership storage layout is **append-only**; existing slots are immutable across the upgrade (validated
  pre-upgrade by CI).
- The voucher contract holds **no** USDC after a mint (funds forwarded to treasury) and **no** membership state.
