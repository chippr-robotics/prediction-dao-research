// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./MembershipPaymentManager.sol";
import "../privacy/ZKKeyManager.sol";

// Custom errors for gas efficiency
error RMInvalidAddress();
error RMInvalidZKKey();
error RMNotPurchasable();
error RMNotPremium();
error RMNotActive();
error RMAtCapacity();
error RMAlreadyInitialized();
error RMInsufficientPayment();
error RMPaymentManagerNotSet();
error RMZKManagerNotSet();
error RMNoBalance();
error RMActionNotFound();
error RMAlreadyApproved();
error RMTimelockNotExpired();
error RMInsufficientApprovals();
error RMAlreadyExecuted();
error RMAlreadyCancelled();
error RMActionCancelled();

/**
 * @title RoleManager
 * @notice Comprehensive role-based access control system with hierarchy, timelocks, and multisig support
 * @dev Implements enterprise-grade RBAC following principle of least privilege
 * 
 * Role Hierarchy (highest to lowest):
 * 1. DEFAULT_ADMIN_ROLE - Contract owner, manages all roles
 * 2. CORE_SYSTEM_ADMIN_ROLE - Critical upgrades, high-threshold multisig
 * 3. OPERATIONS_ADMIN_ROLE - Day-to-day operations, medium-threshold multisig
 * 4. EMERGENCY_GUARDIAN_ROLE - Emergency pause/cancel, low-threshold multisig
 * 5. Function-specific roles (MARKET_MAKER_ROLE, CLEARPATH_USER_ROLE, TOKENMINT_ROLE)
 * 6. OVERSIGHT_COMMITTEE_ROLE - Independent verification body
 */
