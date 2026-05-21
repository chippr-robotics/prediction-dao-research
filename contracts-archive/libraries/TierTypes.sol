// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title TierTypes
 * @notice Shared types for tiered membership system
 */

// ========== Tier Definitions ==========

enum MembershipTier {
    NONE,       // 0 - No membership
    BRONZE,     // 1 - Basic tier
    SILVER,     // 2 - Intermediate tier
    GOLD,       // 3 - Advanced tier
    PLATINUM    // 4 - Premium tier
}

enum MembershipDuration {
    ONE_MONTH,      // 30 days
    THREE_MONTHS,   // 90 days
    SIX_MONTHS,     // 180 days
    TWELVE_MONTHS,  // 365 days
    ENTERPRISE      // Custom/unlimited duration
}

// ========== Tier Metadata ==========

struct TierLimits {
    uint256 dailyBetLimit;           // Max bets per day
    uint256 weeklyBetLimit;          // Max bets per week
    uint256 monthlyMarketCreation;   // Max markets created per month
    uint256 maxPositionSize;         // Max position size in wei
    uint256 maxConcurrentMarkets;    // Max active markets at once
    uint256 withdrawalLimit;         // Daily withdrawal limit
    bool canCreatePrivateMarkets;    // Can create private markets
    bool canUseAdvancedFeatures;     // Access to advanced features
    uint256 feeDiscount;             // Fee discount in basis points (100 = 1%)
}

struct TierMetadata {
    string name;
    string description;
    uint256 price;                   // Upgrade price from previous tier
    TierLimits limits;
    bool isActive;
}

// ========== Usage Tracking ==========

struct UsageStats {
    uint256 dailyBetsCount;
    uint256 weeklyBetsCount;
    uint256 monthlyMarketsCreated;
    uint256 dailyWithdrawals;
    uint256 activeMarketsCount;
    uint256 lastDailyReset;
    uint256 lastWeeklyReset;
    uint256 lastMonthlyReset;
}
