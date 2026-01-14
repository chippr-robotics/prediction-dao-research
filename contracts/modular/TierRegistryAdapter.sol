// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TierRegistry.sol";
import "./interfaces/IRoleManagerCore.sol";

// Minimal interfaces to avoid import conflicts
interface IMembershipManagerAdapter {
    function isMembershipActive(address user, bytes32 role) external view returns (bool);
    function membershipExpiration(address user, bytes32 role) external view returns (uint256);
}

interface IUsageTrackerAdapter {
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

    function checkMarketCreationLimitFor(address user, bytes32 role) external returns (bool);
    function recordMarketClosure(address user, bytes32 role) external;
    function getUsageStats(address user, bytes32 role) external view returns (UsageStats memory);
}

/**
 * @title TierRegistryAdapter
 * @notice Adapter that bridges the modular RBAC system to TieredRoleManager interface
 * @dev This contract implements the same interface that FriendGroupMarketFactory expects
 *      from TieredRoleManager, but delegates to the modular system components:
 *      - RoleManagerCore for role checks (hasRole)
 *      - MembershipManager for expiration checks (isMembershipActive)
 *      - UsageTracker for usage limits (checkMarketCreationLimitFor)
 *      - TierRegistry for tier data
 *
 *      This allows purchases through PaymentProcessor to work seamlessly with
 *      FriendGroupMarketFactory without requiring manual syncing between systems.
 *
 * Usage:
 *   1. Deploy this adapter
 *   2. Authorize this adapter on UsageTracker: usageTracker.setAuthorizedExtension(adapter, true)
 *   3. Update FriendGroupMarketFactory to point to this adapter
 *   4. Purchases through PaymentProcessor now work with FriendGroupMarketFactory
 */
contract TierRegistryAdapter is Ownable {

    address internal constant SAFE_SINGLETON_FACTORY = 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7;

    bool private _initialized;

    // ========== Modular System References ==========

    IRoleManagerCore public roleManagerCore;
    TierRegistry public tierRegistry;
    IMembershipManagerAdapter public membershipManager;
    IUsageTrackerAdapter public usageTracker;

    // ========== Events ==========

    event ConfigUpdated(
        address roleManagerCore,
        address tierRegistry,
        address membershipManager,
        address usageTracker
    );

    // ========== Constructor ==========

    constructor() Ownable(msg.sender) {
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
    }

    /**
     * @notice Initialize the adapter (for CREATE2 deployments)
     * @param admin Address to receive ownership
     */
    function initialize(address admin) external {
        require(!_initialized, "Already initialized");
        require(admin != address(0), "Invalid admin");
        _initialized = true;
        _transferOwnership(admin);
    }

    /**
     * @notice Configure all modular system references
     * @param _roleManagerCore Address of RoleManagerCore
     * @param _tierRegistry Address of TierRegistry
     * @param _membershipManager Address of MembershipManager
     * @param _usageTracker Address of UsageTracker
     */
    function configure(
        address _roleManagerCore,
        address _tierRegistry,
        address _membershipManager,
        address _usageTracker
    ) external onlyOwner {
        if (_roleManagerCore != address(0)) roleManagerCore = IRoleManagerCore(_roleManagerCore);
        if (_tierRegistry != address(0)) tierRegistry = TierRegistry(_tierRegistry);
        if (_membershipManager != address(0)) membershipManager = IMembershipManagerAdapter(_membershipManager);
        if (_usageTracker != address(0)) usageTracker = IUsageTrackerAdapter(_usageTracker);

        emit ConfigUpdated(
            address(roleManagerCore),
            address(tierRegistry),
            address(membershipManager),
            address(usageTracker)
        );
    }

    // ========== TieredRoleManager Interface Implementation ==========

    /**
     * @notice Get the FRIEND_MARKET_ROLE constant
     * @dev Delegates to RoleManagerCore
     * @return The bytes32 role identifier
     */
    function FRIEND_MARKET_ROLE() external view returns (bytes32) {
        return roleManagerCore.FRIEND_MARKET_ROLE();
    }

    /**
     * @notice Check if an account has a specific role
     * @dev Delegates to RoleManagerCore
     * @param role The role to check
     * @param account The account to check
     * @return True if account has the role
     */
    function hasRole(bytes32 role, address account) external view returns (bool) {
        return roleManagerCore.hasRole(role, account);
    }

    /**
     * @notice Check if a user's membership is active (not expired)
     * @dev Delegates to MembershipManager
     * @param user The user address
     * @param role The role to check
     * @return True if membership is active
     */
    function isMembershipActive(address user, bytes32 role) external view returns (bool) {
        return membershipManager.isMembershipActive(user, role);
    }

    /**
     * @notice Check market creation limit and increment counters if within limits
     * @dev Delegates to UsageTracker.checkMarketCreationLimitFor()
     *      This function is stateful - it increments counters on success
     * @param user The user address
     * @param role The role to check
     * @return True if user can create a market
     */
    function checkMarketCreationLimitFor(address user, bytes32 role) external returns (bool) {
        return usageTracker.checkMarketCreationLimitFor(user, role);
    }

    /**
     * @notice Check market creation limit for msg.sender
     * @dev Convenience function matching TieredRoleManager
     * @param role The role to check
     * @return True if caller can create a market
     */
    function checkMarketCreationLimit(bytes32 role) external returns (bool) {
        return usageTracker.checkMarketCreationLimitFor(msg.sender, role);
    }

    /**
     * @notice Record market closure (decrement active markets count)
     * @dev Delegates to UsageTracker.recordMarketClosure()
     * @param role The role the market was created under
     */
    function recordMarketClosure(bytes32 role) external {
        usageTracker.recordMarketClosure(msg.sender, role);
    }

    // ========== Additional View Functions ==========

    /**
     * @notice Get user's current tier
     * @dev Delegates to TierRegistry
     * @param user The user address
     * @param role The role to check
     * @return The user's membership tier
     */
    function getUserTier(address user, bytes32 role) external view returns (TierRegistry.MembershipTier) {
        return tierRegistry.getUserTier(user, role);
    }

    /**
     * @notice Get membership expiration timestamp
     * @dev Delegates to MembershipManager
     * @param user The user address
     * @param role The role to check
     * @return Expiration timestamp (0 if no membership)
     */
    function membershipExpiration(address user, bytes32 role) external view returns (uint256) {
        return membershipManager.membershipExpiration(user, role);
    }

    /**
     * @notice Get tier limits for a specific role and tier
     * @dev Delegates to TierRegistry
     * @param role The role
     * @param tier The tier level
     * @return The tier limits struct
     */
    function getTierLimits(
        bytes32 role,
        TierRegistry.MembershipTier tier
    ) external view returns (TierRegistry.TierLimits memory) {
        return tierRegistry.getTierLimits(role, tier);
    }

    /**
     * @notice Get usage stats for a user
     * @dev Delegates to UsageTracker
     * @param user The user address
     * @param role The role to check
     * @return The usage stats struct
     */
    function getUsageStats(
        address user,
        bytes32 role
    ) external view returns (IUsageTrackerAdapter.UsageStats memory) {
        return usageTracker.getUsageStats(user, role);
    }
}