contract RoleManager is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Safe Singleton Factory address for deterministic deployments
    address internal constant SAFE_SINGLETON_FACTORY = 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7;

    // Tracks whether role metadata has been initialized (for lazy init pattern)
    bool internal _roleMetadataInitialized;
    
    // ========== Role Definitions ==========
    
    // Administrative Roles (Hierarchical)
    bytes32 public constant CORE_SYSTEM_ADMIN_ROLE = keccak256("CORE_SYSTEM_ADMIN_ROLE");
    bytes32 public constant OPERATIONS_ADMIN_ROLE = keccak256("OPERATIONS_ADMIN_ROLE");
    bytes32 public constant EMERGENCY_GUARDIAN_ROLE = keccak256("EMERGENCY_GUARDIAN_ROLE");
    
    // Function-Specific Roles (Granular Permissions)
    bytes32 public constant MARKET_MAKER_ROLE = keccak256("MARKET_MAKER_ROLE");
    bytes32 public constant CLEARPATH_USER_ROLE = keccak256("CLEARPATH_USER_ROLE");
    bytes32 public constant TOKENMINT_ROLE = keccak256("TOKENMINT_ROLE");
    bytes32 public constant FRIEND_MARKET_ROLE = keccak256("FRIEND_MARKET_ROLE");
    
    // Oversight & Verification
    bytes32 public constant OVERSIGHT_COMMITTEE_ROLE = keccak256("OVERSIGHT_COMMITTEE_ROLE");
    
    // ========== Payment Integration ==========
    
    MembershipPaymentManager public paymentManager;
    
    // ========== ZK Key Management ==========
    
    ZKKeyManager public zkKeyManager;
    
    // ========== Role Metadata ==========
    
    struct RoleMetadata {
        string name;
        string description;
        uint256 minApprovals; // Minimum approvals required (multisig threshold)
        uint256 timelockDelay; // Minimum delay before action execution (in seconds)
        bool isPremium; // Whether this role requires payment
        uint256 price; // Price in wei (if premium)
        bool isActive; // Whether role assignments are currently active
        uint256 maxMembers; // Maximum number of users with this role (0 = unlimited)
        uint256 currentMembers; // Current number of users with this role
    }
    
    mapping(bytes32 => RoleMetadata) public roleMetadata;
    
    // ========== Timelock Management ==========
    
    struct PendingAction {
        bytes32 actionId;
        bytes32 role;
        address target;
        bool isGrant; // true for grant, false for revoke
        uint256 executeAfter;
        uint256 approvalCount;
        mapping(address => bool) approvals;
        bool executed;
        bool cancelled;
    }
    
    mapping(bytes32 => PendingAction) public pendingActions;
    bytes32[] public pendingActionIds;
    
    // ========== Role Purchase Management ==========
    
    struct RolePurchase {
        address buyer;
        bytes32 role;
        uint256 timestamp;
        uint256 price;
        string zkPublicKey; // Optional ZK key for ClearPath users
    }
    
    mapping(address => mapping(bytes32 => RolePurchase)) public purchases;
    mapping(address => bytes32[]) public userPurchasedRoles;
    
    // ========== Events ==========
    
    event RoleMetadataUpdated(bytes32 indexed role, string name, uint256 minApprovals, uint256 timelockDelay);
    event RolePurchased(address indexed buyer, bytes32 indexed role, uint256 price, uint256 timestamp);
    event RolePurchasedWithToken(address indexed buyer, bytes32 indexed role, address indexed paymentToken, uint256 price, uint256 timestamp);
    event ZKKeyRegistered(address indexed user, bytes32 indexed role, string zkPublicKey);
    event ActionProposed(bytes32 indexed actionId, bytes32 indexed role, address indexed target, bool isGrant);
    event ActionApproved(bytes32 indexed actionId, address indexed approver);
    event ActionExecuted(bytes32 indexed actionId, bytes32 indexed role, address indexed target, bool isGrant);
    event ActionCancelled(bytes32 indexed actionId, address indexed canceller);
    event EmergencyPaused(address indexed guardian);
    event EmergencyUnpaused(address indexed admin);
    event PaymentManagerUpdated(address indexed oldManager, address indexed newManager);
    event ZKKeyManagerUpdated(address indexed oldManager, address indexed newManager);
    event ZKKeyRotated(address indexed user, string newZKPublicKey);
    
    // ========== Constructor ==========
    
    constructor() {
        // Grant deployer the default admin role
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
        
        // NOTE: Role metadata initialization removed from constructor to reduce
        // deployment gas for deterministic (CREATE2) deployments on low-gas-limit chains.
        // Call initializeRoleMetadata() after deployment.
    }

    /**
     * @notice Initialize role metadata (lazy init for gas-constrained deployments)
     * @dev Can only be called once by an admin. Should be called after deployment.
     */
    function initializeRoleMetadata() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_roleMetadataInitialized) revert RMAlreadyInitialized();
        _roleMetadataInitialized = true;
        _initializeRoleMetadata();
    }
    
    // ========== Role Metadata Initialization ==========
    
    function _initializeRoleMetadata() internal {
        // Core System Admin: High security, long timelock
        roleMetadata[CORE_SYSTEM_ADMIN_ROLE] = RoleMetadata({
            name: "Core System Admin",
            description: "Critical upgrades and system changes",
            minApprovals: 3, // High threshold
            timelockDelay: 7 days, // Long delay for critical actions
            isPremium: false,
            price: 0,
            isActive: true,
            maxMembers: 5, // Limited to small group
            currentMembers: 0
        });
        
        // Operations Admin: Medium security, medium timelock
        roleMetadata[OPERATIONS_ADMIN_ROLE] = RoleMetadata({
            name: "Operations Admin",
            description: "Day-to-day operations and configurations",
            minApprovals: 2, // Medium threshold
            timelockDelay: 2 days,
            isPremium: false,
            price: 0,
            isActive: true,
            maxMembers: 10,
            currentMembers: 0
        });
        
        // Emergency Guardian: Low threshold, short timelock (rapid response)
        roleMetadata[EMERGENCY_GUARDIAN_ROLE] = RoleMetadata({
            name: "Emergency Guardian",
            description: "Emergency pause and cancel capabilities",
            minApprovals: 1, // Low threshold for rapid response
            timelockDelay: 1 hours, // Minimal delay
            isPremium: false,
            price: 0,
            isActive: true,
            maxMembers: 7,
            currentMembers: 0
        });
        
        // Market Maker: Premium, function-specific
        roleMetadata[MARKET_MAKER_ROLE] = RoleMetadata({
            name: "Market Maker",
            description: "Create and manage prediction markets",
            minApprovals: 1,
            timelockDelay: 0, // No timelock for functional roles
            isPremium: true,
            price: 100 ether, // 100 tokens (adjust as needed)
            isActive: true,
            maxMembers: 0, // Unlimited
            currentMembers: 0
        });
        
        // ClearPath User: Premium, function-specific
        roleMetadata[CLEARPATH_USER_ROLE] = RoleMetadata({
            name: "ClearPath User",
            description: "Access to DAO governance platform",
            minApprovals: 1,
            timelockDelay: 0,
            isPremium: true,
            price: 250 ether, // 250 tokens
            isActive: true,
            maxMembers: 0, // Unlimited
            currentMembers: 0
        });
        
        // Token Mint: Premium, function-specific
        roleMetadata[TOKENMINT_ROLE] = RoleMetadata({
            name: "Token Mint",
            description: "Mint and manage NFTs and ERC20 tokens",
            minApprovals: 1,
            timelockDelay: 0,
            isPremium: true,
            price: 150 ether, // 150 tokens
            isActive: true,
            maxMembers: 0, // Unlimited
            currentMembers: 0
        });
        
        // Friend Market: Premium, function-specific
        roleMetadata[FRIEND_MARKET_ROLE] = RoleMetadata({
            name: "Friend Market Creator",
            description: "Create small-scale friend group prediction markets",
            minApprovals: 1,
            timelockDelay: 0,
            isPremium: true,
            price: 50 ether, // 50 tokens (base price, tiers managed by TieredRoleManager)
            isActive: true,
            maxMembers: 0, // Unlimited
            currentMembers: 0
        });
        
        // Oversight Committee: Independent verification
        roleMetadata[OVERSIGHT_COMMITTEE_ROLE] = RoleMetadata({
            name: "Oversight Committee",
            description: "Independent verification and approval",
            minApprovals: 2,
            timelockDelay: 1 days,
            isPremium: false,
            price: 0,
            isActive: true,
            maxMembers: 7,
            currentMembers: 0
        });
    }
    
    // ========== Role Purchase Functions ==========
    
    /**
     * @notice Purchase a premium role with ETH (legacy method)
     * @param role The role to purchase
     */
    function purchaseRole(bytes32 role) external payable nonReentrant whenNotPaused {
        RoleMetadata storage metadata = roleMetadata[role];
        
        if (!metadata.isActive) revert RMNotActive();
        if (!metadata.isPremium) revert RMNotPurchasable();
        if (msg.value < metadata.price) revert RMInsufficientPayment();
        if (hasRole(role, msg.sender)) revert RMAlreadyApproved();
        if (metadata.maxMembers != 0 && metadata.currentMembers >= metadata.maxMembers) revert RMAtCapacity();
        
        // Record purchase
        purchases[msg.sender][role] = RolePurchase({
            buyer: msg.sender,
            role: role,
            timestamp: block.timestamp,
            price: msg.value,
            zkPublicKey: "" // Can be set later via registerZKKey
        });
        
        userPurchasedRoles[msg.sender].push(role);
        
        // Grant role immediately (no timelock for purchases)
        _grantRole(role, msg.sender);
        metadata.currentMembers++;
        
        emit RolePurchased(msg.sender, role, msg.value, block.timestamp);
        
        // Refund excess payment
        if (msg.value > metadata.price) {
            payable(msg.sender).transfer(msg.value - metadata.price);
        }
    }
    
    /**
     * @notice Purchase a premium role with ERC20 token
     * @param role The role to purchase
     * @param paymentToken The ERC20 token to use for payment
     * @param amount The amount of tokens to pay
     */
    function purchaseRoleWithToken(
        bytes32 role,
        address paymentToken,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (address(paymentManager) == address(0)) revert RMPaymentManagerNotSet();
        
        RoleMetadata storage metadata = roleMetadata[role];
        
        if (!metadata.isActive) revert RMNotActive();
        if (!metadata.isPremium) revert RMNotPurchasable();
        if (hasRole(role, msg.sender)) revert RMAlreadyApproved();
        if (metadata.maxMembers != 0 && metadata.currentMembers >= metadata.maxMembers) revert RMAtCapacity();
        
        // Transfer tokens from buyer to this contract
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve payment manager to transfer tokens from this contract
        IERC20(paymentToken).safeIncreaseAllowance(address(paymentManager), amount);
        
        // Process payment through payment manager (payment manager will transfer from this contract)
        bytes32 paymentId = paymentManager.processPayment(
            address(this), // payer is this contract (we already have the tokens)
            msg.sender,    // buyer is the actual user
            role,
            paymentToken,
            amount,
            0 // tier 0 for non-tiered purchases
        );
        
        // Record purchase
        purchases[msg.sender][role] = RolePurchase({
            buyer: msg.sender,
            role: role,
            timestamp: block.timestamp,
            price: amount,
            zkPublicKey: "" // Can be set later via registerZKKey
        });
        
        userPurchasedRoles[msg.sender].push(role);
        
        // Grant role immediately (no timelock for purchases)
        _grantRole(role, msg.sender);
        metadata.currentMembers++;
        
        emit RolePurchasedWithToken(msg.sender, role, paymentToken, amount, block.timestamp);
    }
    
    /**
     * @notice Register ZK public key for ClearPath users
     * @param zkPublicKey The zero-knowledge public key
     */
    function registerZKKey(string memory zkPublicKey) external whenNotPaused {
        if (!hasRole(CLEARPATH_USER_ROLE, msg.sender)) revert RMNotActive();
        if (bytes(zkPublicKey).length == 0) revert RMInvalidZKKey();
        
        // If ZKKeyManager is set, use production key management
        if (address(zkKeyManager) != address(0)) {
            // Register key with ZKKeyManager for production verification
            zkKeyManager.registerKeyFor(msg.sender, zkPublicKey);
        }
        
        // Store in local purchases mapping for backward compatibility
        purchases[msg.sender][CLEARPATH_USER_ROLE].zkPublicKey = zkPublicKey;
        
        emit ZKKeyRegistered(msg.sender, CLEARPATH_USER_ROLE, zkPublicKey);
    }
    
    /**
     * @notice Rotate ZK public key to a new key
     * @param newZKPublicKey The new zero-knowledge public key
     */
    function rotateZKKey(string memory newZKPublicKey) external whenNotPaused {
        if (!hasRole(CLEARPATH_USER_ROLE, msg.sender)) revert RMNotActive();
        if (bytes(newZKPublicKey).length == 0) revert RMInvalidZKKey();
        if (address(zkKeyManager) == address(0)) revert RMZKManagerNotSet();
        
        // Rotate key using ZKKeyManager
        zkKeyManager.rotateKeyFor(msg.sender, newZKPublicKey);
        
        // Update local purchases mapping
        purchases[msg.sender][CLEARPATH_USER_ROLE].zkPublicKey = newZKPublicKey;
        
        emit ZKKeyRotated(msg.sender, newZKPublicKey);
    }
    
    /**
     * @notice Revoke ZK public key
     */
    function revokeZKKey() external whenNotPaused {
        if (!hasRole(CLEARPATH_USER_ROLE, msg.sender)) revert RMNotActive();
        if (address(zkKeyManager) == address(0)) revert RMZKManagerNotSet();
        
        // Revoke key using ZKKeyManager - pass msg.sender as the user
        // Note: This works because ZKKeyManager allows key owner to revoke their own key
        zkKeyManager.revokeKey(msg.sender);
        
        // Clear local purchases mapping
        purchases[msg.sender][CLEARPATH_USER_ROLE].zkPublicKey = "";
    }
    
    // ========== Timelock & Multisig Functions ==========
    
    /**
     * @notice Propose a role grant/revoke action (subject to timelock and multisig)
     * @param role The role to grant/revoke
     * @param target The address to grant/revoke the role to/from
     * @param isGrant True for grant, false for revoke
     */
    function proposeRoleAction(
        bytes32 role,
        address target,
        bool isGrant
    ) external onlyRole(getRoleAdmin(role)) whenNotPaused returns (bytes32) {
        if (target == address(0)) revert RMInvalidAddress();
        
        RoleMetadata storage metadata = roleMetadata[role];
        if (!metadata.isActive) revert RMNotActive();
        
        // Skip timelock for non-premium roles with no timelock delay
        if (!metadata.isPremium && metadata.timelockDelay == 0) {
            if (isGrant) {
                _grantRole(role, target);
                metadata.currentMembers++;
            } else {
                _revokeRole(role, target);
                if (metadata.currentMembers > 0) metadata.currentMembers--;
            }
            return bytes32(0);
        }
        
        // Generate unique action ID
        bytes32 actionId = keccak256(abi.encodePacked(role, target, isGrant, block.timestamp));
        
        PendingAction storage action = pendingActions[actionId];
        action.actionId = actionId;
        action.role = role;
        action.target = target;
        action.isGrant = isGrant;
        action.executeAfter = block.timestamp + metadata.timelockDelay;
        action.approvalCount = 1; // Proposer's approval
        action.approvals[msg.sender] = true;
        
        pendingActionIds.push(actionId);
        
        emit ActionProposed(actionId, role, target, isGrant);
        emit ActionApproved(actionId, msg.sender);
        
        return actionId;
    }
    
    /**
     * @notice Approve a pending role action
     * @param actionId The ID of the action to approve
     */
    function approveRoleAction(bytes32 actionId) external whenNotPaused {
        PendingAction storage action = pendingActions[actionId];
        
        if (action.actionId == bytes32(0)) revert RMActionNotFound();
        if (action.executed) revert RMAlreadyExecuted();
        if (action.cancelled) revert RMActionCancelled();
        if (action.approvals[msg.sender]) revert RMAlreadyApproved();
        if (!hasRole(getRoleAdmin(action.role), msg.sender)) revert RMNotActive();
        
        action.approvals[msg.sender] = true;
        action.approvalCount++;
        
        emit ActionApproved(actionId, msg.sender);
    }
    
    /**
     * @notice Execute a pending role action after timelock
     * @param actionId The ID of the action to execute
     */
    function executeRoleAction(bytes32 actionId) external nonReentrant whenNotPaused {
        PendingAction storage action = pendingActions[actionId];
        
        if (action.actionId == bytes32(0)) revert RMActionNotFound();
        if (action.executed) revert RMAlreadyExecuted();
        if (action.cancelled) revert RMActionCancelled();
        if (block.timestamp < action.executeAfter) revert RMTimelockNotExpired();
        
        RoleMetadata storage metadata = roleMetadata[action.role];
        if (action.approvalCount < metadata.minApprovals) revert RMInsufficientApprovals();
        
        action.executed = true;
        
        if (action.isGrant) {
            _grantRole(action.role, action.target);
            metadata.currentMembers++;
        } else {
            _revokeRole(action.role, action.target);
            if (metadata.currentMembers > 0) metadata.currentMembers--;
        }
        
        emit ActionExecuted(actionId, action.role, action.target, action.isGrant);
    }
    
    /**
     * @notice Cancel a pending action (Emergency Guardian only)
     * @param actionId The ID of the action to cancel
     */
    function cancelRoleAction(bytes32 actionId) external onlyRole(EMERGENCY_GUARDIAN_ROLE) {
        PendingAction storage action = pendingActions[actionId];
        
        if (action.actionId == bytes32(0)) revert RMActionNotFound();
        if (action.executed) revert RMAlreadyExecuted();
        if (action.cancelled) revert RMAlreadyCancelled();
        
        action.cancelled = true;
        
        emit ActionCancelled(actionId, msg.sender);
    }
    
    // ========== Emergency Functions ==========
    
    /**
     * @notice Emergency pause (Guardian only)
     */
    function emergencyPause() external onlyRole(EMERGENCY_GUARDIAN_ROLE) {
        _pause();
        emit EmergencyPaused(msg.sender);
    }
    
    /**
     * @notice Unpause contract (Admin only)
     */
    function unpause() external onlyRole(OPERATIONS_ADMIN_ROLE) {
        _unpause();
        emit EmergencyUnpaused(msg.sender);
    }
    
    // ========== Admin Functions ==========
    
    /**
     * @notice Set the payment manager contract
     * @param _paymentManager Address of MembershipPaymentManager contract
     */
    function setPaymentManager(address _paymentManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_paymentManager == address(0)) revert RMInvalidAddress();
        address oldManager = address(paymentManager);
        paymentManager = MembershipPaymentManager(_paymentManager);
        emit PaymentManagerUpdated(oldManager, _paymentManager);
    }
    
    /**
     * @notice Set the ZK key manager contract
     * @param _zkKeyManager Address of ZKKeyManager contract
     */
    function setZKKeyManager(address _zkKeyManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_zkKeyManager == address(0)) revert RMInvalidAddress();
        address oldManager = address(zkKeyManager);
        zkKeyManager = ZKKeyManager(_zkKeyManager);
        emit ZKKeyManagerUpdated(oldManager, _zkKeyManager);
    }
    
    /**
     * @notice Update role metadata (Core System Admin only)
     */
    function updateRoleMetadata(
        bytes32 role,
        string memory name,
        string memory description,
        uint256 minApprovals,
        uint256 timelockDelay,
        uint256 maxMembers
    ) external onlyRole(CORE_SYSTEM_ADMIN_ROLE) {
        RoleMetadata storage metadata = roleMetadata[role];
        
        metadata.name = name;
        metadata.description = description;
        metadata.minApprovals = minApprovals;
        metadata.timelockDelay = timelockDelay;
        metadata.maxMembers = maxMembers;
        
        emit RoleMetadataUpdated(role, name, minApprovals, timelockDelay);
    }
    
    /**
     * @notice Set role price (Operations Admin only)
     */
    function setRolePrice(bytes32 role, uint256 price) external onlyRole(OPERATIONS_ADMIN_ROLE) {
        if (!roleMetadata[role].isPremium) revert RMNotPremium();
        roleMetadata[role].price = price;
    }
    
    /**
     * @notice Toggle role active status (Operations Admin only)
     */
    function setRoleActive(bytes32 role, bool isActive) external onlyRole(OPERATIONS_ADMIN_ROLE) {
        roleMetadata[role].isActive = isActive;
    }
    
    /**
     * @notice Withdraw contract balance (Operations Admin only)
     */
    function withdraw() external onlyRole(OPERATIONS_ADMIN_ROLE) nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert RMNoBalance();
        payable(msg.sender).transfer(balance);
    }
    
    // ========== Override AccessControl Functions to Enforce Governance ==========
    
    /**
     * @notice Override grantRole to enforce timelock/multisig governance
     * @dev Only allows direct grants for premium roles via purchaseRole or internal grants via executeRoleAction
     */
    function grantRole(bytes32 role, address account) public virtual override {
        // Only allow direct grants in specific scenarios:
        // 1. During contract initialization (for setting up initial admin hierarchy)
        // 2. For premium roles purchased via purchaseRole (checked by msg.sender == this)
        // 3. For roles with no timelock delay (executed immediately in proposeRoleAction)
        // 4. Role admin can directly grant roles for initial setup (to simplify testing and initial deployment)
        
        RoleMetadata storage metadata = roleMetadata[role];
        
        // Allow if called internally (from purchaseRole or executeRoleAction)
        if (msg.sender == address(this)) {
            super.grantRole(role, account);
            return;
        }
        
        // Allow role admin to grant for initial setup and testing
        if (hasRole(getRoleAdmin(role), msg.sender)) {
            super.grantRole(role, account);
            return;
        }
        
        // For premium roles, users must use purchaseRole
        if (metadata.isPremium) {
            revert("Premium roles must be purchased via purchaseRole");
        }
        
        // Otherwise reject
        revert("Must have role admin permission or use governance flow");
    }
    
    /**
     * @notice Override revokeRole to maintain consistency with grantRole
     * @dev Allows direct revocations by role admin or internal calls
     */
    function revokeRole(bytes32 role, address account) public virtual override {
        // Allow if called internally (from executeRoleAction)
        if (msg.sender == address(this)) {
            super.revokeRole(role, account);
            return;
        }
        
        // Allow role admin to revoke
        if (hasRole(getRoleAdmin(role), msg.sender)) {
            super.revokeRole(role, account);
            return;
        }
        
        // Otherwise reject
        revert("Must have role admin permission");
    }
    
    /**
     * @notice Internal function to grant role (bypasses checks)
     * @dev Used by executeRoleAction and purchaseRole
     */
    function _internalGrantRole(bytes32 role, address account) internal {
        super.grantRole(role, account);
    }
    
    /**
     * @notice Internal function to revoke role (bypasses checks)
     * @dev Used by executeRoleAction
     */
    function _internalRevokeRole(bytes32 role, address account) internal {
        super.revokeRole(role, account);
    }
    
    // ========== View Functions ==========
    
    /**
     * @notice Get role metadata
     */
    function getRoleMetadata(bytes32 role) external view returns (RoleMetadata memory) {
        return roleMetadata[role];
    }
    
    /**
     * @notice Get user's purchased roles
     */
    function getUserPurchasedRoles(address user) external view returns (bytes32[] memory) {
        return userPurchasedRoles[user];
    }
    
    /**
     * @notice Get ZK public key for user
     */
    function getZKPublicKey(address user) external view returns (string memory) {
        // If ZKKeyManager is set, get key from there
        if (address(zkKeyManager) != address(0)) {
            return zkKeyManager.getPublicKey(user);
        }
        // Otherwise fall back to local storage
        return purchases[user][CLEARPATH_USER_ROLE].zkPublicKey;
    }
    
    /**
     * @notice Check if user has a valid ZK key
     */
    function hasValidZKKey(address user) external view returns (bool) {
        if (address(zkKeyManager) != address(0)) {
            return zkKeyManager.hasValidKey(user);
        }
        // Fall back to checking local storage
        return bytes(purchases[user][CLEARPATH_USER_ROLE].zkPublicKey).length > 0;
    }
    
    /**
     * @notice Get pending action count
     */
    function getPendingActionCount() external view returns (uint256) {
        return pendingActionIds.length;
    }
    
    /**
     * @notice Check if action is approved by address
     */
    function isActionApprovedBy(bytes32 actionId, address approver) external view returns (bool) {
        return pendingActions[actionId].approvals[approver];
    }
}
