// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

/**
 * @title MockERC4626Vault
 * @notice Minimal ERC-4626 vault for FeeRouter tests, with a settable revert mode so
 *         atomicity (fee leg rolls back with a failed deposit) can be exercised.
 */
contract MockERC4626Vault is ERC4626 {
    bool public revertOnDeposit;

    constructor(IERC20 asset_) ERC20("Mock Vault", "mVLT") ERC4626(asset_) {}

    function setRevertOnDeposit(bool value) external {
        revertOnDeposit = value;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        require(!revertOnDeposit, "MockERC4626Vault: deposit disabled");
        return super.deposit(assets, receiver);
    }
}
