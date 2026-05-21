// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IMembershipManager.sol";

/// @title MembershipManager
/// @notice Tiered, time-bound memberships per role. USDC-denominated. Folds the
///         old TieredRoleManager + TierRegistry + UsageTracker + MembershipPaymentManager
///         into a single contract.
contract MembershipManager is IMembershipManager, Ownable {
    using SafeERC20 for IERC20;

    uint64 private constant ROLLING_WINDOW = 30 days;

    mapping(bytes32 => mapping(Tier => TierConfig)) private _tiers;
    mapping(address => mapping(bytes32 => Membership)) private _memberships;
    mapping(address => bool) public authorizedCallers;

    IERC20 public paymentToken;
    address public treasury;
    uint128 public accruedFees;

    event TierSet(bytes32 indexed role, Tier indexed tier, uint128 priceUSDC, uint32 durationDays, bool active);
    event TreasuryUpdated(address indexed treasury);
    event PaymentTokenUpdated(address indexed token);
    event AuthorizedCallerSet(address indexed caller, bool allowed);
    event MembershipPurchased(address indexed user, bytes32 indexed role, Tier tier, uint128 price, uint64 expiresAt);
    event MembershipUpgraded(address indexed user, bytes32 indexed role, Tier fromTier, Tier toTier, uint128 delta);
    event MembershipExtended(address indexed user, bytes32 indexed role, uint32 durationDays, uint128 price, uint64 expiresAt);
    event MembershipGranted(address indexed user, bytes32 indexed role, Tier tier, uint64 expiresAt);
    event FeesWithdrawn(address indexed to, uint128 amount);
    event WagerCreated(address indexed user, bytes32 indexed role);
    event WagerClosed(address indexed user, bytes32 indexed role);

    error TierInactive();
    error NotAuthorized();
    error NoActiveMembership();
    error AlreadyActive();
    error MonthlyLimitReached();
    error ConcurrentLimitReached();
    error NotUpgrade();
    error PriceZero();
    error ZeroAddress();
    error InsufficientFees();
    error TierNone();

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(address admin, address paymentToken_, address treasury_) Ownable(admin) {
        if (admin == address(0) || paymentToken_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        paymentToken = IERC20(paymentToken_);
        treasury = treasury_;
    }

    // ---------- Admin ----------

    function setTier(
        bytes32 role,
        Tier tier,
        uint128 priceUSDC,
        uint32 durationDays,
        Limits calldata limits,
        bool active
    ) external onlyOwner {
        if (tier == Tier.None) revert TierNone();
        _tiers[role][tier] = TierConfig(priceUSDC, durationDays, active, limits);
        emit TierSet(role, tier, priceUSDC, durationDays, active);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setPaymentToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        paymentToken = IERC20(token);
        emit PaymentTokenUpdated(token);
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerSet(caller, allowed);
    }

    function grantTierAdmin(address user, bytes32 role, Tier tier, uint32 durationDays) external onlyOwner {
        if (user == address(0)) revert ZeroAddress();
        if (tier == Tier.None) revert TierNone();
        Membership storage m = _memberships[user][role];
        m.tier = tier;
        m.expiresAt = uint64(block.timestamp) + uint64(durationDays) * 1 days;
        m.monthCount = 0;
        m.monthAnchor = uint64(block.timestamp);
        emit MembershipGranted(user, role, tier, m.expiresAt);
    }

    function withdrawFees(uint128 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount > accruedFees) revert InsufficientFees();
        accruedFees -= amount;
        paymentToken.safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    // ---------- User ----------

    function purchaseTier(bytes32 role, Tier tier) external {
        if (tier == Tier.None) revert TierNone();
        TierConfig memory cfg = _tiers[role][tier];
        if (!cfg.active) revert TierInactive();
        if (cfg.priceUSDC == 0) revert PriceZero();

        Membership storage m = _memberships[msg.sender][role];
        if (m.tier != Tier.None && m.expiresAt > block.timestamp) revert AlreadyActive();

        paymentToken.safeTransferFrom(msg.sender, address(this), cfg.priceUSDC);
        accruedFees += cfg.priceUSDC;

        m.tier = tier;
        m.expiresAt = uint64(block.timestamp) + uint64(cfg.durationDays) * 1 days;
        m.monthCount = 0;
        m.monthAnchor = uint64(block.timestamp);
        // activeCount preserved: in-flight wagers from a prior tier still count

        emit MembershipPurchased(msg.sender, role, tier, cfg.priceUSDC, m.expiresAt);
    }

    function upgradeTier(bytes32 role, Tier newTier) external {
        Membership storage m = _memberships[msg.sender][role];
        if (m.tier == Tier.None || m.expiresAt <= block.timestamp) revert NoActiveMembership();
        TierConfig memory current = _tiers[role][m.tier];
        TierConfig memory upgraded = _tiers[role][newTier];
        if (!upgraded.active) revert TierInactive();
        if (upgraded.priceUSDC <= current.priceUSDC) revert NotUpgrade();

        uint128 delta = upgraded.priceUSDC - current.priceUSDC;
        paymentToken.safeTransferFrom(msg.sender, address(this), delta);
        accruedFees += delta;

        Tier fromTier = m.tier;
        m.tier = newTier;
        emit MembershipUpgraded(msg.sender, role, fromTier, newTier, delta);
    }

    function extendMembership(bytes32 role) external {
        Membership storage m = _memberships[msg.sender][role];
        if (m.tier == Tier.None) revert NoActiveMembership();
        TierConfig memory cfg = _tiers[role][m.tier];
        if (!cfg.active) revert TierInactive();
        if (cfg.priceUSDC == 0) revert PriceZero();

        paymentToken.safeTransferFrom(msg.sender, address(this), cfg.priceUSDC);
        accruedFees += cfg.priceUSDC;

        uint64 nowTs = uint64(block.timestamp);
        uint64 base = m.expiresAt > nowTs ? m.expiresAt : nowTs;
        m.expiresAt = base + uint64(cfg.durationDays) * 1 days;

        emit MembershipExtended(msg.sender, role, cfg.durationDays, cfg.priceUSDC, m.expiresAt);
    }

    // ---------- Hooks (authorized callers) ----------

    function checkCanCreate(address user, bytes32 role) external view returns (bool) {
        Membership memory m = _memberships[user][role];
        if (m.tier == Tier.None || m.expiresAt <= block.timestamp) return false;
        TierConfig memory cfg = _tiers[role][m.tier];

        uint32 monthCount = (block.timestamp >= uint256(m.monthAnchor) + ROLLING_WINDOW) ? 0 : m.monthCount;
        if (cfg.limits.monthlyMarketCreation > 0 && monthCount >= cfg.limits.monthlyMarketCreation) return false;
        if (cfg.limits.maxConcurrentMarkets > 0 && m.activeCount >= cfg.limits.maxConcurrentMarkets) return false;
        return true;
    }

    function recordCreate(address user, bytes32 role) external onlyAuthorized {
        Membership storage m = _memberships[user][role];
        if (m.tier == Tier.None || m.expiresAt <= block.timestamp) revert NoActiveMembership();
        TierConfig memory cfg = _tiers[role][m.tier];

        if (block.timestamp >= uint256(m.monthAnchor) + ROLLING_WINDOW) {
            m.monthAnchor = uint64(block.timestamp);
            m.monthCount = 0;
        }
        if (cfg.limits.monthlyMarketCreation > 0 && m.monthCount >= cfg.limits.monthlyMarketCreation) revert MonthlyLimitReached();
        if (cfg.limits.maxConcurrentMarkets > 0 && m.activeCount >= cfg.limits.maxConcurrentMarkets) revert ConcurrentLimitReached();

        m.monthCount += 1;
        m.activeCount += 1;
        emit WagerCreated(user, role);
    }

    function recordClose(address user, bytes32 role) external onlyAuthorized {
        Membership storage m = _memberships[user][role];
        if (m.activeCount > 0) {
            m.activeCount -= 1;
        }
        emit WagerClosed(user, role);
    }

    // ---------- Views ----------

    function hasActiveRole(address user, bytes32 role) external view returns (bool) {
        Membership memory m = _memberships[user][role];
        return m.tier != Tier.None && m.expiresAt > block.timestamp;
    }

    function getActiveTier(address user, bytes32 role) external view returns (Tier) {
        Membership memory m = _memberships[user][role];
        if (m.expiresAt <= block.timestamp) return Tier.None;
        return m.tier;
    }

    function getMembership(address user, bytes32 role) external view returns (Membership memory) {
        return _memberships[user][role];
    }

    function getTierConfig(bytes32 role, Tier tier) external view returns (TierConfig memory) {
        return _tiers[role][tier];
    }
}
