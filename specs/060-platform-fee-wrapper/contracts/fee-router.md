# Interface Contract: `FeeRouter` (spec 060)

Solidity interface exposed by `contracts/fees/FeeRouter.sol` (UUPS proxy, deployment
keys `feeRouter` / `feeRouterImpl`). See [data-model.md](../data-model.md) for storage,
events, and errors.

```solidity
interface IFeeRouter {
    enum ServiceKind { Unregistered, Wrapped, ConfigOnly }

    struct Service {
        uint16 capBps;   // hard cap; 0 => unregistered
        uint16 feeBps;   // live rate, 0..capBps
        ServiceKind kind;
    }

    // --- reads (member surfaces + admin tab) ---
    function treasury() external view returns (address);
    function getService(bytes32 serviceId) external view returns (Service memory);
    function feeBps(bytes32 serviceId) external view returns (uint16);
    function serviceCount() external view returns (uint256);
    function serviceAt(uint256 index) external view returns (bytes32);
    function quoteFee(bytes32 serviceId, uint256 grossAmount)
        external view returns (uint256 feeAmount, uint256 netAmount);
    function MAX_WRAPPED_FEE_BPS() external view returns (uint16); // 250

    // --- admin (DEFAULT_ADMIN_ROLE) ---
    function registerService(bytes32 serviceId, uint16 capBps, ServiceKind kind) external;
    function setTreasury(address newTreasury) external;

    // --- admin (FEE_ADMIN_ROLE) ---
    function setFeeBps(bytes32 serviceId, uint16 newBps) external;

    // --- member action (Wrapped services) ---
    /// Pulls `assets` of `IERC4626(vault).asset()` from msg.sender, transfers the fee
    /// (floor(assets * feeBps / 10_000)) to `treasury`, deposits the remainder into
    /// `vault` for `receiver`. Reverts entirely if any leg fails (atomic).
    /// Reverts FeeAboveQuoted() if live feeBps > maxFeeBps (the rate the member saw).
    /// treasury == address(0) => fee skipped (FeeSkippedNoTreasury), full deposit.
    /// nonReentrant; checks-effects-interactions.
    function depositToVaultWithFee(
        bytes32 serviceId,
        address vault,
        uint256 assets,
        address receiver,
        uint16 maxFeeBps
    ) external returns (uint256 shares);
}
```

`initialize(address admin, address treasury_)` — one-time; calls
`__UUPSManaged_init(admin)` first (grants DEFAULT_ADMIN + UPGRADER + FEE_ADMIN), sets
treasury (zero allowed at init for not-yet-configured networks — charge path then skips
fees).

## Invariants

1. Router token balance is zero outside a transaction (no accrual custody).
2. `feeAmount + netAmount == assets` for every charge; `netAmount` shares go to
   `receiver`, never the router.
3. A `FeeCharged` event's `feeAmount` equals the ERC-20 transfer to `treasury` in the
   same tx (reconciliation basis, FR-020).
4. No path charges `feeBps > min(capBps, maxFeeBps)`.
5. Registration is one-shot per id (`AlreadyRegistered`); caps never change post-
   registration in v1.
