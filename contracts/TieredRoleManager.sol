// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./RoleManager.sol";

/**
 * @title TieredRoleManager
 * @notice Extends RoleManager with tiered membership levels (Bronze, Silver, Gold, Platinum)
 * @dev Each product role can have multiple tiers with different permissions and limits
 */
contract TieredRoleManager is RoleManager {
    
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
    
    // role => tier => TierMetadata
    mapping(bytes32 => mapping(MembershipTier => TierMetadata)) public tierMetadata;
    
    // user => role => current tier
    mapping(address => mapping(bytes32 => MembershipTier)) public userTiers;
    
    // user => role => tier => purchase timestamp
    mapping(address => mapping(bytes32 => mapping(MembershipTier => uint256))) public tierPurchases;
    
    // ========== Usage Tracking ==========
    
    struct UsageStats {
        uint256 dailyBetsCount;
        uint256 weeklyBetsCount;
        uint256 monthlyMarketsCreated;
        uint256 dailyWithdrawals;
        uint256 activeMar ketsCount;
        uint256 lastDailyReset;
        uint256 lastWeeklyReset;
        uint256 lastMonthlyReset;
    }
    
    // user => role => usage stats
    mapping(address => mapping(bytes32 => UsageStats)) public usageStats;
    
    // ========== Events ==========
    
    event TierPurchased(address indexed user, bytes32 indexed role, MembershipTier tier, uint256 price);
    event TierUpgraded(address indexed user, bytes32 indexed role, MembershipTier fromTier, MembershipTier toTier);
    event UsageLimitExceeded(address indexed user, bytes32 indexed role, string limitType);
    event UsageRecorded(address indexed user, bytes32 indexed role, string actionType);
    
    // ========== Constructor ==========
    
    constructor() RoleManager() {
        _initializeTierMetadata();
    }
    
    // ========== Tier Metadata Initialization ==========
    
    function _initializeTierMetadata() internal {
        // MARKET_MAKER Role Tiers
        _initializeMarketMakerTiers();
        
        // CLEARPATH_USER Role Tiers
        _initializeClearPathTiers();
        
        // TOKENMINT Role Tiers
        _initializeTokenMintTiers();
    }
    
    function _initializeMarketMakerTiers() internal {
        bytes32 role = MARKET_MAKER_ROLE;
        
        // Bronze Tier - Basic market maker
        tierMetadata[role][MembershipTier.BRONZE] = TierMetadata({
            name: "Market Maker Bronze",
            description: "Basic market creation capabilities",
            price: 100 ether,
            limits: TierLimits({
                dailyBetLimit: 10,
                weeklyBetLimit: 50,
                monthlyMarketCreation: 5,
                maxPositionSize: 10 ether,
                maxConcurrentMarkets: 3,
                withdrawalLimit: 50 ether,
                canCreatePrivateMarkets: false,
                canUseAdvancedFeatures: false,
                feeDiscount: 0 // No discount
            }),
            isActive: true
        });
        
        // Silver Tier - Intermediate market maker
        tierMetadata[role][MembershipTier.SILVER] = TierMetadata({
            name: "Market Maker Silver",
            description: "Enhanced market creation with more limits",
            price: 150 ether, // Upgrade cost from Bronze
            limits: TierLimits({
                dailyBetLimit: 25,
                weeklyBetLimit: 150,
                monthlyMarketCreation: 15,
                maxPositionSize: 50 ether,
                maxConcurrentMarkets: 10,
                withdrawalLimit: 200 ether,
                canCreatePrivateMarkets: false,
                canUseAdvancedFeatures: true,
                feeDiscount: 500 // 5% discount
            }),
            isActive: true
        });
        
        // Gold Tier - Advanced market maker
        tierMetadata[role][MembershipTier.GOLD] = TierMetadata({
            name: "Market Maker Gold",
            description: "Professional market creation capabilities",
            price: 250 ether,
            limits: TierLimits({
                dailyBetLimit: 100,
                weeklyBetLimit: 500,
                monthlyMarketCreation: 50,
                maxPositionSize: 200 ether,
                maxConcurrentMarkets: 30,
                withdrawalLimit: 1000 ether,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 1000 // 10% discount
            }),
            isActive: true
        });
        
        // Platinum Tier - Premium market maker
        tierMetadata[role][MembershipTier.PLATINUM] = TierMetadata({
            name: "Market Maker Platinum",
            description: "Unlimited market creation for institutions",
            price: 500 ether,
            limits: TierLimits({
                dailyBetLimit: type(uint256).max, // Unlimited
                weeklyBetLimit: type(uint256).max,
                monthlyMarketCreation: type(uint256).max,
                maxPositionSize: type(uint256).max,
                maxConcurrentMarkets: type(uint256).max,
                withdrawalLimit: type(uint256).max,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 2000 // 20% discount
            }),
            isActive: true
        });
    }
    
    function _initializeClearPathTiers() internal {
        bytes32 role = CLEARPATH_USER_ROLE;
        
        // Bronze Tier - Basic DAO governance
        tierMetadata[role][MembershipTier.BRONZE] = TierMetadata({
            name: "ClearPath Bronze",
            description: "Basic DAO governance access",
            price: 250 ether,
            limits: TierLimits({
                dailyBetLimit: 5,
                weeklyBetLimit: 20,
                monthlyMarketCreation: 2,
                maxPositionSize: 5 ether,
                maxConcurrentMarkets: 2,
                withdrawalLimit: 25 ether,
                canCreatePrivateMarkets: false,
                canUseAdvancedFeatures: false,
                feeDiscount: 0
            }),
            isActive: true
        });
        
        // Silver Tier - Enhanced governance
        tierMetadata[role][MembershipTier.SILVER] = TierMetadata({
            name: "ClearPath Silver",
            description: "Enhanced DAO governance features",
            price: 200 ether,
            limits: TierLimits({
                dailyBetLimit: 15,
                weeklyBetLimit: 75,
                monthlyMarketCreation: 10,
                maxPositionSize: 25 ether,
                maxConcurrentMarkets: 5,
                withdrawalLimit: 100 ether,
                canCreatePrivateMarkets: false,
                canUseAdvancedFeatures: true,
                feeDiscount: 500 // 5%
            }),
            isActive: true
        });
        
        // Gold Tier - Professional governance
        tierMetadata[role][MembershipTier.GOLD] = TierMetadata({
            name: "ClearPath Gold",
            description: "Professional DAO management",
            price: 350 ether,
            limits: TierLimits({
                dailyBetLimit: 50,
                weeklyBetLimit: 300,
                monthlyMarketCreation: 30,
                maxPositionSize: 100 ether,
                maxConcurrentMarkets: 15,
                withdrawalLimit: 500 ether,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 1000 // 10%
            }),
            isActive: true
        });
        
        // Platinum Tier - Enterprise governance
        tierMetadata[role][MembershipTier.PLATINUM] = TierMetadata({
            name: "ClearPath Platinum",
            description: "Enterprise-grade DAO governance",
            price: 750 ether,
            limits: TierLimits({
                dailyBetLimit: type(uint256).max,
                weeklyBetLimit: type(uint256).max,
                monthlyMarketCreation: type(uint256).max,
                maxPositionSize: type(uint256).max,
                maxConcurrentMarkets: type(uint256).max,
                withdrawalLimit: type(uint256).max,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 2500 // 25%
            }),
            isActive: true
        });
    }
    
    function _initializeTokenMintTiers() internal {
        bytes32 role = TOKENMINT_ROLE;
        
        // Bronze Tier - Basic token operations
        tierMetadata[role][MembershipTier.BRONZE] = TierMetadata({
            name: "TokenMint Bronze",
            description: "Basic NFT and token minting",
            price: 150 ether,
            limits: TierLimits({
                dailyBetLimit: 0, // Not applicable
                weeklyBetLimit: 0,
                monthlyMarketCreation: 10, // Monthly mints
                maxPositionSize: 100 ether, // Max mint value
                maxConcurrentMarkets: 5, // Active token contracts
                withdrawalLimit: 50 ether,
                canCreatePrivateMarkets: false,
                canUseAdvancedFeatures: false,
                feeDiscount: 0
            }),
            isActive: true
        });
        
        // Silver Tier - Enhanced token operations
        tierMetadata[role][MembershipTier.SILVER] = TierMetadata({
            name: "TokenMint Silver",
            description: "Enhanced token management features",
            price: 200 ether,
            limits: TierLimits({
                dailyBetLimit: 0,
                weeklyBetLimit: 0,
                monthlyMarketCreation: 30,
                maxPositionSize: 500 ether,
                maxConcurrentMarkets: 15,
                withdrawalLimit: 200 ether,
                canCreatePrivateMarkets: false,
                canUseAdvancedFeatures: true,
                feeDiscount: 500 // 5%
            }),
            isActive: true
        });
        
        // Gold Tier - Professional token operations
        tierMetadata[role][MembershipTier.GOLD] = TierMetadata({
            name: "TokenMint Gold",
            description: "Professional NFT and token suite",
            price: 350 ether,
            limits: TierLimits({
                dailyBetLimit: 0,
                weeklyBetLimit: 0,
                monthlyMarketCreation: 100,
                maxPositionSize: 2000 ether,
                maxConcurrentMarkets: 50,
                withdrawalLimit: 1000 ether,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 1000 // 10%
            }),
            isActive: true
        });
        
        // Platinum Tier - Enterprise token operations
        tierMetadata[role][MembershipTier.PLATINUM] = TierMetadata({
            name: "TokenMint Platinum",
            description: "Enterprise token infrastructure",
            price: 600 ether,
            limits: TierLimits({
                dailyBetLimit: 0,
                weeklyBetLimit: 0,
                monthlyMarketCreation: type(uint256).max,
                maxPositionSize: type(uint256).max,
                maxConcurrentMarkets: type(uint256).max,
                withdrawalLimit: type(uint256).max,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 2000 // 20%
            }),
            isActive: true
        });
    }
    
    // ========== Tier Purchase & Upgrade Functions ==========
    
    /**
     * @notice Purchase a role at specific tier
     * @param role The role to purchase
     * @param tier The membership tier
     */
    function purchaseRoleWithTier(bytes32 role, MembershipTier tier) external payable nonReentrant whenNotPaused {
        require(tier != MembershipTier.NONE, "Invalid tier");
        require(userTiers[msg.sender][role] == MembershipTier.NONE, "Already has role, use upgradeTier");
        
        TierMetadata storage tierMeta = tierMetadata[role][tier];
        require(tierMeta.isActive, "Tier not active");
        require(msg.value >= tierMeta.price, "Insufficient payment");
        
        RoleMetadata storage roleMeta = roleMetadata[role];
        require(roleMeta.isPremium, "Role is not purchasable");
        require(roleMeta.maxMembers == 0 || roleMeta.currentMembers < roleMeta.maxMembers, "Role at max capacity");
        
        // Grant role and set tier
        _grantRole(role, msg.sender);
        userTiers[msg.sender][role] = tier;
        tierPurchases[msg.sender][role][tier] = block.timestamp;
        roleMeta.currentMembers++;
        
        // Initialize usage stats
        _initializeUsageStats(msg.sender, role);
        
        emit TierPurchased(msg.sender, role, tier, msg.value);
        
        // Refund excess
        if (msg.value > tierMeta.price) {
            payable(msg.sender).transfer(msg.value - tierMeta.price);
        }
    }
    
    /**
     * @notice Upgrade to a higher tier
     * @param role The role to upgrade
     * @param newTier The new tier
     */
    function upgradeTier(bytes32 role, MembershipTier newTier) external payable nonReentrant whenNotPaused {
        MembershipTier currentTier = userTiers[msg.sender][role];
        require(currentTier != MembershipTier.NONE, "Must have role first");
        require(newTier > currentTier, "Can only upgrade to higher tier");
        
        TierMetadata storage tierMeta = tierMetadata[role][newTier];
        require(tierMeta.isActive, "Tier not active");
        require(msg.value >= tierMeta.price, "Insufficient payment");
        
        // Upgrade tier
        userTiers[msg.sender][role] = newTier;
        tierPurchases[msg.sender][role][newTier] = block.timestamp;
        
        emit TierUpgraded(msg.sender, role, currentTier, newTier);
        
        // Refund excess
        if (msg.value > tierMeta.price) {
            payable(msg.sender).transfer(msg.value - tierMeta.price);
        }
    }
    
    // ========== Usage Tracking & Enforcement ==========
    
    function _initializeUsageStats(address user, bytes32 role) internal {
        usageStats[user][role] = UsageStats({
            dailyBetsCount: 0,
            weeklyBetsCount: 0,
            monthlyMarketsCreated: 0,
            dailyWithdrawals: 0,
            activeMarketsCount: 0,
            lastDailyReset: block.timestamp,
            lastWeeklyReset: block.timestamp,
            lastMonthlyReset: block.timestamp
        });
    }
    
    /**
     * @notice Check and enforce bet limit
     * @param role The role to check
     * @return allowed Whether the action is allowed
     */
    function checkBetLimit(bytes32 role) external returns (bool allowed) {
        _resetUsageIfNeeded(msg.sender, role);
        
        MembershipTier tier = userTiers[msg.sender][role];
        require(tier != MembershipTier.NONE, "No tier found");
        
        TierLimits storage limits = tierMetadata[role][tier].limits;
        UsageStats storage stats = usageStats[msg.sender][role];
        
        if (stats.dailyBetsCount >= limits.dailyBetLimit || stats.weeklyBetsCount >= limits.weeklyBetLimit) {
            emit UsageLimitExceeded(msg.sender, role, "bet_limit");
            return false;
        }
        
        stats.dailyBetsCount++;
        stats.weeklyBetsCount++;
        emit UsageRecorded(msg.sender, role, "bet");
        
        return true;
    }
    
    /**
     * @notice Check and enforce market creation limit
     * @param role The role to check
     * @return allowed Whether the action is allowed
     */
    function checkMarketCreationLimit(bytes32 role) external returns (bool allowed) {
        _resetUsageIfNeeded(msg.sender, role);
        
        MembershipTier tier = userTiers[msg.sender][role];
        require(tier != MembershipTier.NONE, "No tier found");
        
        TierLimits storage limits = tierMetadata[role][tier].limits;
        UsageStats storage stats = usageStats[msg.sender][role];
        
        if (stats.monthlyMarketsCreated >= limits.monthlyMarketCreation || 
            stats.activeMarketsCount >= limits.maxConcurrentMarkets) {
            emit UsageLimitExceeded(msg.sender, role, "market_creation");
            return false;
        }
        
        stats.monthlyMarketsCreated++;
        stats.activeMarketsCount++;
        emit UsageRecorded(msg.sender, role, "market_created");
        
        return true;
    }
    
    /**
     * @notice Record market closure
     */
    function recordMarketClosure(bytes32 role) external {
        UsageStats storage stats = usageStats[msg.sender][role];
        if (stats.activeMarketsCount > 0) {
            stats.activeMarketsCount--;
        }
    }
    
    /**
     * @notice Check withdrawal limit
     * @param role The role to check
     * @param amount The withdrawal amount
     * @return allowed Whether the withdrawal is allowed
     */
    function checkWithdrawalLimit(bytes32 role, uint256 amount) external returns (bool allowed) {
        _resetUsageIfNeeded(msg.sender, role);
        
        MembershipTier tier = userTiers[msg.sender][role];
        require(tier != MembershipTier.NONE, "No tier found");
        
        TierLimits storage limits = tierMetadata[role][tier].limits;
        UsageStats storage stats = usageStats[msg.sender][role];
        
        if (stats.dailyWithdrawals + amount > limits.withdrawalLimit) {
            emit UsageLimitExceeded(msg.sender, role, "withdrawal_limit");
            return false;
        }
        
        stats.dailyWithdrawals += amount;
        emit UsageRecorded(msg.sender, role, "withdrawal");
        
        return true;
    }
    
    function _resetUsageIfNeeded(address user, bytes32 role) internal {
        UsageStats storage stats = usageStats[user][role];
        
        // Reset daily stats (24 hours)
        if (block.timestamp >= stats.lastDailyReset + 1 days) {
            stats.dailyBetsCount = 0;
            stats.dailyWithdrawals = 0;
            stats.lastDailyReset = block.timestamp;
        }
        
        // Reset weekly stats (7 days)
        if (block.timestamp >= stats.lastWeeklyReset + 7 days) {
            stats.weeklyBetsCount = 0;
            stats.lastWeeklyReset = block.timestamp;
        }
        
        // Reset monthly stats (30 days)
        if (block.timestamp >= stats.lastMonthlyReset + 30 days) {
            stats.monthlyMarketsCreated = 0;
            stats.lastMonthlyReset = block.timestamp;
        }
    }
    
    // ========== View Functions ==========
    
    /**
     * @notice Get user's current tier for a role
     */
    function getUserTier(address user, bytes32 role) external view returns (MembershipTier) {
        return userTiers[user][role];
    }
    
    /**
     * @notice Get tier metadata
     */
    function getTierMetadata(bytes32 role, MembershipTier tier) external view returns (TierMetadata memory) {
        return tierMetadata[role][tier];
    }
    
    /**
     * @notice Get tier limits
     */
    function getTierLimits(bytes32 role, MembershipTier tier) external view returns (TierLimits memory) {
        return tierMetadata[role][tier].limits;
    }
    
    /**
     * @notice Get user's usage stats
     */
    function getUserUsageStats(address user, bytes32 role) external view returns (UsageStats memory) {
        return usageStats[user][role];
    }
    
    /**
     * @notice Check if user can create private markets
     */
    function canCreatePrivateMarkets(address user, bytes32 role) external view returns (bool) {
        MembershipTier tier = userTiers[user][role];
        if (tier == MembershipTier.NONE) return false;
        return tierMetadata[role][tier].limits.canCreatePrivateMarkets;
    }
    
    /**
     * @notice Check if user can use advanced features
     */
    function canUseAdvancedFeatures(address user, bytes32 role) external view returns (bool) {
        MembershipTier tier = userTiers[user][role];
        if (tier == MembershipTier.NONE) return false;
        return tierMetadata[role][tier].limits.canUseAdvancedFeatures;
    }
    
    /**
     * @notice Get user's fee discount
     */
    function getFeeDiscount(address user, bytes32 role) external view returns (uint256) {
        MembershipTier tier = userTiers[user][role];
        if (tier == MembershipTier.NONE) return 0;
        return tierMetadata[role][tier].limits.feeDiscount;
    }
    
    // ========== Admin Functions ==========
    
    /**
     * @notice Update tier pricing (Operations Admin only)
     */
    function setTierPrice(bytes32 role, MembershipTier tier, uint256 newPrice) external onlyRole(OPERATIONS_ADMIN_ROLE) {
        tierMetadata[role][tier].price = newPrice;
    }
    
    /**
     * @notice Update tier limits (Core System Admin only)
     */
    function updateTierLimits(
        bytes32 role,
        MembershipTier tier,
        TierLimits memory newLimits
    ) external onlyRole(CORE_SYSTEM_ADMIN_ROLE) {
        tierMetadata[role][tier].limits = newLimits;
    }
    
    /**
     * @notice Toggle tier active status (Operations Admin only)
     */
    function setTierActive(bytes32 role, MembershipTier tier, bool isActive) external onlyRole(OPERATIONS_ADMIN_ROLE) {
        tierMetadata[role][tier].isActive = isActive;
    }
}
