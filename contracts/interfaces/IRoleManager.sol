// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IRoleManager
 * @notice Interface for role manager contracts used by ConditionalMarketFactory
 * @dev Both TieredRoleManager and RoleManagerCore implement this interface
 */
interface IRoleManager {
    /**
     * @notice Get the MARKET_MAKER_ROLE hash
     */
    function MARKET_MAKER_ROLE() external view returns (bytes32);

    /**
     * @notice Check if an account has a specific role
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @notice Check if user is within market creation limits for a role
     * @dev Note: TieredRoleManager's implementation modifies state (usage counters)
     * @param user The user to check
     * @param role The role to check limits for
     * @return bool True if within limits
     */
    function checkMarketCreationLimitFor(address user, bytes32 role) external returns (bool);
}
