# Contract: MembershipVoucher (new, immutable)

ERC-721 bearer voucher for membership acquisition. **Immutable** (not upgradeable — research D1). Inherits
OpenZeppelin `ERC721`, `ERC721Burnable`, `ERC2981`, `AccessControl` (or `Ownable` for the single admin), and
uses `SafeERC20`, `Strings`, `Base64`. No proxy.

## Responsibilities

1. Permissionless mint of a `(role, tier)` voucher, priced from `MembershipManager` config, paid in USDC to the
   treasury, recognized at mint.
2. Carry an immutable per-token snapshot `VoucherInfo{role, tier, durationDays}`.
3. Be burnable **only** by the configured `MembershipManager` (for redemption), plus owner self-burn.
4. Render an on-chain `tokenURI`; advertise an ERC-2981 royalty (2.5%, capped 5%) to the treasury.

## State

```text
address  immutable  membershipManager     // config source (price, treasury) + sole redemption-burner
mapping(uint256 => VoucherInfo) _info      // {bytes32 role, uint8 tier, uint32 durationDays}
uint256             _nextId                 // token id counter (starts at 1)
uint96              _royaltyBps             // default 250; setter caps at 500
```

`VoucherInfo` mirrors `MembershipManager`/`IMembershipManager` tier semantics (`Tier` enum, `bytes32 role`).

## External interface (surface — signatures illustrative)

| Function | Auth | Behavior |
|----------|------|----------|
| `mint(bytes32 role, Tier tier) returns (uint256 id)` | anyone | Require tier active & `priceUSDC>0` (from `getTierConfig`); `SafeERC20.safeTransferFrom(minter, treasury, priceUSDC)`; snapshot `VoucherInfo{role,tier,durationDays}`; `_safeMint(minter, id)`; emit `VoucherMinted`. `nonReentrant`. No minter screening (FR-014). |
| `burn(uint256 id)` | `membershipManager` **or** token owner | Manager path used by redemption; owner path is voluntary forfeit. Reverts otherwise. Emits ERC-721 `Transfer` to zero. |
| `voucherInfo(uint256 id) returns (VoucherInfo)` | view | Read snapshot (used by the manager at redemption). |
| `tokenURI(uint256 id) returns (string)` | view | `data:application/json;base64,…` with embedded SVG reflecting `(role, tier)` (FR-005b). |
| `royaltyInfo(uint256 id, uint256 salePrice)` | view (ERC-2981) | `(treasury, salePrice * _royaltyBps / 10000)`. |
| `setRoyaltyBps(uint96 bps)` | admin | Require `bps <= 500` (5% hard ceiling, FR-021a); set `_royaltyBps`; emit `RoyaltyUpdated`. |
| `supportsInterface(bytes4)` | view | ERC-721 + ERC-2981 + AccessControl. |

`membershipManager` is set once in the constructor (immutable). `treasury` and `priceUSDC`/`durationDays`/
`active` are always read live from `membershipManager` — never duplicated (research D3).

## Events

- `VoucherMinted(uint256 indexed id, address indexed minter, bytes32 indexed role, Tier tier, uint32 durationDays, uint128 priceUSDC)`
- `RoyaltyUpdated(uint96 bps)`
- (ERC-721 `Transfer` covers mint/transfer/burn; consumed by the subgraph.)

## Errors

`TierInactive` · `PriceZero` · `NotManagerOrOwner` · `RoyaltyTooHigh` · `ZeroAddress`

## Security notes (Constitution I)

- **CEI on mint**: checks (active, price) → interaction (`safeTransferFrom` USDC to treasury) → effect (mint +
  snapshot). `nonReentrant` guards the path; USDC is the only external call and goes to the trusted treasury.
- **Burn authorization**: redemption burn is restricted to the configured `membershipManager`; the voucher is
  granted **no** role on the manager (least privilege — the trust flows manager→voucher, not voucher→manager).
- **Immutable**: no upgrade surface; redemption rules can't change after a holder buys (research D1).
- **No fund retention**: USDC is forwarded to the treasury within `mint`; the contract never custodies balances.
- Slither (ERC721/reentrancy detectors) + Medusa clean; EthTrust-SL ≥ L2.
