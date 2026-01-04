// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MinimalRoleManager
 * @notice Ultra-lightweight RBAC for gas-constrained deterministic deployments
 * @dev Stripped down to essentials - no metadata strings, no payment integration, no timelocks.
 *      Use this on chains with low block gas limits (e.g., Mordor ETC testnet ~8M).
 *      For full functionality, deploy TieredRoleManager on chains with higher limits.
 */
contract MinimalRoleManager is AccessControl, ReentrancyGuard, Pausable {
    
    address internal constant SAFE_SINGLETON_FACTORY = 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7;
    
    bool private _initialized;
    
    // ========== Role Definitions ==========
    
    bytes32 public constant CORE_SYSTEM_ADMIN_ROLE = keccak256("CORE_SYSTEM_ADMIN_ROLE");
    bytes32 public constant OPERATIONS_ADMIN_ROLE = keccak256("OPERATIONS_ADMIN_ROLE");
    bytes32 public constant EMERGENCY_GUARDIAN_ROLE = keccak256("EMERGENCY_GUARDIAN_ROLE");
    bytes32 public constant MARKET_MAKER_ROLE = keccak256("MARKET_MAKER_ROLE");
    bytes32 public constant CLEARPATH_USER_ROLE = keccak256("CLEARPATH_USER_ROLE");
    bytes32 public constant TOKENMINT_ROLE = keccak256("TOKENMINT_ROLE");
    bytes32 public constant FRIEND_MARKET_ROLE = keccak256("FRIEND_MARKET_ROLE");
    bytes32 public constant OVERSIGHT_COMMITTEE_ROLE = keccak256("OVERSIGHT_COMMITTEE_ROLE");
    
    // ========== Tier Definitions ==========
    
    enum MembershipTier { NONE, BRONZE, SILVER, GOLD, PLATINUM }
    
    // user => role => tier
    mapping(address => mapping(bytes32 => MembershipTier)) public userTiers;
    
    // user => role => expiration timestamp
    mapping(address => mapping(bytes32 => uint256)) public membershipExpiration;
    
    // role => tier => price (in wei)
    mapping(bytes32 => mapping(MembershipTier => uint256)) public tierPrices;
    
    // role => tier => active
    mapping(bytes32 => mapping(MembershipTier => bool)) public tierActive;
    
    // ========== Events ==========
    
    event TierGranted(address indexed user, bytes32 indexed role, MembershipTier tier, uint256 expiration);
    event TierPurchased(address indexed user, bytes32 indexed role, MembershipTier tier, uint256 price);
    event TierConfigured(bytes32 indexed role, MembershipTier tier, uint256 price, bool active);
    event EmergencyPaused(address indexed guardian);
    event EmergencyUnpaused(address indexed admin);
    
    // ========== Constructor ==========
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        
        // Set up role hierarchy
        _setRoleAdmin(CORE_SYSTEM_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(OPERATIONS_ADMIN_ROLE, CORE_SYSTEM_ADMIN_ROLE);
        _setRoleAdmin(EMERGENCY_GUARDIAN_ROLE, OPERATIONS_ADMIN_ROLE);
        _setRoleAdmin(MARKET_MAKER_ROLE, OPERATIONS_ADMIN_ROLE);
        _setRoleAdmin(CLEARPATH_USER_ROLE, OPERATIONS_ADMIN_ROLE);
        _setRoleAdmin(TOKENMINT_ROLE, OPERATIONS_ADMIN_ROLE);
        _setRoleAdmin(FRIEND_MARKET_ROLE, OPERATIONS_ADMIN_ROLE);
        _setRoleAdmin(OVERSIGHT_COMMITTEE_ROLE, DEFAULT_ADMIN_ROLE);
        
        // For CREATE2 deployments, allow one-time initialize
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
    }
    
    /**
     * @notice Initialize admin after deterministic deployment
     */
    function initialize(address admin) external {
        require(!_initialized, "Already initialized");
        require(admin != address(0), "Invalid admin");
        _initialized = true;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _revokeRole(DEFAULT_ADMIN_ROLE, SAFE_SINGLETON_FACTORY);
    }
    
    // ========== Tier Configuration (Admin) ==========
    
    function configureTier(
        bytes32 role,
        MembershipTier tier,
        uint256 price,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tierPrices[role][tier] = price;
        tierActive[role][tier] = active;
        emit TierConfigured(role, tier, price, active);
    }
    
    function batchConfigureTiers(
        bytes32[] calldata roles,
        MembershipTier[] calldata tiers,
        uint256[] calldata prices,
        bool[] calldata actives
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 len = roles.length;
        require(tiers.length == len && prices.length == len && actives.length == len, "Length mismatch");
        for (uint256 i = 0; i < len; i++) {
            tierPrices[roles[i]][tiers[i]] = prices[i];
            tierActive[roles[i]][tiers[i]] = actives[i];
            emit TierConfigured(roles[i], tiers[i], prices[i], actives[i]);
        }
    }
    
    // ========== Tier Management ==========
    
    function grantTier(
        address user,
        bytes32 role,
        MembershipTier tier,
        uint256 durationDays
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        userTiers[user][role] = tier;
        membershipExpiration[user][role] = block.timestamp + (durationDays * 1 days);
        _grantRole(role, user);
        emit TierGranted(user, role, tier, membershipExpiration[user][role]);
    }
    
    function purchaseTier(bytes32 role, MembershipTier tier) external payable whenNotPaused nonReentrant {
        require(tierActive[role][tier], "Tier not active");
        require(msg.value >= tierPrices[role][tier], "Insufficient payment");
        require(uint8(tier) > uint8(userTiers[msg.sender][role]), "Must upgrade");
        
        userTiers[msg.sender][role] = tier;
        if (membershipExpiration[msg.sender][role] == 0) {
            membershipExpiration[msg.sender][role] = block.timestamp + 30 days;
        }
        _grantRole(role, msg.sender);
        
        emit TierPurchased(msg.sender, role, tier, msg.value);
        
        uint256 excess = msg.value - tierPrices[role][tier];
        if (excess > 0) {
            payable(msg.sender).transfer(excess);
        }
    }
    
    // ========== View Functions ==========
    
    function getUserTier(address user, bytes32 role) external view returns (MembershipTier) {
        if (membershipExpiration[user][role] > 0 && block.timestamp > membershipExpiration[user][role]) {
            return MembershipTier.NONE;
        }
        return userTiers[user][role];
    }
    
    function isActiveMember(address user, bytes32 role) external view returns (bool) {
        if (userTiers[user][role] == MembershipTier.NONE) return false;
        if (membershipExpiration[user][role] == 0) return true; // No expiration set
        return block.timestamp <= membershipExpiration[user][role];
    }
    
    // ========== Emergency Functions ==========
    
    function emergencyPause() external {
        require(
            hasRole(EMERGENCY_GUARDIAN_ROLE, msg.sender) ||
            hasRole(OPERATIONS_ADMIN_ROLE, msg.sender) ||
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not authorized"
        );
        _pause();
        emit EmergencyPaused(msg.sender);
    }
    
    function emergencyUnpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
        emit EmergencyUnpaused(msg.sender);
    }
    
    // ========== Withdraw ==========
    
    function withdraw(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Invalid address");
        require(amount <= address(this).balance, "Insufficient balance");
        to.transfer(amount);
    }
    
    receive() external payable {}
}
