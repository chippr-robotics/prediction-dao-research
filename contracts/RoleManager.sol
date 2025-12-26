// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

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
    
    // ========== Role Definitions ==========
    
    // Administrative Roles (Hierarchical)
    bytes32 public constant CORE_SYSTEM_ADMIN_ROLE = keccak256("CORE_SYSTEM_ADMIN_ROLE");
    bytes32 public constant OPERATIONS_ADMIN_ROLE = keccak256("OPERATIONS_ADMIN_ROLE");
    bytes32 public constant EMERGENCY_GUARDIAN_ROLE = keccak256("EMERGENCY_GUARDIAN_ROLE");
    
    // Function-Specific Roles (Granular Permissions)
    bytes32 public constant MARKET_MAKER_ROLE = keccak256("MARKET_MAKER_ROLE");
    bytes32 public constant CLEARPATH_USER_ROLE = keccak256("CLEARPATH_USER_ROLE");
    bytes32 public constant TOKENMINT_ROLE = keccak256("TOKENMINT_ROLE");
    
    // Oversight & Verification
    bytes32 public constant OVERSIGHT_COMMITTEE_ROLE = keccak256("OVERSIGHT_COMMITTEE_ROLE");
    
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
    event ZKKeyRegistered(address indexed user, bytes32 indexed role, string zkPublicKey);
    event ActionProposed(bytes32 indexed actionId, bytes32 indexed role, address indexed target, bool isGrant);
    event ActionApproved(bytes32 indexed actionId, address indexed approver);
    event ActionExecuted(bytes32 indexed actionId, bytes32 indexed role, address indexed target, bool isGrant);
    event ActionCancelled(bytes32 indexed actionId, address indexed canceller);
    event EmergencyPaused(address indexed guardian);
    event EmergencyUnpaused(address indexed admin);
    
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
        _setRoleAdmin(OVERSIGHT_COMMITTEE_ROLE, DEFAULT_ADMIN_ROLE);
        
        // Initialize role metadata
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
     * @notice Purchase a premium role
     * @param role The role to purchase
     */
    function purchaseRole(bytes32 role) external payable nonReentrant whenNotPaused {
        RoleMetadata storage metadata = roleMetadata[role];
        
        require(metadata.isActive, "Role is not active");
        require(metadata.isPremium, "Role is not purchasable");
        require(msg.value >= metadata.price, "Insufficient payment");
        require(!hasRole(role, msg.sender), "Already has role");
        require(metadata.maxMembers == 0 || metadata.currentMembers < metadata.maxMembers, "Role at max capacity");
        
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
     * @notice Register ZK public key for ClearPath users
     * @param zkPublicKey The zero-knowledge public key
     */
    function registerZKKey(string memory zkPublicKey) external whenNotPaused {
        require(hasRole(CLEARPATH_USER_ROLE, msg.sender), "Must have ClearPath role");
        require(bytes(zkPublicKey).length > 0, "Invalid ZK key");
        
        purchases[msg.sender][CLEARPATH_USER_ROLE].zkPublicKey = zkPublicKey;
        
        emit ZKKeyRegistered(msg.sender, CLEARPATH_USER_ROLE, zkPublicKey);
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
        require(target != address(0), "Invalid target address");
        
        RoleMetadata storage metadata = roleMetadata[role];
        require(metadata.isActive, "Role is not active");
        
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
        
        require(action.actionId != bytes32(0), "Action does not exist");
        require(!action.executed, "Action already executed");
        require(!action.cancelled, "Action cancelled");
        require(!action.approvals[msg.sender], "Already approved");
        require(hasRole(getRoleAdmin(action.role), msg.sender), "Not authorized to approve");
        
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
        
        require(action.actionId != bytes32(0), "Action does not exist");
        require(!action.executed, "Action already executed");
        require(!action.cancelled, "Action cancelled");
        require(block.timestamp >= action.executeAfter, "Timelock not expired");
        
        RoleMetadata storage metadata = roleMetadata[action.role];
        require(action.approvalCount >= metadata.minApprovals, "Insufficient approvals");
        
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
        
        require(action.actionId != bytes32(0), "Action does not exist");
        require(!action.executed, "Action already executed");
        require(!action.cancelled, "Action already cancelled");
        
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
        require(roleMetadata[role].isPremium, "Role is not premium");
        roleMetadata[role].price = price;
    }
    
    /**
     * @notice Toggle role active status (Operations Admin only)
     */
    function setRoleActive(bytes32 role, bool isActive) external onlyRole(OPERATIONS_ADMIN_ROLE) {
        roleMetadata[role].isActive = isActive;
    }
    
    /**
     * @notice Withdraw contract balance (Default Admin only)
     */
    function withdraw() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
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
        
        RoleMetadata storage metadata = roleMetadata[role];
        
        // Allow if called internally (from purchaseRole or executeRoleAction)
        if (msg.sender == address(this)) {
            super.grantRole(role, account);
            return;
        }
        
        // For premium roles, users must use purchaseRole
        if (metadata.isPremium) {
            revert("Premium roles must be purchased via purchaseRole");
        }
        
        // For non-premium administrative roles, must use governance flow
        if (metadata.timelockDelay > 0 || metadata.minApprovals > 1) {
            revert("Administrative roles must use proposeRoleAction/executeRoleAction for governance");
        }
        
        // If no timelock and single approval, defer to normal access control
        require(hasRole(getRoleAdmin(role), msg.sender), "AccessControl: account is missing role");
        super.grantRole(role, account);
    }
    
    /**
     * @notice Override revokeRole to enforce timelock/multisig governance
     * @dev Only allows direct revocations via internal calls or for roles without governance requirements
     */
    function revokeRole(bytes32 role, address account) public virtual override {
        RoleMetadata storage metadata = roleMetadata[role];
        
        // Allow if called internally (from executeRoleAction)
        if (msg.sender == address(this)) {
            super.revokeRole(role, account);
            return;
        }
        
        // For roles with governance requirements, must use governance flow
        if (metadata.timelockDelay > 0 || metadata.minApprovals > 1) {
            revert("Administrative roles must use proposeRoleAction/executeRoleAction for governance");
        }
        
        // If no timelock and single approval, defer to normal access control
        require(hasRole(getRoleAdmin(role), msg.sender), "AccessControl: account is missing role");
        super.revokeRole(role, account);
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
        return purchases[user][CLEARPATH_USER_ROLE].zkPublicKey;
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
