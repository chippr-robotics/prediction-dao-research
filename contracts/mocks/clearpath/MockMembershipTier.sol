// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev TEST-ONLY. Minimal MembershipManager stand-in exposing just the `getActiveTier` view that
///      `ExternalDAORegistry` consults for tier gating. Tier values mirror `IMembershipManager.Tier`
///      (0 None, 1 Bronze, 2 Silver, 3 Gold, 4 Platinum).
contract MockMembershipTier {
    mapping(address => uint8) private _tier;

    function setTier(address user, uint8 tier) external {
        _tier[user] = tier;
    }

    function getActiveTier(address user, bytes32) external view returns (uint8) {
        return _tier[user];
    }
}
