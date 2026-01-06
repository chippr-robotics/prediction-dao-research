// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./RoleManager.sol";

/**
 * @title TieredRoleManager
 * @notice Extends RoleManager with tiered membership levels (Bronze, Silver, Gold, Platinum)
 * @dev Each product role can have multiple tiers with different permissions and limits
 */
contract TieredRoleManager is RoleManager {
    using SafeERC20 for IERC20;

    // NOTE: SAFE_SINGLETON_FACTORY is inherited from RoleManager

    bool private _initialized;

    bool private _marketMakerTiersInitialized;
    bool private _clearPathTiersInitialized;
    bool private _tokenMintTiersInitialized;
    bool private _friendMarketTiersInitialized;
    
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
    
    // ========== Membership Duration Tracking ==========
    
    enum MembershipDuration {
        ONE_MONTH,      // 30 days
        THREE_MONTHS,   // 90 days
        SIX_MONTHS,     // 180 days
        TWELVE_MONTHS,  // 365 days
        ENTERPRISE      // Custom/unlimited duration
    }
    
    // user => role => membership expiration timestamp
    mapping(address => mapping(bytes32 => uint256)) public membershipExpiration;
    
    // user => role => membership duration type
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
    
    // user => role => usage stats
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
        // For Safe Singleton Factory (CREATE2) deployments, allow a one-time initialize()
        // so DEFAULT_ADMIN_ROLE isn't stuck on the factory.
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
    }

    /**
     * @notice Initialize admin after deterministic deployment (CREATE2)
     * @dev Only callable once, intended for Safe Singleton Factory deployments.
     */
    function initialize(address admin) external {
        require(!_initialized, "Already initialized");
        require(admin != address(0), "Invalid admin");

        _initialized = true;

        // RoleManager constructor granted DEFAULT_ADMIN_ROLE to the deployer (the factory).
        // Hand it over to the intended admin and revoke the factory.
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _revokeRole(DEFAULT_ADMIN_ROLE, SAFE_SINGLETON_FACTORY);
    }

    /**
     * @notice Initialize tier metadata in smaller chunks.
     * @dev Tier metadata initialization writes a lot of storage and can exceed low block gas limits
     *      when done inside a constructor. These functions allow initializing the tiers post-deploy.
     */

    function initializeMarketMakerTiers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_marketMakerTiersInitialized, "Market maker tiers already initialized");
        _marketMakerTiersInitialized = true;
        _initializeMarketMakerTiers();
    }

    function initializeClearPathTiers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_clearPathTiersInitialized, "ClearPath tiers already initialized");
        _clearPathTiersInitialized = true;
        _initializeClearPathTiers();
    }

    function initializeTokenMintTiers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_tokenMintTiersInitialized, "Token mint tiers already initialized");
        _tokenMintTiersInitialized = true;
        _initializeTokenMintTiers();
    }

    function initializeFriendMarketTiers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_friendMarketTiersInitialized, "Friend market tiers already initialized");
        _friendMarketTiersInitialized = true;
        _initializeFriendMarketTiers();
    }
    
    // ========== Tier Metadata Initialization ==========
    
    function _initializeTierMetadata() internal {
        // MARKET_MAKER Role Tiers
        _initializeMarketMakerTiers();
        
        // CLEARPATH_USER Role Tiers
        _initializeClearPathTiers();
        
        // TOKENMINT Role Tiers
        _initializeTokenMintTiers();
        
        // FRIEND_MARKET Role Tiers
        _initializeFriendMarketTiers();
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
    
    function _initializeFriendMarketTiers() internal {
        bytes32 role = FRIEND_MARKET_ROLE;
        
        // Bronze Tier - Basic friend market access (15 markets/month)
        tierMetadata[role][MembershipTier.BRONZE] = TierMetadata({
            name: "Friend Market Bronze",
            description: "Basic friend market creation - 15 markets/month",
            price: 50 ether,
            limits: TierLimits({
                dailyBetLimit: 5,
                weeklyBetLimit: 20,
                monthlyMarketCreation: 15, // 15 friend markets per month
                maxPositionSize: 5 ether,
                maxConcurrentMarkets: 5,
                withdrawalLimit: 25 ether,
                canCreatePrivateMarkets: true, // Friend markets are inherently private
                canUseAdvancedFeatures: false,
                feeDiscount: 10000 // 100% discount on creation fees (gas only)
            }),
            isActive: true
        });
        
        // Silver Tier - Enhanced friend market access (30 markets/month)
        tierMetadata[role][MembershipTier.SILVER] = TierMetadata({
            name: "Friend Market Silver",
            description: "Enhanced friend market creation - 30 markets/month",
            price: 100 ether, // Upgrade cost from Bronze
            limits: TierLimits({
                dailyBetLimit: 10,
                weeklyBetLimit: 50,
                monthlyMarketCreation: 30, // 30 friend markets per month
                maxPositionSize: 15 ether,
                maxConcurrentMarkets: 10,
                withdrawalLimit: 100 ether,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 10000 // 100% discount on creation fees (gas only)
            }),
            isActive: true
        });
        
        // Gold Tier - Advanced friend market access (100 markets/month)
        tierMetadata[role][MembershipTier.GOLD] = TierMetadata({
            name: "Friend Market Gold",
            description: "Advanced friend market creation - 100 markets/month",
            price: 200 ether,
            limits: TierLimits({
                dailyBetLimit: 35,
                weeklyBetLimit: 200,
                monthlyMarketCreation: 100, // 100 friend markets per month
                maxPositionSize: 50 ether,
                maxConcurrentMarkets: 30,
                withdrawalLimit: 500 ether,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 10000 // 100% discount on creation fees (gas only)
            }),
            isActive: true
        });
        
        // Platinum Tier - Unlimited friend market access
        tierMetadata[role][MembershipTier.PLATINUM] = TierMetadata({
            name: "Friend Market Platinum",
            description: "Unlimited friend market creation",
            price: 400 ether,
            limits: TierLimits({
                dailyBetLimit: type(uint256).max,
                weeklyBetLimit: type(uint256).max,
                monthlyMarketCreation: type(uint256).max, // Unlimited friend markets
                maxPositionSize: type(uint256).max,
                maxConcurrentMarkets: type(uint256).max,
                withdrawalLimit: type(uint256).max,
                canCreatePrivateMarkets: true,
                canUseAdvancedFeatures: true,
                feeDiscount: 10000 // 100% discount on creation fees (gas only)
            }),
            isActive: true
        });
    }
    
    // ========== Tier Purchase & Upgrade Functions ==========
    
    /**
     * @notice Purchase a role at specific tier with ETH and duration
     * @param role The role to purchase
     * @param tier The membership tier
     * @param duration The membership duration
     */
    function purchaseRoleWithTierAndDuration(
        bytes32 role, 
        MembershipTier tier, 
        MembershipDuration duration
    ) external payable nonReentrant whenNotPaused {
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
        
        // Set membership duration
        _setMembershipDuration(msg.sender, role, duration);
        
        // Initialize usage stats
        _initializeUsageStats(msg.sender, role);
        
        emit TierPurchased(msg.sender, role, tier, msg.value);
        
        // Refund excess
        if (msg.value > tierMeta.price) {
            payable(msg.sender).transfer(msg.value - tierMeta.price);
        }
    }
    
    /**
     * @notice Purchase a role at specific tier with ETH (legacy method - defaults to 1 month)
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
        
        // Set membership duration (default to 1 month for legacy)
        _setMembershipDuration(msg.sender, role, MembershipDuration.ONE_MONTH);
        
        // Initialize usage stats
        _initializeUsageStats(msg.sender, role);
        
        emit TierPurchased(msg.sender, role, tier, msg.value);
        
        // Refund excess
        if (msg.value > tierMeta.price) {
            payable(msg.sender).transfer(msg.value - tierMeta.price);
        }
    }
    
    /**
     * @notice Purchase a role at specific tier with ERC20 token
     * @param role The role to purchase
     * @param tier The membership tier
     * @param paymentToken The ERC20 token to use for payment
     * @param amount The amount of tokens to pay
     */
    function purchaseRoleWithTierToken(
        bytes32 role,
        MembershipTier tier,
        address paymentToken,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(address(paymentManager) != address(0), "Payment manager not set");
        require(tier != MembershipTier.NONE, "Invalid tier");
        require(userTiers[msg.sender][role] == MembershipTier.NONE, "Already has role, use upgradeTier");

        TierMetadata storage tierMeta = tierMetadata[role][tier];
        require(tierMeta.isActive, "Tier not active");

        RoleMetadata storage roleMeta = roleMetadata[role];
        require(roleMeta.isPremium, "Role is not purchasable");
        require(roleMeta.maxMembers == 0 || roleMeta.currentMembers < roleMeta.maxMembers, "Role at max capacity");

        // CEI PATTERN: Update ALL state BEFORE external calls
        // Grant role and set tier FIRST
        _grantRole(role, msg.sender);
        userTiers[msg.sender][role] = tier;
        tierPurchases[msg.sender][role][tier] = block.timestamp;
        roleMeta.currentMembers++;

        // Initialize usage stats
        _initializeUsageStats(msg.sender, role);

        // EMIT: Event after state update but before external calls
        emit TierPurchased(msg.sender, role, tier, amount);

        // EXTERNAL CALLS: After all state is finalized
        // Transfer tokens from buyer to this contract
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);

        // Approve payment manager to transfer tokens from this contract
        IERC20(paymentToken).safeIncreaseAllowance(address(paymentManager), amount);

        // Process payment through payment manager (payment manager will transfer from this contract)
        paymentManager.processPayment(
            address(this), // payer is this contract (we already have the tokens)
            msg.sender,    // buyer is the actual user
            role,
            paymentToken,
            amount,
            uint8(tier)
        );
    }
    
    /**
     * @notice Upgrade to a higher tier with ETH (legacy method)
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
    
    /**
     * @notice Upgrade to a higher tier with ERC20 token
     * @dev Follows CEI pattern - state updates before external calls
     * @param role The role to upgrade
     * @param newTier The new tier
     * @param paymentToken The ERC20 token to use for payment
     * @param amount The amount of tokens to pay
     */
    function upgradeTierWithToken(
        bytes32 role,
        MembershipTier newTier,
        address paymentToken,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(address(paymentManager) != address(0), "Payment manager not set");

        MembershipTier currentTier = userTiers[msg.sender][role];
        require(currentTier != MembershipTier.NONE, "Must have role first");
        require(newTier > currentTier, "Can only upgrade to higher tier");

        TierMetadata storage tierMeta = tierMetadata[role][newTier];
        require(tierMeta.isActive, "Tier not active");

        // CEI PATTERN: Update ALL state BEFORE external calls
        userTiers[msg.sender][role] = newTier;
        tierPurchases[msg.sender][role][newTier] = block.timestamp;

        // EMIT: Event after state update but before external calls
        emit TierUpgraded(msg.sender, role, currentTier, newTier);

        // EXTERNAL CALLS: After all state is finalized
        // Transfer tokens from buyer to this contract
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);

        // Approve payment manager to transfer tokens from this contract
        IERC20(paymentToken).safeIncreaseAllowance(address(paymentManager), amount);

        // Process payment through payment manager (payment manager will transfer from this contract)
        paymentManager.processPayment(
            address(this), // payer is this contract (we already have the tokens)
            msg.sender,    // buyer is the actual user
            role,
            paymentToken,
            amount,
            uint8(newTier)
        );
    }
    
    // ========== Usage Tracking & Enforcement ==========
    
    /**
     * @notice Set membership duration for a user's role
     * @param user The user address
     * @param role The role
     * @param duration The membership duration type
     */
    function _setMembershipDuration(address user, bytes32 role, MembershipDuration duration) internal {
        uint256 durationInSeconds;
        
        if (duration == MembershipDuration.ONE_MONTH) {
            durationInSeconds = 30 days;
        } else if (duration == MembershipDuration.THREE_MONTHS) {
            durationInSeconds = 90 days;
        } else if (duration == MembershipDuration.SIX_MONTHS) {
            durationInSeconds = 180 days;
        } else if (duration == MembershipDuration.TWELVE_MONTHS) {
            durationInSeconds = 365 days;
        } else if (duration == MembershipDuration.ENTERPRISE) {
            // Enterprise memberships don't expire (set to far future)
            durationInSeconds = 100 * 365 days;
        }
        
        membershipDurationType[user][role] = duration;
        membershipExpiration[user][role] = block.timestamp + durationInSeconds;
        
        emit MembershipExtended(user, role, membershipExpiration[user][role], duration);
    }
    
    /**
     * @notice Check if membership is still active
     * @param user The user address
     * @param role The role
     * @return bool Whether membership is active
     */
    function isMembershipActive(address user, bytes32 role) public view returns (bool) {
        return block.timestamp < membershipExpiration[user][role];
    }
    
    /**
     * @notice Extend membership by purchasing additional duration
     * @param role The role to extend
     * @param duration The additional duration to add
     */
    function extendMembership(bytes32 role, MembershipDuration duration) external payable nonReentrant whenNotPaused {
        require(userTiers[msg.sender][role] != MembershipTier.NONE, "No existing membership");
        require(isMembershipActive(msg.sender, role), "Membership expired, must repurchase");
        
        // For simplicity, charge same as tier upgrade price
        MembershipTier tier = userTiers[msg.sender][role];
        TierMetadata storage tierMeta = tierMetadata[role][tier];
        require(msg.value >= tierMeta.price / 2, "Insufficient payment for extension"); // 50% of original price
        
        uint256 durationInSeconds;
        if (duration == MembershipDuration.ONE_MONTH) {
            durationInSeconds = 30 days;
        } else if (duration == MembershipDuration.THREE_MONTHS) {
            durationInSeconds = 90 days;
        } else if (duration == MembershipDuration.SIX_MONTHS) {
            durationInSeconds = 180 days;
        } else if (duration == MembershipDuration.TWELVE_MONTHS) {
            durationInSeconds = 365 days;
        }
        
        membershipExpiration[msg.sender][role] += durationInSeconds;
        emit MembershipExtended(msg.sender, role, membershipExpiration[msg.sender][role], duration);
        
        // Refund excess
        uint256 extensionCost = tierMeta.price / 2;
        if (msg.value > extensionCost) {
            payable(msg.sender).transfer(msg.value - extensionCost);
        }
    }
    
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
        return checkMarketCreationLimitFor(msg.sender, role);
    }
    
    /**
     * @notice Check and enforce market creation limit for a specific user
     * @param user The user to check limits for
     * @param role The role to check
     * @return allowed Whether the action is allowed
     */
    function checkMarketCreationLimitFor(address user, bytes32 role) public returns (bool allowed) {
        _resetUsageIfNeeded(user, role);
        
        MembershipTier tier = userTiers[user][role];
        require(tier != MembershipTier.NONE, "No tier found");
        
        TierLimits storage limits = tierMetadata[role][tier].limits;
        UsageStats storage stats = usageStats[user][role];
        
        if (stats.monthlyMarketsCreated >= limits.monthlyMarketCreation || 
            stats.activeMarketsCount >= limits.maxConcurrentMarkets) {
            emit UsageLimitExceeded(user, role, "market_creation");
            return false;
        }
        
        stats.monthlyMarketsCreated++;
        stats.activeMarketsCount++;
        emit UsageRecorded(user, role, "market_created");
        
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
}
