# Contract: `WagerRegistry` — UUPS conversion (behavior-neutral)

`contracts/wagers/WagerRegistry.sol`. The migration is a **pure infrastructure change**: no function, event,
error, struct, or behavior changes (FR-003/FR-006/SC-003). Only the inheritance, the constructor→initializer,
and a trailing `__gap` change.

## Inheritance change

| Before (non-upgradeable) | After (upgradeable) |
|--------------------------|---------------------|
| `AccessControl` | `UUPSManaged` (which brings `UUPSUpgradeable` + `AccessControlUpgradeable`) |
| `ReentrancyGuard` | `ReentrancyGuardUpgradeable` |
| `Pausable` | `PausableUpgradeable` |
| `IWagerRegistry` | `IWagerRegistry` (unchanged) |

`using SafeERC20 for IERC20;` and `using EnumerableSet for EnumerableSet.UintSet;` unchanged. `bytes32 public
constant` role ids and `_CONSENT_*` constants unchanged (no storage).

## Constructor → `initialize`

```solidity
// REMOVE the constructor; the implementation's constructor is inherited from UUPSManaged
// (calls _disableInitializers()).

function initialize(
    address admin,
    address membershipManager_,
    address polymarketAdapter_,
    address[] memory initialTokens
) external initializer {
    __UUPSManaged_init(admin);     // UUPS + AccessControl; grants DEFAULT_ADMIN_ROLE + UPGRADER_ROLE to admin
    __ReentrancyGuard_init();
    __Pausable_init();

    if (admin == address(0) || membershipManager_ == address(0)) revert ZeroAddress();
    membershipManager = IMembershipManager(membershipManager_);
    polymarketAdapter = IOracleAdapter(polymarketAdapter_);   // may be zero
    for (uint256 i = 0; i < initialTokens.length; i++) {
        address t = initialTokens[i];
        if (t == address(0)) revert ZeroAddress();
        _allowedTokens[t] = true;
        emit TokenAllowed(t, true);
    }
    _grantRole(GUARDIAN_ROLE, admin);
    _grantRole(ACCOUNT_MODERATOR_ROLE, admin);
    _nextWagerId = 1;              // MOVED from the inline `= 1` initializer (must run behind the proxy)
}
```

**Critical conversion notes**
- `uint256 private _nextWagerId = 1;` → declare as `uint256 private _nextWagerId;` and set `= 1` inside
  `initialize` (inline initializers run in constructor context and are ignored behind a proxy — would start
  wager ids at 0).
- `DEFAULT_ADMIN_ROLE` is granted by `__UUPSManaged_init`; do not double-grant. `GUARDIAN_ROLE` /
  `ACCOUNT_MODERATOR_ROLE` grants are preserved here (same as the old constructor).
- All other functions are byte-for-byte unchanged.

## Storage

Append `uint256[N] __gap;` as the **last** state variable (after `_userWagerIds`). Existing variables keep
their declaration order (see data-model.md "Storage-layout baseline"). Feature 024 later appends
`claimAuthority` + `openWagerIdByClaim` from this gap.

## Pause / upgrade interaction

`PausableUpgradeable` behaves as today (`GUARDIAN_ROLE` pauses/unpauses operational entrypoints). Upgrade
authorization (`UPGRADER_ROLE`) is independent of pause, so a fix can be shipped while paused (FR-013); an
upgrade does not auto-unpause.

## Backward-compatibility checklist

- [ ] `Wager` struct layout unchanged; `getWager` ABI identical.
- [ ] No existing function signature / event / error modified or removed.
- [ ] Only additions visible externally: ERC1967 `Upgraded(address)` event, `upgradeToAndCall`, `UPGRADER_ROLE`.
- [ ] Full existing `WagerRegistry.*.test.js` suite passes against the proxied contract (adapted only to
      deploy via proxy `initialize` instead of the constructor).
- [ ] Frontend/subgraph point at the **proxy** address; ABI flows through `sync:frontend-contracts`.
