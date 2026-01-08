// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./RoleManager.sol";

/**
 * @title TieredRoleManagerLite
 * @notice Lightweight version of TieredRoleManager for gas-constrained deployments
 * @dev Tier metadata is set via admin functions post-deployment instead of in constructor.
 *      This reduces bytecode size to fit within EVM limits on low-gas-limit chains.
 */
contract TieredRoleManagerLite is RoleManager {
    using SafeERC20 for IERC20;

    bool private _initialized;
    
    // ========== Tier Definitions ==========
    
    enum MembershipTier {
        NONE,       // 0 - No membership
        BRONZE,     // 1 - Basic tier
        SILVER,     // 2 - Intermediate tier
        GOLD,       // 3 - Advanced tier
        PLATINUM    // 4 - Premium tier
    }
    
    // ========== Tier Metadata ==========
    
    struct TierLimits {
        uint256 dailyBetLimit;
        uint256 weeklyBetLimit;
        uint256 monthlyMarketCreation;
        uint256 maxPositionSize;
        uint256 maxConcurrentMarkets;
        uint256 withdrawalLimit;
        bool canCreatePrivateMarkets;
        bool canUseAdvancedFeatures;
        uint256 feeDiscount;
    }
    
    struct TierMetadata {
        string name;
        string description;
        uint256 price;
        TierLimits limits;
        bool isActive;
    }
    
    // role => tier => TierMetadata
    mapping(bytes32 => mapping(MembershipTier => TierMetadata)) public tierMetadata;
    
    // user => role => current tier
    mapping(address => mapping(bytes32 => MembershipTier)) public userTiers;
    
    // user => role => tier => purchase timestamp
    mapping(address => mapping(bytes32 => mapping(MembershipTier => uint256))) public tierPurchases;
    
    // ========== Membership Duration Tracking ==========
    
    enum MembershipDuration {
        ONE_MONTH,
        THREE_MONTHS,
        SIX_MONTHS,
        TWELVE_MONTHS,
        ENTERPRISE
    }
    
    mapping(address => mapping(bytes32 => uint256)) public membershipExpiration;
    mapping(address => mapping(bytes32 => MembershipDuration)) public membershipDurationType;
    
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
    
    mapping(address => mapping(bytes32 => UsageStats)) public usageStats;
    
    // ========== Events ==========
    
    event TierPurchased(address indexed user, bytes32 indexed role, MembershipTier tier, uint256 price);
    event TierUpgraded(address indexed user, bytes32 indexed role, MembershipTier fromTier, MembershipTier toTier);
    event UsageLimitExceeded(address indexed user, bytes32 indexed role, string limitType);
    event UsageRecorded(address indexed user, bytes32 indexed role, string actionType);
    event MembershipExtended(address indexed user, bytes32 indexed role, uint256 newExpiration, MembershipDuration duration);
    event MembershipExpired(address indexed user, bytes32 indexed role);
    event TierPriceUpdated(bytes32 indexed role, MembershipTier tier, uint256 newPrice);
    event TierLimitsUpdated(bytes32 indexed role, MembershipTier tier);
    event TierMetadataUpdated(bytes32 indexed role, MembershipTier tier, string name, string description);
    event TierActiveStatusChanged(bytes32 indexed role, MembershipTier tier, bool active);
    
    // ========== Constructor ==========
    
    constructor() RoleManager() {
        // For direct deployments, prevent initialize() from being called.
        // For Safe Singleton Factory (CREATE2) deployments, allow a one-time initialize().
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
    }

    /**
     * @notice Initialize admin after deterministic deployment (CREATE2)
     */
    function initialize(address admin) external {
        require(!_initialized, "Already initialized");
        require(admin != address(0), "Invalid admin");
        _initialized = true;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _revokeRole(DEFAULT_ADMIN_ROLE, SAFE_SINGLETON_FACTORY);
    }
    
    // ========== Admin Functions for Tier Setup ==========
    
    /**
     * @notice Set tier metadata for a role (admin only)
     * @dev Use this to configure tiers post-deployment
     */
    function setTierMetadata(
        bytes32 role,
        MembershipTier tier,
        string calldata name,
        string calldata description,
        uint256 price,
        TierLimits calldata limits,
        bool isActive
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierMetadata[role][tier] = TierMetadata({
            name: name,
            description: description,
            price: price,
            limits: limits,
            isActive: isActive
        });
        emit TierMetadataUpdated(role, tier, name, description);
        if (isActive) {
            emit TierActiveStatusChanged(role, tier, true);
        }
    }

    /**
     * @notice Batch set multiple tier metadata entries
     */
    function batchSetTierMetadata(
        bytes32[] calldata roles,
        MembershipTier[] calldata tiers,
        string[] calldata names,
        string[] calldata descriptions,
        uint256[] calldata prices,
        TierLimits[] calldata limits,
        bool[] calldata isActives
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 len = roles.length;
        require(
            tiers.length == len &&
            names.length == len &&
            descriptions.length == len &&
            prices.length == len &&
            limits.length == len &&
            isActives.length == len,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < len; i++) {
            tierMetadata[roles[i]][tiers[i]] = TierMetadata({
                name: names[i],
                description: descriptions[i],
                price: prices[i],
                limits: limits[i],
                isActive: isActives[i]
            });
            emit TierMetadataUpdated(roles[i], tiers[i], names[i], descriptions[i]);
        }
    }
    
    /**
     * @notice Update tier price
     */
    function updateTierPrice(
        bytes32 role,
        MembershipTier tier,
        uint256 newPrice
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierMetadata[role][tier].price = newPrice;
        emit TierPriceUpdated(role, tier, newPrice);
    }
    
    /**
     * @notice Update tier limits
     */
    function updateTierLimits(
        bytes32 role,
        MembershipTier tier,
        TierLimits calldata newLimits
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierMetadata[role][tier].limits = newLimits;
        emit TierLimitsUpdated(role, tier);
    }
    
    /**
     * @notice Toggle tier active status
     */
    function setTierActive(
        bytes32 role,
        MembershipTier tier,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierMetadata[role][tier].isActive = active;
        emit TierActiveStatusChanged(role, tier, active);
    }
    
    // ========== Tier Query Functions ==========
    
    function getUserTier(address user, bytes32 role) external view returns (MembershipTier) {
        if (membershipExpiration[user][role] > 0 && block.timestamp > membershipExpiration[user][role]) {
            return MembershipTier.NONE;
        }
        return userTiers[user][role];
    }
    
    function getTierLimits(bytes32 role, MembershipTier tier) external view returns (TierLimits memory) {
        return tierMetadata[role][tier].limits;
    }
    
    function isTierActive(bytes32 role, MembershipTier tier) external view returns (bool) {
        return tierMetadata[role][tier].isActive;
    }
    
    function getTierPrice(bytes32 role, MembershipTier tier) external view returns (uint256) {
        return tierMetadata[role][tier].price;
    }
    
    // ========== Tier Purchase Functions ==========
    
    function purchaseTier(bytes32 role, MembershipTier tier) external payable whenNotPaused nonReentrant {
        TierMetadata storage metadata = tierMetadata[role][tier];
        require(metadata.isActive, "Tier not active");
        require(msg.value >= metadata.price, "Insufficient payment");
        
        MembershipTier currentTier = userTiers[msg.sender][role];
        require(uint8(tier) > uint8(currentTier), "Must upgrade to higher tier");
        
        userTiers[msg.sender][role] = tier;
        tierPurchases[msg.sender][role][tier] = block.timestamp;
        
        // Set default 30-day membership if not set
        if (membershipExpiration[msg.sender][role] == 0) {
            membershipExpiration[msg.sender][role] = block.timestamp + 30 days;
            membershipDurationType[msg.sender][role] = MembershipDuration.ONE_MONTH;
        }
        
        emit TierPurchased(msg.sender, role, tier, msg.value);
        
        if (currentTier != MembershipTier.NONE) {
            emit TierUpgraded(msg.sender, role, currentTier, tier);
        }
        
        // Refund excess
        if (msg.value > metadata.price) {
            payable(msg.sender).transfer(msg.value - metadata.price);
        }
    }
    
    // ========== Usage Tracking ==========
    
    function recordUsage(address user, bytes32 role, string calldata actionType) external {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender) ||
            hasRole(OPERATIONS_ADMIN_ROLE, msg.sender),
            "Not authorized"
        );
        
        UsageStats storage stats = usageStats[user][role];
        
        // Reset counters if needed
        if (block.timestamp > stats.lastDailyReset + 1 days) {
            stats.dailyBetsCount = 0;
            stats.dailyWithdrawals = 0;
            stats.lastDailyReset = block.timestamp;
        }
        if (block.timestamp > stats.lastWeeklyReset + 7 days) {
            stats.weeklyBetsCount = 0;
            stats.lastWeeklyReset = block.timestamp;
        }
        if (block.timestamp > stats.lastMonthlyReset + 30 days) {
            stats.monthlyMarketsCreated = 0;
            stats.lastMonthlyReset = block.timestamp;
        }
        
        // Record based on action type
        bytes32 actionHash = keccak256(bytes(actionType));
        if (actionHash == keccak256("bet")) {
            stats.dailyBetsCount++;
            stats.weeklyBetsCount++;
        } else if (actionHash == keccak256("market")) {
            stats.monthlyMarketsCreated++;
        } else if (actionHash == keccak256("withdrawal")) {
            stats.dailyWithdrawals++;
        }
        
        emit UsageRecorded(user, role, actionType);
    }
    
    function checkUsageLimit(
        address user,
        bytes32 role,
        string calldata limitType
    ) external view returns (bool withinLimit, uint256 current, uint256 max) {
        MembershipTier tier = userTiers[user][role];
        if (tier == MembershipTier.NONE) {
            return (false, 0, 0);
        }
        
        TierLimits memory limits = tierMetadata[role][tier].limits;
        UsageStats memory stats = usageStats[user][role];
        
        bytes32 limitHash = keccak256(bytes(limitType));
        
        if (limitHash == keccak256("dailyBet")) {
            return (stats.dailyBetsCount < limits.dailyBetLimit, stats.dailyBetsCount, limits.dailyBetLimit);
        } else if (limitHash == keccak256("weeklyBet")) {
            return (stats.weeklyBetsCount < limits.weeklyBetLimit, stats.weeklyBetsCount, limits.weeklyBetLimit);
        } else if (limitHash == keccak256("monthlyMarket")) {
            return (stats.monthlyMarketsCreated < limits.monthlyMarketCreation, stats.monthlyMarketsCreated, limits.monthlyMarketCreation);
        } else if (limitHash == keccak256("withdrawal")) {
            return (stats.dailyWithdrawals < limits.withdrawalLimit, stats.dailyWithdrawals, limits.withdrawalLimit);
        }
        
        return (true, 0, type(uint256).max);
    }
    
    // ========== Membership Extension ==========
    
    function extendMembership(
        bytes32 role,
        MembershipDuration duration
    ) external payable whenNotPaused nonReentrant {
        MembershipTier tier = userTiers[msg.sender][role];
        require(tier != MembershipTier.NONE, "No active tier");
        
        uint256 extensionDays;
        uint256 discount;
        
        if (duration == MembershipDuration.ONE_MONTH) {
            extensionDays = 30;
            discount = 0;
        } else if (duration == MembershipDuration.THREE_MONTHS) {
            extensionDays = 90;
            discount = 1000; // 10% discount
        } else if (duration == MembershipDuration.SIX_MONTHS) {
            extensionDays = 180;
            discount = 2000; // 20% discount
        } else if (duration == MembershipDuration.TWELVE_MONTHS) {
            extensionDays = 365;
            discount = 3000; // 30% discount
        } else {
            revert("Invalid duration");
        }
        
        uint256 basePrice = tierMetadata[role][tier].price;
        uint256 monthlyRate = basePrice / 12; // Simplified
        uint256 totalPrice = (monthlyRate * extensionDays) / 30;
        uint256 discountedPrice = totalPrice - (totalPrice * discount / 10000);
        
        require(msg.value >= discountedPrice, "Insufficient payment");
        
        uint256 currentExpiration = membershipExpiration[msg.sender][role];
        uint256 startFrom = currentExpiration > block.timestamp ? currentExpiration : block.timestamp;
        membershipExpiration[msg.sender][role] = startFrom + (extensionDays * 1 days);
        membershipDurationType[msg.sender][role] = duration;
        
        emit MembershipExtended(msg.sender, role, membershipExpiration[msg.sender][role], duration);
        
        if (msg.value > discountedPrice) {
            payable(msg.sender).transfer(msg.value - discountedPrice);
        }
    }
    
    // ========== Admin Grant Tier ==========
    
    function grantTier(
        address user,
        bytes32 role,
        MembershipTier tier,
        uint256 durationDays
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        userTiers[user][role] = tier;
        tierPurchases[user][role][tier] = block.timestamp;
        membershipExpiration[user][role] = block.timestamp + (durationDays * 1 days);
        
        emit TierPurchased(user, role, tier, 0);
    }
    
    // ========== Withdraw Funds ==========
    
    function withdrawFunds(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid address");
        require(amount <= address(this).balance, "Insufficient balance");
        to.transfer(amount);
    }
    
    receive() external payable {}
}
