// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title RoleManagerCore
 * @notice Core RBAC functionality - role definitions, hierarchy, and basic access control
 * @dev Part of modular TieredRoleManager system for gas-constrained deployments
 */
contract RoleManagerCore is AccessControl, ReentrancyGuard, Pausable {
    
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
    
    // ========== Extension Contracts ==========
    
    address public tierRegistry;
    address public paymentProcessor;
    address public usageTracker;
    address public membershipManager;
    
    // ========== Events ==========
    
    event ExtensionUpdated(string indexed extensionType, address indexed oldAddress, address indexed newAddress);
    event EmergencyPaused(address indexed guardian);
    event EmergencyUnpaused(address indexed admin);
    event RoleGrantedByAdmin(bytes32 indexed role, address indexed account, address indexed admin);
    event RoleRevokedByAdmin(bytes32 indexed role, address indexed account, address indexed admin);
    
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
    
    // ========== Extension Management ==========
    
    function setTierRegistry(address _tierRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = tierRegistry;
        tierRegistry = _tierRegistry;
        emit ExtensionUpdated("TierRegistry", old, _tierRegistry);
    }
    
    function setPaymentProcessor(address _paymentProcessor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = paymentProcessor;
        paymentProcessor = _paymentProcessor;
        emit ExtensionUpdated("PaymentProcessor", old, _paymentProcessor);
    }
    
    function setUsageTracker(address _usageTracker) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = usageTracker;
        usageTracker = _usageTracker;
        emit ExtensionUpdated("UsageTracker", old, _usageTracker);
    }
    
    function setMembershipManager(address _membershipManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = membershipManager;
        membershipManager = _membershipManager;
        emit ExtensionUpdated("MembershipManager", old, _membershipManager);
    }
    
    function setAllExtensions(
        address _tierRegistry,
        address _paymentProcessor,
        address _usageTracker,
        address _membershipManager
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_tierRegistry != address(0)) {
            tierRegistry = _tierRegistry;
            emit ExtensionUpdated("TierRegistry", address(0), _tierRegistry);
        }
        if (_paymentProcessor != address(0)) {
            paymentProcessor = _paymentProcessor;
            emit ExtensionUpdated("PaymentProcessor", address(0), _paymentProcessor);
        }
        if (_usageTracker != address(0)) {
            usageTracker = _usageTracker;
            emit ExtensionUpdated("UsageTracker", address(0), _usageTracker);
        }
        if (_membershipManager != address(0)) {
            membershipManager = _membershipManager;
            emit ExtensionUpdated("MembershipManager", address(0), _membershipManager);
        }
    }
    
    // ========== Role Management ==========
    
    /**
     * @notice Grant a role to an account (admin function)
     */
    function grantRoleByAdmin(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(role, account);
        emit RoleGrantedByAdmin(role, account, msg.sender);
    }
    
    /**
     * @notice Revoke a role from an account (admin function)
     */
    function revokeRoleByAdmin(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(role, account);
        emit RoleRevokedByAdmin(role, account, msg.sender);
    }
    
    /**
     * @notice Batch grant roles
     */
    function batchGrantRoles(
        bytes32[] calldata roles,
        address[] calldata accounts
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(roles.length == accounts.length, "Length mismatch");
        for (uint256 i = 0; i < roles.length; i++) {
            _grantRole(roles[i], accounts[i]);
            emit RoleGrantedByAdmin(roles[i], accounts[i], msg.sender);
        }
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
    
    // ========== View Functions ==========
    
    function isPaused() external view returns (bool) {
        return paused();
    }
    
    function getExtensions() external view returns (
        address _tierRegistry,
        address _paymentProcessor,
        address _usageTracker,
        address _membershipManager
    ) {
        return (tierRegistry, paymentProcessor, usageTracker, membershipManager);
    }
    
    // ========== Modifier for Extensions ==========
    
    modifier onlyExtension() {
        require(
            msg.sender == tierRegistry ||
            msg.sender == paymentProcessor ||
            msg.sender == usageTracker ||
            msg.sender == membershipManager,
            "Only extensions"
        );
        _;
    }
    
    /**
     * @notice Allow extensions to grant roles (e.g., after purchase)
     */
    function grantRoleFromExtension(bytes32 role, address account) external onlyExtension {
        _grantRole(role, account);
    }

    /**
     * @notice Check if user is within market creation limits
     * @dev Returns true by default - actual limits enforced by TierRegistry
     * @param user The user to check
     * @param role The role to check limits for
     * @return bool Always true (limits handled by TierRegistry if needed)
     */
    function checkMarketCreationLimitFor(address user, bytes32 role) external view returns (bool) {
        // Basic check: user must have the role
        // Actual limits (monthly market creation, etc.) are handled by TierRegistry
        return hasRole(role, user);
    }

    receive() external payable {}
}
