// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./RoleManager.sol";
import "./libraries/TierTypes.sol";

// Custom errors
error TRMLAlreadyInit();
error TRMLInvalidAddr();
error TRMLNotActive();
error TRMLInsufficientPay();
error TRMLMustUpgrade();
error TRMLNoTier();
error TRMLArrayMismatch();

/**
 * @title TieredRoleManagerLite
 * @notice Lightweight version of TieredRoleManager for gas-constrained deployments
 */
contract TieredRoleManagerLite is RoleManager {

    bool private _initialized;

    mapping(bytes32 => mapping(MembershipTier => TierMetadata)) public tierMetadata;
    mapping(address => mapping(bytes32 => MembershipTier)) public userTiers;
    mapping(address => mapping(bytes32 => uint256)) public tierPurchases;
    mapping(address => mapping(bytes32 => uint256)) public membershipExpiration;
    mapping(address => mapping(bytes32 => UsageStats)) public usageStats;

    event TierPurchased(address indexed user, bytes32 indexed role, MembershipTier tier, uint256 price);
    event TierUpgraded(address indexed user, bytes32 indexed role, MembershipTier fromTier, MembershipTier toTier);
    event MembershipExtended(address indexed user, bytes32 indexed role, uint256 newExpiration);
    event TierMetadataUpdated(bytes32 indexed role, MembershipTier tier);

    constructor() RoleManager() {
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
    }

    function initialize(address admin) external {
        if (_initialized) revert TRMLAlreadyInit();
        if (admin == address(0)) revert TRMLInvalidAddr();
        _initialized = true;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _revokeRole(DEFAULT_ADMIN_ROLE, SAFE_SINGLETON_FACTORY);
    }

    // ========== Admin ==========
    function setTierMetadata(
        bytes32 role, MembershipTier tier, string calldata name, string calldata description,
        uint256 price, TierLimits calldata limits, bool isActive
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierMetadata[role][tier] = TierMetadata(name, description, price, limits, isActive);
        emit TierMetadataUpdated(role, tier);
    }

    function batchSetTierMetadata(
        bytes32[] calldata roles, MembershipTier[] calldata tiers, string[] calldata names,
        string[] calldata descriptions, uint256[] calldata prices, TierLimits[] calldata limits, bool[] calldata isActives
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 len = roles.length;
        if (tiers.length != len || names.length != len || descriptions.length != len ||
            prices.length != len || limits.length != len || isActives.length != len) revert TRMLArrayMismatch();
        for (uint256 i = 0; i < len; i++) {
            tierMetadata[roles[i]][tiers[i]] = TierMetadata(names[i], descriptions[i], prices[i], limits[i], isActives[i]);
        }
    }

    function setTierActive(bytes32 role, MembershipTier tier, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierMetadata[role][tier].isActive = active;
    }

    // ========== Purchase ==========
    function purchaseTier(bytes32 role, MembershipTier tier) external payable whenNotPaused nonReentrant {
        TierMetadata storage meta = tierMetadata[role][tier];
        if (!meta.isActive) revert TRMLNotActive();
        if (msg.value < meta.price) revert TRMLInsufficientPay();

        MembershipTier current = userTiers[msg.sender][role];
        if (uint8(tier) <= uint8(current)) revert TRMLMustUpgrade();

        userTiers[msg.sender][role] = tier;
        tierPurchases[msg.sender][role] = block.timestamp;

        if (membershipExpiration[msg.sender][role] == 0) {
            membershipExpiration[msg.sender][role] = block.timestamp + 30 days;
        }

        emit TierPurchased(msg.sender, role, tier, msg.value);
        if (current != MembershipTier.NONE) emit TierUpgraded(msg.sender, role, current, tier);

        if (msg.value > meta.price) payable(msg.sender).transfer(msg.value - meta.price);
    }

    // ========== Membership ==========
    function extendMembership(bytes32 role, uint256 days_) external payable whenNotPaused nonReentrant {
        if (userTiers[msg.sender][role] == MembershipTier.NONE) revert TRMLNoTier();

        TierMetadata storage meta = tierMetadata[role][userTiers[msg.sender][role]];
        uint256 cost = (meta.price * days_) / 365;
        if (msg.value < cost) revert TRMLInsufficientPay();

        uint256 start = membershipExpiration[msg.sender][role] > block.timestamp
            ? membershipExpiration[msg.sender][role] : block.timestamp;
        membershipExpiration[msg.sender][role] = start + (days_ * 1 days);

        emit MembershipExtended(msg.sender, role, membershipExpiration[msg.sender][role]);
        if (msg.value > cost) payable(msg.sender).transfer(msg.value - cost);
    }

    // ========== Usage ==========
    function recordUsage(address user, bytes32 role, uint8 t) external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(OPERATIONS_ADMIN_ROLE, msg.sender)) revert RMNotActive();
        UsageStats storage s = usageStats[user][role];
        if (block.timestamp > s.lastDailyReset + 1 days) { s.dailyBetsCount = 0; s.dailyWithdrawals = 0; s.lastDailyReset = block.timestamp; }
        if (block.timestamp > s.lastWeeklyReset + 7 days) { s.weeklyBetsCount = 0; s.lastWeeklyReset = block.timestamp; }
        if (block.timestamp > s.lastMonthlyReset + 30 days) { s.monthlyMarketsCreated = 0; s.lastMonthlyReset = block.timestamp; }
        if (t == 0) { s.dailyBetsCount++; s.weeklyBetsCount++; } else if (t == 1) s.monthlyMarketsCreated++; else s.dailyWithdrawals++;
    }

    function checkUsageLimit(address user, bytes32 role, uint8 t) external view returns (bool, uint256, uint256) {
        MembershipTier tier = userTiers[user][role];
        if (tier == MembershipTier.NONE) return (false, 0, 0);
        TierLimits memory l = tierMetadata[role][tier].limits;
        UsageStats memory s = usageStats[user][role];
        if (t == 0) return (s.dailyBetsCount < l.dailyBetLimit, s.dailyBetsCount, l.dailyBetLimit);
        if (t == 1) return (s.weeklyBetsCount < l.weeklyBetLimit, s.weeklyBetsCount, l.weeklyBetLimit);
        if (t == 2) return (s.monthlyMarketsCreated < l.monthlyMarketCreation, s.monthlyMarketsCreated, l.monthlyMarketCreation);
        return (s.dailyWithdrawals < l.withdrawalLimit, s.dailyWithdrawals, l.withdrawalLimit);
    }

    // ========== Admin Grant ==========
    function grantTier(address user, bytes32 role, MembershipTier tier, uint256 days_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        userTiers[user][role] = tier;
        tierPurchases[user][role] = block.timestamp;
        membershipExpiration[user][role] = block.timestamp + (days_ * 1 days);
        emit TierPurchased(user, role, tier, 0);
    }

    function withdrawFunds(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert TRMLInvalidAddr();
        to.transfer(amount);
    }

    // View - tierMetadata is public so getTierLimits/getTierPrice/isTierActive can be accessed via tierMetadata()
    function getUserTier(address u, bytes32 r) external view returns (MembershipTier) {
        if (membershipExpiration[u][r] > 0 && block.timestamp > membershipExpiration[u][r]) return MembershipTier.NONE;
        return userTiers[u][r];
    }
}
