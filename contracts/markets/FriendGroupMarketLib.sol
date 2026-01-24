// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../security/NullifierRegistry.sol";

/**
 * @title FriendGroupMarketLib
 * @notice Library for FriendGroupMarketFactory helper functions
 * @dev Extracted to reduce main contract bytecode size below EIP-170 limit
 */
library FriendGroupMarketLib {
    using SafeERC20 for IERC20;

    // Custom errors (shared with main contract)
    error TransferFailed();
    error InsufficientPayment();
    error AddressNullified();
    error InvalidMember();
    error DuplicateMember();

    /**
     * @notice Collect stake from a participant
     * @param from Address to collect from
     * @param token Token address (address(0) for native)
     * @param amount Amount to collect
     */
    function collectStake(address from, address token, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value < amount) revert InsufficientPayment();
            if (msg.value > amount) {
                (bool success, ) = payable(from).call{value: msg.value - amount}("");
                if (!success) revert TransferFailed();
            }
        } else {
            IERC20(token).safeTransferFrom(from, address(this), amount);
        }
    }

    /**
     * @notice Refund stake to a single participant
     * @param to Address to refund to
     * @param token Token address (address(0) for native)
     * @param amount Amount to refund
     */
    function refundStake(address to, address token, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, ) = payable(to).call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            // Use low-level call for proxy token compatibility
            (bool success, bytes memory returnData) = token.call(
                abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
            );
            if (!success) revert TransferFailed();
            if (returnData.length > 0 && !abi.decode(returnData, (bool))) revert TransferFailed();
        }
    }

    /**
     * @notice Check if an address is nullified
     * @param registry NullifierRegistry contract
     * @param enforce Whether enforcement is enabled
     * @param addr Address to check
     */
    function checkNullification(
        NullifierRegistry registry,
        bool enforce,
        address addr
    ) internal view {
        if (!enforce || address(registry) == address(0)) return;
        if (registry.isAddressNullified(addr)) revert AddressNullified();
    }

    /**
     * @notice Check nullification for multiple addresses
     * @param registry NullifierRegistry contract
     * @param enforce Whether enforcement is enabled
     * @param addresses Array of addresses to check
     */
    function checkNullificationBatch(
        NullifierRegistry registry,
        bool enforce,
        address[] memory addresses
    ) internal view {
        if (!enforce || address(registry) == address(0)) return;
        for (uint256 i = 0; i < addresses.length; i++) {
            if (registry.isAddressNullified(addresses[i])) revert AddressNullified();
        }
    }

    /**
     * @notice Validate member array (no zeros, no duplicates)
     * @param members Array of member addresses
     */
    function validateMembers(address[] memory members) internal pure {
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == address(0)) revert InvalidMember();
            for (uint256 j = i + 1; j < members.length; j++) {
                if (members[i] == members[j]) revert DuplicateMember();
            }
        }
    }

    /**
     * @notice Validate member array excluding sender
     * @param members Array of member addresses
     * @param sender Address to exclude from validation
     */
    function validateMembersExcluding(address[] memory members, address sender) internal pure {
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == address(0) || members[i] == sender) revert InvalidMember();
            for (uint256 j = i + 1; j < members.length; j++) {
                if (members[i] == members[j]) revert DuplicateMember();
            }
        }
    }
}
