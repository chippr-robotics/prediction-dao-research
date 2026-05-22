// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./RoleManager.sol";
import "../libraries/TierTypes.sol";

error TRMAlreadyInit();
error TRMInvalidAdmin();
error TRMInvalidTier();
error TRMTierNotActive();
error TRMNotPurchasable();
error TRMAtCapacity();
error TRMInsufficientPay();
error TRMNoMembership();
error TRMAlreadyHasRole();
error TRMNeedHigherTier();
error TRMMustHaveRole();
error TRMNoTierFound();

/**
 * @title TieredRoleManager
 * @notice Tiered membership system with Bronze/Silver/Gold/Platinum levels
 */
contract TieredRoleManager is RoleManager {

    bool private _initialized;

    mapping(bytes32 => mapping(MembershipTier => TierMetadata)) public tierMetadata;
    mapping(address => mapping(bytes32 => MembershipTier)) public userTiers;
    mapping(address => mapping(bytes32 => uint256)) public tierPurchases;
    mapping(address => mapping(bytes32 => uint256)) public membershipExpiration;
    mapping(address => mapping(bytes32 => UsageStats)) public usageStats;

    // Authorized extensions that can grant roles (e.g., PaymentProcessor)
    mapping(address => bool) public authorizedExtensions;

    event TierPurchased(address indexed user, bytes32 indexed role, MembershipTier tier, uint256 price);
    event TierUpgraded(address indexed user, bytes32 indexed role, MembershipTier from, MembershipTier to);
    event MembershipExtended(address indexed user, bytes32 indexed role, uint256 exp);

    constructor() RoleManager() { _initialized = msg.sender != SAFE_SINGLETON_FACTORY; }

    function initialize(address admin) external {
        if (_initialized) revert TRMAlreadyInit();
        if (admin == address(0)) revert TRMInvalidAdmin();
        _initialized = true;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _revokeRole(DEFAULT_ADMIN_ROLE, SAFE_SINGLETON_FACTORY);
    }

    // Admin
    function setTierMetadata(bytes32 r, MembershipTier t, string calldata n, string calldata d, uint256 p, TierLimits calldata l, bool a) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierMetadata[r][t] = TierMetadata(n, d, p, l, a);
    }

    function setTierActive(bytes32 r, MembershipTier t, bool a) external onlyRole(DEFAULT_ADMIN_ROLE) { tierMetadata[r][t].isActive = a; }

    function setAuthorizedExtension(address ext, bool authorized) external onlyRole(DEFAULT_ADMIN_ROLE) {
        authorizedExtensions[ext] = authorized;
    }

    // Called by PaymentProcessor to grant roles after payment
    function grantRoleFromExtension(bytes32 role, address account) external {
        require(authorizedExtensions[msg.sender], "Not authorized extension");
        if (!hasRole(role, account)) {
            _grantRole(role, account);
            roleMetadata[role].currentMembers++;
        }
    }

    // Called by PaymentProcessor to grant role with tier after payment
    function grantTierFromExtension(
        bytes32 role,
        address account,
        uint8 tier,
        uint256 durationDays
    ) external {
        require(authorizedExtensions[msg.sender], "Not authorized extension");
        require(tier > 0 && tier <= 4, "Invalid tier");

        MembershipTier membershipTier = MembershipTier(tier);
        MembershipTier currentTier = userTiers[account][role];

        // Set tier
        userTiers[account][role] = membershipTier;
        tierPurchases[account][role] = block.timestamp;

        // For new members, initialize membership expiration and usage stats
        // For existing members (upgrades), preserve usage stats and extend from current expiration
        if (currentTier == MembershipTier.NONE) {
            membershipExpiration[account][role] = block.timestamp + durationDays * 1 days;
            usageStats[account][role] = UsageStats(0, 0, 0, 0, 0, block.timestamp, block.timestamp, block.timestamp);
        } else {
            // Upgrade: extend from current expiration if still active, otherwise from now
            uint256 start = membershipExpiration[account][role] > block.timestamp
                ? membershipExpiration[account][role]
                : block.timestamp;
            membershipExpiration[account][role] = start + durationDays * 1 days;
            // Keep existing usage stats for upgrades
        }

        // Grant role if not already granted
        if (!hasRole(role, account)) {
            _grantRole(role, account);
            roleMetadata[role].currentMembers++;
        }

        if (currentTier == MembershipTier.NONE) {
            emit TierPurchased(account, role, membershipTier, 0);
        } else {
            emit TierUpgraded(account, role, currentTier, membershipTier);
        }
    }

    // Purchase
    function purchaseRoleWithTier(bytes32 role, MembershipTier tier, uint256 durDays) external payable nonReentrant whenNotPaused {
        if (tier == MembershipTier.NONE) revert TRMInvalidTier();
        if (userTiers[msg.sender][role] != MembershipTier.NONE) revert TRMAlreadyHasRole();

        TierMetadata storage m = tierMetadata[role][tier];
        if (!m.isActive) revert TRMTierNotActive();
        if (msg.value < m.price) revert TRMInsufficientPay();

        RoleMetadata storage rm = roleMetadata[role];
        if (!rm.isPremium) revert TRMNotPurchasable();
        if (rm.maxMembers != 0 && rm.currentMembers >= rm.maxMembers) revert TRMAtCapacity();

        _grantRole(role, msg.sender);
        userTiers[msg.sender][role] = tier;
        tierPurchases[msg.sender][role] = block.timestamp;
        rm.currentMembers++;
        membershipExpiration[msg.sender][role] = block.timestamp + durDays * 1 days;
        usageStats[msg.sender][role] = UsageStats(0, 0, 0, 0, 0, block.timestamp, block.timestamp, block.timestamp);

        emit TierPurchased(msg.sender, role, tier, msg.value);
        if (msg.value > m.price) payable(msg.sender).transfer(msg.value - m.price);
    }

    function upgradeTier(bytes32 role, MembershipTier newTier) external payable nonReentrant whenNotPaused {
        MembershipTier cur = userTiers[msg.sender][role];
        if (cur == MembershipTier.NONE) revert TRMMustHaveRole();
        if (newTier <= cur) revert TRMNeedHigherTier();

        TierMetadata storage m = tierMetadata[role][newTier];
        if (!m.isActive) revert TRMTierNotActive();
        if (msg.value < m.price) revert TRMInsufficientPay();

        userTiers[msg.sender][role] = newTier;
        tierPurchases[msg.sender][role] = block.timestamp;

        emit TierUpgraded(msg.sender, role, cur, newTier);
        if (msg.value > m.price) payable(msg.sender).transfer(msg.value - m.price);
    }

    function extendMembership(bytes32 role, uint256 days_) external payable nonReentrant whenNotPaused {
        if (userTiers[msg.sender][role] == MembershipTier.NONE) revert TRMNoMembership();
        uint256 cost = tierMetadata[role][userTiers[msg.sender][role]].price / 2;
        if (msg.value < cost) revert TRMInsufficientPay();

        uint256 start = membershipExpiration[msg.sender][role] > block.timestamp ? membershipExpiration[msg.sender][role] : block.timestamp;
        membershipExpiration[msg.sender][role] = start + days_ * 1 days;
        emit MembershipExtended(msg.sender, role, membershipExpiration[msg.sender][role]);
        if (msg.value > cost) payable(msg.sender).transfer(msg.value - cost);
    }

    // Usage - checkMarketCreationLimit is the critical one for FriendGroupMarketFactory
    function _reset(address u, bytes32 r) internal {
        UsageStats storage s = usageStats[u][r];
        if (block.timestamp >= s.lastDailyReset + 1 days) { s.dailyBetsCount = 0; s.dailyWithdrawals = 0; s.lastDailyReset = block.timestamp; }
        if (block.timestamp >= s.lastWeeklyReset + 7 days) { s.weeklyBetsCount = 0; s.lastWeeklyReset = block.timestamp; }
        if (block.timestamp >= s.lastMonthlyReset + 30 days) { s.monthlyMarketsCreated = 0; s.lastMonthlyReset = block.timestamp; }
    }

    function checkMarketCreationLimit(bytes32 r) external returns (bool) { return checkMarketCreationLimitFor(msg.sender, r); }

    function checkMarketCreationLimitFor(address u, bytes32 r) public returns (bool) {
        _reset(u, r);
        MembershipTier t = userTiers[u][r];
        if (t == MembershipTier.NONE) revert TRMNoTierFound();
        TierLimits storage l = tierMetadata[r][t].limits;
        UsageStats storage s = usageStats[u][r];
        if (s.monthlyMarketsCreated >= l.monthlyMarketCreation || s.activeMarketsCount >= l.maxConcurrentMarkets) return false;
        s.monthlyMarketsCreated++; s.activeMarketsCount++;
        return true;
    }

    function recordMarketClosure(bytes32 r) external { if (usageStats[msg.sender][r].activeMarketsCount > 0) usageStats[msg.sender][r].activeMarketsCount--; }

    // Admin
    function grantTier(address u, bytes32 r, MembershipTier t, uint256 days_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        userTiers[u][r] = t;
        tierPurchases[u][r] = block.timestamp;
        membershipExpiration[u][r] = block.timestamp + days_ * 1 days;
        usageStats[u][r] = UsageStats(0, 0, 0, 0, 0, block.timestamp, block.timestamp, block.timestamp);
        if (!hasRole(r, u)) { _grantRole(r, u); roleMetadata[r].currentMembers++; }
        emit TierPurchased(u, r, t, 0);
    }

    function withdrawFunds(address payable to, uint256 amt) external onlyRole(DEFAULT_ADMIN_ROLE) { to.transfer(amt); }

    // View
    function getUserTier(address u, bytes32 r) external view returns (MembershipTier) {
        if (membershipExpiration[u][r] > 0 && block.timestamp > membershipExpiration[u][r]) return MembershipTier.NONE;
        return userTiers[u][r];
    }
    function isMembershipActive(address u, bytes32 r) external view returns (bool) { return block.timestamp < membershipExpiration[u][r]; }
}
