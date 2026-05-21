// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TierRegistry.sol";
import "./interfaces/IRoleManagerCore.sol";

/**
 * @title UsageTracker
 * @notice Tracks usage statistics and enforces limits based on tier
 * @dev Part of modular TieredRoleManager system
 */
contract UsageTracker is Ownable {
    
    address internal constant SAFE_SINGLETON_FACTORY = 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7;
    
    bool private _initialized;
    
    // ========== References ==========

    IRoleManagerCore public roleManagerCore;
    TierRegistry public tierRegistry;

    // Authorized extensions (e.g., TierRegistryAdapter)
    mapping(address => bool) public authorizedExtensions;
    
    // ========== Usage Stats ==========
    
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
    
    event UsageRecorded(address indexed user, bytes32 indexed role, string actionType, uint256 newCount);
    event UsageLimitExceeded(address indexed user, bytes32 indexed role, string limitType, uint256 current, uint256 max);
    event UsageReset(address indexed user, bytes32 indexed role, string resetType);
    event ActiveMarketsUpdated(address indexed user, bytes32 indexed role, uint256 count);
    event AuthorizedExtensionSet(address indexed extension, bool authorized);
    
    // ========== Constructor ==========
    
    constructor() Ownable(msg.sender) {
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
    }
    
    function initialize(address admin) external {
        require(!_initialized, "Already initialized");
        require(admin != address(0), "Invalid admin");
        _initialized = true;
        _transferOwnership(admin);
    }
    
    // ========== Configuration ==========
    
    function setRoleManagerCore(address _roleManagerCore) external onlyOwner {
        roleManagerCore = IRoleManagerCore(_roleManagerCore);
    }
    
    function setTierRegistry(address _tierRegistry) external onlyOwner {
        tierRegistry = TierRegistry(_tierRegistry);
    }
    
    function configureAll(
        address _roleManagerCore,
        address _tierRegistry
    ) external onlyOwner {
        if (_roleManagerCore != address(0)) roleManagerCore = IRoleManagerCore(_roleManagerCore);
        if (_tierRegistry != address(0)) tierRegistry = TierRegistry(_tierRegistry);
    }
    
    // ========== Modifiers ==========
    
    modifier onlyAuthorized() {
        require(
            msg.sender == owner() ||
            authorizedExtensions[msg.sender] ||
            roleManagerCore.hasRole(roleManagerCore.DEFAULT_ADMIN_ROLE(), msg.sender) ||
            roleManagerCore.hasRole(roleManagerCore.OPERATIONS_ADMIN_ROLE(), msg.sender),
            "Not authorized"
        );
        _;
    }

    function setAuthorizedExtension(address extension, bool authorized) external onlyOwner {
        authorizedExtensions[extension] = authorized;
        emit AuthorizedExtensionSet(extension, authorized);
    }
    
    // ========== Usage Recording ==========
    
    /**
     * @notice Record a usage action and check limits
     * @return withinLimit Whether the action is within limits
     */
    function recordUsage(
        address user,
        bytes32 role,
        string calldata actionType
    ) external onlyAuthorized returns (bool withinLimit) {
        UsageStats storage stats = usageStats[user][role];
        
        // Reset counters if needed
        _resetCountersIfNeeded(stats);
        
        // Get tier limits
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(user, role);
        if (tier == TierRegistry.MembershipTier.NONE) {
            emit UsageLimitExceeded(user, role, actionType, 0, 0);
            return false;
        }
        
        TierRegistry.TierLimits memory limits = tierRegistry.getTierLimits(role, tier);
        
        // Record based on action type
        bytes32 actionHash = keccak256(bytes(actionType));
        
        if (actionHash == keccak256("bet") || actionHash == keccak256("dailyBet")) {
            if (stats.dailyBetsCount >= limits.dailyBetLimit) {
                emit UsageLimitExceeded(user, role, "dailyBet", stats.dailyBetsCount, limits.dailyBetLimit);
                return false;
            }
            stats.dailyBetsCount++;
            stats.weeklyBetsCount++;
            emit UsageRecorded(user, role, actionType, stats.dailyBetsCount);
            
        } else if (actionHash == keccak256("weeklyBet")) {
            if (stats.weeklyBetsCount >= limits.weeklyBetLimit) {
                emit UsageLimitExceeded(user, role, "weeklyBet", stats.weeklyBetsCount, limits.weeklyBetLimit);
                return false;
            }
            stats.weeklyBetsCount++;
            emit UsageRecorded(user, role, actionType, stats.weeklyBetsCount);
            
        } else if (actionHash == keccak256("market") || actionHash == keccak256("monthlyMarket")) {
            if (stats.monthlyMarketsCreated >= limits.monthlyMarketCreation) {
                emit UsageLimitExceeded(user, role, "monthlyMarket", stats.monthlyMarketsCreated, limits.monthlyMarketCreation);
                return false;
            }
            stats.monthlyMarketsCreated++;
            emit UsageRecorded(user, role, actionType, stats.monthlyMarketsCreated);
            
        } else if (actionHash == keccak256("withdrawal")) {
            if (stats.dailyWithdrawals >= limits.withdrawalLimit) {
                emit UsageLimitExceeded(user, role, "withdrawal", stats.dailyWithdrawals, limits.withdrawalLimit);
                return false;
            }
            stats.dailyWithdrawals++;
            emit UsageRecorded(user, role, actionType, stats.dailyWithdrawals);
        }
        
        return true;
    }
    
    /**
     * @notice Update active markets count
     */
    function updateActiveMarkets(
        address user,
        bytes32 role,
        uint256 count
    ) external onlyAuthorized {
        usageStats[user][role].activeMarketsCount = count;
        emit ActiveMarketsUpdated(user, role, count);
    }
    
    /**
     * @notice Increment active markets count
     */
    function incrementActiveMarkets(address user, bytes32 role) external onlyAuthorized returns (bool withinLimit) {
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(user, role);
        if (tier == TierRegistry.MembershipTier.NONE) return false;
        
        TierRegistry.TierLimits memory limits = tierRegistry.getTierLimits(role, tier);
        UsageStats storage stats = usageStats[user][role];
        
        if (stats.activeMarketsCount >= limits.maxConcurrentMarkets) {
            emit UsageLimitExceeded(user, role, "activeMarkets", stats.activeMarketsCount, limits.maxConcurrentMarkets);
            return false;
        }
        
        stats.activeMarketsCount++;
        emit ActiveMarketsUpdated(user, role, stats.activeMarketsCount);
        return true;
    }
    
    /**
     * @notice Decrement active markets count
     */
    function decrementActiveMarkets(address user, bytes32 role) external onlyAuthorized {
        UsageStats storage stats = usageStats[user][role];
        if (stats.activeMarketsCount > 0) {
            stats.activeMarketsCount--;
            emit ActiveMarketsUpdated(user, role, stats.activeMarketsCount);
        }
    }
    
    // ========== View Functions ==========
    
    /**
     * @notice Check if an action is within limits (without recording)
     */
    function checkUsageLimit(
        address user,
        bytes32 role,
        string calldata limitType
    ) external view returns (bool withinLimit, uint256 current, uint256 max) {
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(user, role);
        if (tier == TierRegistry.MembershipTier.NONE) {
            return (false, 0, 0);
        }
        
        TierRegistry.TierLimits memory limits = tierRegistry.getTierLimits(role, tier);
        UsageStats memory stats = usageStats[user][role];
        
        // Apply time-based resets to the view
        stats = _getResetStats(stats);
        
        bytes32 limitHash = keccak256(bytes(limitType));
        
        if (limitHash == keccak256("dailyBet")) {
            return (stats.dailyBetsCount < limits.dailyBetLimit, stats.dailyBetsCount, limits.dailyBetLimit);
        } else if (limitHash == keccak256("weeklyBet")) {
            return (stats.weeklyBetsCount < limits.weeklyBetLimit, stats.weeklyBetsCount, limits.weeklyBetLimit);
        } else if (limitHash == keccak256("monthlyMarket")) {
            return (stats.monthlyMarketsCreated < limits.monthlyMarketCreation, stats.monthlyMarketsCreated, limits.monthlyMarketCreation);
        } else if (limitHash == keccak256("withdrawal")) {
            return (stats.dailyWithdrawals < limits.withdrawalLimit, stats.dailyWithdrawals, limits.withdrawalLimit);
        } else if (limitHash == keccak256("activeMarkets")) {
            return (stats.activeMarketsCount < limits.maxConcurrentMarkets, stats.activeMarketsCount, limits.maxConcurrentMarkets);
        } else if (limitHash == keccak256("positionSize")) {
            return (true, 0, limits.maxPositionSize);
        }
        
        return (true, 0, type(uint256).max);
    }
    
    /**
     * @notice Get full usage stats for a user/role
     */
    function getUsageStats(
        address user,
        bytes32 role
    ) external view returns (UsageStats memory) {
        return _getResetStats(usageStats[user][role]);
    }
    
    /**
     * @notice Check if user can create private markets
     */
    function canCreatePrivateMarkets(address user, bytes32 role) external view returns (bool) {
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(user, role);
        if (tier == TierRegistry.MembershipTier.NONE) return false;
        return tierRegistry.getTierLimits(role, tier).canCreatePrivateMarkets;
    }
    
    /**
     * @notice Check if user can use advanced features
     */
    function canUseAdvancedFeatures(address user, bytes32 role) external view returns (bool) {
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(user, role);
        if (tier == TierRegistry.MembershipTier.NONE) return false;
        return tierRegistry.getTierLimits(role, tier).canUseAdvancedFeatures;
    }
    
    /**
     * @notice Get fee discount for user
     */
    function getFeeDiscount(address user, bytes32 role) external view returns (uint256) {
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(user, role);
        if (tier == TierRegistry.MembershipTier.NONE) return 0;
        return tierRegistry.getTierLimits(role, tier).feeDiscount;
    }
    
    // ========== Internal Functions ==========
    
    function _resetCountersIfNeeded(UsageStats storage stats) internal {
        if (block.timestamp > stats.lastDailyReset + 1 days) {
            stats.dailyBetsCount = 0;
            stats.dailyWithdrawals = 0;
            stats.lastDailyReset = block.timestamp;
            emit UsageReset(address(0), bytes32(0), "daily");
        }
        if (block.timestamp > stats.lastWeeklyReset + 7 days) {
            stats.weeklyBetsCount = 0;
            stats.lastWeeklyReset = block.timestamp;
            emit UsageReset(address(0), bytes32(0), "weekly");
        }
        if (block.timestamp > stats.lastMonthlyReset + 30 days) {
            stats.monthlyMarketsCreated = 0;
            stats.lastMonthlyReset = block.timestamp;
            emit UsageReset(address(0), bytes32(0), "monthly");
        }
    }
    
    function _getResetStats(UsageStats memory stats) internal view returns (UsageStats memory) {
        if (block.timestamp > stats.lastDailyReset + 1 days) {
            stats.dailyBetsCount = 0;
            stats.dailyWithdrawals = 0;
        }
        if (block.timestamp > stats.lastWeeklyReset + 7 days) {
            stats.weeklyBetsCount = 0;
        }
        if (block.timestamp > stats.lastMonthlyReset + 30 days) {
            stats.monthlyMarketsCreated = 0;
        }
        return stats;
    }
    
    /**
     * @notice Admin reset usage stats for a user
     */
    function resetUsageStats(address user, bytes32 role) external onlyOwner {
        delete usageStats[user][role];
        emit UsageReset(user, role, "full");
    }

    // ========== FriendGroupMarketFactory Compatibility ==========

    /**
     * @notice Check market creation limit and increment counters if within limits
     * @dev Matches TieredRoleManager.checkMarketCreationLimitFor() behavior exactly:
     *      - Resets counters if time periods have passed
     *      - Checks both monthly creation limit AND concurrent markets limit
     *      - Only increments counters if BOTH checks pass
     * @param user Address to check
     * @param role Role to check limits for
     * @return withinLimit True if user can create a market, false otherwise
     */
    function checkMarketCreationLimitFor(
        address user,
        bytes32 role
    ) external onlyAuthorized returns (bool withinLimit) {
        UsageStats storage stats = usageStats[user][role];

        // Reset counters if needed (matches TieredRoleManager._reset)
        _resetCountersIfNeeded(stats);

        // Get user's tier
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(user, role);
        if (tier == TierRegistry.MembershipTier.NONE) {
            return false;
        }

        // Get tier limits
        TierRegistry.TierLimits memory limits = tierRegistry.getTierLimits(role, tier);

        // Check BOTH limits before incrementing (atomic check)
        if (stats.monthlyMarketsCreated >= limits.monthlyMarketCreation) {
            emit UsageLimitExceeded(user, role, "monthlyMarket", stats.monthlyMarketsCreated, limits.monthlyMarketCreation);
            return false;
        }
        if (stats.activeMarketsCount >= limits.maxConcurrentMarkets) {
            emit UsageLimitExceeded(user, role, "activeMarkets", stats.activeMarketsCount, limits.maxConcurrentMarkets);
            return false;
        }

        // Both checks passed - increment both counters
        stats.monthlyMarketsCreated++;
        stats.activeMarketsCount++;

        emit UsageRecorded(user, role, "marketCreation", stats.monthlyMarketsCreated);
        emit ActiveMarketsUpdated(user, role, stats.activeMarketsCount);

        return true;
    }

    /**
     * @notice Record market closure (decrement active markets count)
     * @dev Matches TieredRoleManager.recordMarketClosure() behavior
     * @param user Address that closed the market
     * @param role Role the market was created under
     */
    function recordMarketClosure(address user, bytes32 role) external onlyAuthorized {
        UsageStats storage stats = usageStats[user][role];
        if (stats.activeMarketsCount > 0) {
            stats.activeMarketsCount--;
            emit ActiveMarketsUpdated(user, role, stats.activeMarketsCount);
        }
    }
}
