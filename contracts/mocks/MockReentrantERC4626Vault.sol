// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

interface IFeeRouterReenter {
    function depositToVaultWithFee(bytes32, address, uint256, address, uint16) external returns (uint256);
}

/**
 * @title MockReentrantERC4626Vault
 * @notice Test-only ERC-4626 vault whose `deposit` re-enters the FeeRouter's fund-moving function,
 *         so the router's `nonReentrant` guard can be exercised (a re-entrant deposit MUST revert).
 */
contract MockReentrantERC4626Vault is ERC4626 {
    address public router;
    bytes32 public serviceId;
    bool private attacking;

    constructor(IERC20 asset_) ERC20("Reentrant Vault", "rVLT") ERC4626(asset_) {}

    function arm(address router_, bytes32 serviceId_) external {
        router = router_;
        serviceId = serviceId_;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        if (router != address(0) && !attacking) {
            attacking = true;
            // Re-enter the router's only fund-moving function; ReentrancyGuard must reject this.
            IFeeRouterReenter(router).depositToVaultWithFee(
                serviceId,
                address(this),
                assets,
                receiver,
                type(uint16).max
            );
        }
        return super.deposit(assets, receiver);
    }
}
