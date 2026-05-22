// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMembershipManager
/// @notice Surface area used by WagerRegistry and frontend integrators.
interface IMembershipManager {
    enum Tier { None, Bronze, Silver, Gold, Platinum }

    struct Limits {
        uint32 monthlyMarketCreation;
        uint32 maxConcurrentMarkets;
    }

    struct TierConfig {
        uint128 priceUSDC;
        uint32  durationDays;
        bool    active;
        Limits  limits;
    }

    struct Membership {
        Tier    tier;
        uint64  expiresAt;
        uint32  monthCount;
        uint32  activeCount;
        uint64  monthAnchor;
    }

    // Hooks (authorized callers only)
    function checkCanCreate(address user, bytes32 role) external view returns (bool);
    function recordCreate(address user, bytes32 role) external;
    function recordClose(address user, bytes32 role) external;

    // Views
    function hasActiveRole(address user, bytes32 role) external view returns (bool);
    function getActiveTier(address user, bytes32 role) external view returns (Tier);
    function getMembership(address user, bytes32 role) external view returns (Membership memory);
    function getTierConfig(bytes32 role, Tier tier) external view returns (TierConfig memory);
}
