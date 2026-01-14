// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IRoleManagerCore
 * @notice Interface for RoleManagerCore used by modular RBAC components
 */
interface IRoleManagerCore {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function grantRoleFromExtension(bytes32 role, address account) external;
    function paused() external view returns (bool);
    function OPERATIONS_ADMIN_ROLE() external view returns (bytes32);
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
    function FRIEND_MARKET_ROLE() external view returns (bytes32);
    function MARKET_MAKER_ROLE() external view returns (bytes32);
}
