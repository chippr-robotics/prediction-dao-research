// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import "../interfaces/IMembershipManager.sol";
import "../interfaces/ISanctionsGuard.sol";

/// @title MembershipManager
/// @notice Tiered, time-bound memberships per role. USDC-denominated. The only
///         paid role is `WAGER_PARTICIPANT_ROLE`; the surface is bytes32-keyed
///         so future paid roles can be added without a redeploy.
/// @dev    Role separation:
///           DEFAULT_ADMIN_ROLE     — treasury, tier config, role administration
///           ROLE_MANAGER_ROLE      — grant / revoke memberships out-of-band
///           authorizedCallers map  — kept for the WagerRegistry hook surface
contract MembershipManager is IMembershipManager, UUPSManaged {
    using SafeERC20 for IERC20;

    uint64 private constant ROLLING_WINDOW = 30 days;

    bytes32 public constant ROLE_MANAGER_ROLE = keccak256("ROLE_MANAGER_ROLE");

    mapping(bytes32 => mapping(Tier => TierConfig)) private _tiers;
    mapping(address => mapping(bytes32 => Membership)) private _memberships;
    mapping(address => bool) public authorizedCallers;

    IERC20 public paymentToken;
    address public treasury;
    uint128 public accruedFees;

    /// @notice Non-bypassable on-chain sanctions guard (Spec 007, FR-054). When unset
    ///         (address(0)) screening is skipped — the production deploy wires it in.
    ISanctionsGuard public sanctionsGuard;

    /// @notice Accepted T&C version hash recorded at membership purchase/upgrade
    ///         (Spec 007, FR-039): user => role => SHA-256 of the in-force Terms.
    mapping(address => mapping(bytes32 => bytes32)) public memberTermsHash;

    /// @dev Trailing reserve so future upgrades (spec 026's voucher redemption) can append state
    ///      append-only without shifting layout (spec 027 — UUPS migration). Validated by
    ///      `npm run check:storage-layout`. Never insert/reorder/remove the state above.
    uint256[50] private __gap;

    event TierSet(bytes32 indexed role, Tier indexed tier, uint128 priceUSDC, uint32 durationDays, bool active);
    event TreasuryUpdated(address indexed treasury);
    event PaymentTokenUpdated(address indexed token);
    event AuthorizedCallerSet(address indexed caller, bool allowed);
    event SanctionsGuardUpdated(address indexed guard);
    event MembershipTermsRecorded(address indexed user, bytes32 indexed role, bytes32 termsHash, uint64 at);
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

    /// @notice One-time initializer that replaces the constructor for the UUPS proxy (spec 027).
    /// @dev    Same args/effects as the former constructor. `__UUPSManaged_init` is called FIRST and grants
    ///         DEFAULT_ADMIN_ROLE + UPGRADER_ROLE to `admin`; ROLE_MANAGER_ROLE is re-granted here to preserve
    ///         the prior behavior. The bare implementation's initializers are disabled by UUPSManaged's
    ///         constructor, so only the proxy can be initialized — and only once.
    function initialize(address admin, address paymentToken_, address treasury_) external initializer {
        if (admin == address(0) || paymentToken_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        paymentToken = IERC20(paymentToken_);
        treasury = treasury_;
        _grantRole(ROLE_MANAGER_ROLE, admin);
    }

    // ---------- Admin ----------

    function setTier(
        bytes32 role,
        Tier tier,
        uint128 priceUSDC,
        uint32 durationDays,
        Limits calldata limits,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (tier == Tier.None) revert TierNone();
        _tiers[role][tier] = TierConfig(priceUSDC, durationDays, active, limits);
        emit TierSet(role, tier, priceUSDC, durationDays, active);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setPaymentToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        paymentToken = IERC20(token);
        emit PaymentTokenUpdated(token);
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerSet(caller, allowed);
    }

    /// @notice Set the on-chain sanctions guard. Pass address(0) to disable screening.
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sanctionsGuard = ISanctionsGuard(guard);
        emit SanctionsGuardUpdated(guard);
    }

    /// @dev Sanctions screen (Spec 007, FR-054). No-op when unset; otherwise reverts for a
    ///      listed/sanctioned address. Read-only Check, before any fee transfer/effects.
    function _screen(address account) internal view {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) guard.checkBlocked(account);
    }

    /// @dev Record the accepted T&C version hash for msg.sender (Spec 007, FR-039).
    function _recordTerms(bytes32 role, bytes32 acceptedTermsHash) internal {
        if (acceptedTermsHash != bytes32(0)) {
            memberTermsHash[msg.sender][role] = acceptedTermsHash;
            emit MembershipTermsRecorded(msg.sender, role, acceptedTermsHash, uint64(block.timestamp));
        }
    }

    function grantMembership(address user, bytes32 role, Tier tier, uint32 durationDays) external onlyRole(ROLE_MANAGER_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (tier == Tier.None) revert TierNone();
        // Spec 007 (FR-054): the sanctions guard is non-bypassable — an admin grant must not
        // hand a sanctioned/deny-listed address standing either. Screen the grantee.
        _screen(user);
        Membership storage m = _memberships[user][role];
        m.tier = tier;
        m.expiresAt = uint64(block.timestamp) + uint64(durationDays) * 1 days;
        m.monthCount = 0;
        m.monthAnchor = uint64(block.timestamp);
        emit MembershipGranted(user, role, tier, m.expiresAt);
    }

    function revokeMembership(address user, bytes32 role) external onlyRole(ROLE_MANAGER_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        Membership storage m = _memberships[user][role];
        m.tier = Tier.None;
        m.expiresAt = 0;
        // monthCount / activeCount left intact: WagerRegistry still needs to call recordClose
        // on any in-flight wagers, and resetting activeCount here would break that bookkeeping.
        emit MembershipRevoked(user, role, msg.sender);
    }

    function withdrawFees(uint128 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount > accruedFees) revert InsufficientFees();
        accruedFees -= amount;
        paymentToken.safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    // ---------- User ----------

    function purchaseTier(bytes32 role, Tier tier) external {
        _purchaseTier(role, tier);
    }

    /// @notice Like {purchaseTier} but records the accepted T&C version hash on-chain
    ///         (Spec 007, FR-039). Existing purchaseTier ABI is preserved.
    function purchaseTierWithTerms(bytes32 role, Tier tier, bytes32 acceptedTermsHash) external {
        _purchaseTier(role, tier);
        _recordTerms(role, acceptedTermsHash);
    }

    function _purchaseTier(bytes32 role, Tier tier) internal {
        _screen(msg.sender); // Sanctions screen (Spec 007, FR-054) — before any fee transfer
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
        _upgradeTier(role, newTier);
    }

    /// @notice Like {upgradeTier} but records the accepted T&C version hash on-chain
    ///         (Spec 007, FR-039). Existing upgradeTier ABI is preserved.
    function upgradeTierWithTerms(bytes32 role, Tier newTier, bytes32 acceptedTermsHash) external {
        _upgradeTier(role, newTier);
        _recordTerms(role, acceptedTermsHash);
    }

    function _upgradeTier(bytes32 role, Tier newTier) internal {
        _screen(msg.sender); // Sanctions screen (Spec 007, FR-054) — before any fee transfer
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
        _screen(msg.sender); // Sanctions screen (Spec 007, FR-054) — paid path, same risk class
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
