// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../MembershipPaymentManager.sol";
import "./TierRegistry.sol";

interface IRoleManagerCore {
    function grantRoleFromExtension(bytes32 role, address account) external;
    function hasRole(bytes32 role, address account) external view returns (bool);
    function paused() external view returns (bool);
}

interface IMembershipManager {
    function setMembershipExpiration(address user, bytes32 role, uint256 expiration) external;
    function getMembershipExpiration(address user, bytes32 role) external view returns (uint256);
}

/**
 * @title PaymentProcessor
 * @notice Handles payment processing for tier purchases with MembershipPaymentManager integration
 * @dev Part of modular TieredRoleManager system
 */
contract PaymentProcessor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    address internal constant SAFE_SINGLETON_FACTORY = 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7;
    
    bool private _initialized;
    
    // ========== References ==========
    
    IRoleManagerCore public roleManagerCore;
    TierRegistry public tierRegistry;
    IMembershipManager public membershipManager;
    MembershipPaymentManager public paymentManager;
    
    // ========== Events ==========
    
    event TierPurchased(
        address indexed user,
        bytes32 indexed role,
        TierRegistry.MembershipTier tier,
        uint256 price,
        address paymentToken
    );
    event TierUpgraded(
        address indexed user,
        bytes32 indexed role,
        TierRegistry.MembershipTier fromTier,
        TierRegistry.MembershipTier toTier
    );
    event PaymentManagerUpdated(address indexed oldManager, address indexed newManager);
    event RefundIssued(address indexed user, uint256 amount, address token);
    
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
    
    function setMembershipManager(address _membershipManager) external onlyOwner {
        membershipManager = IMembershipManager(_membershipManager);
    }
    
    function setPaymentManager(address _paymentManager) external onlyOwner {
        address old = address(paymentManager);
        paymentManager = MembershipPaymentManager(_paymentManager);
        emit PaymentManagerUpdated(old, _paymentManager);
    }
    
    function configureAll(
        address _roleManagerCore,
        address _tierRegistry,
        address _membershipManager,
        address _paymentManager
    ) external onlyOwner {
        if (_roleManagerCore != address(0)) roleManagerCore = IRoleManagerCore(_roleManagerCore);
        if (_tierRegistry != address(0)) tierRegistry = TierRegistry(_tierRegistry);
        if (_membershipManager != address(0)) membershipManager = IMembershipManager(_membershipManager);
        if (_paymentManager != address(0)) {
            address old = address(paymentManager);
            paymentManager = MembershipPaymentManager(_paymentManager);
            emit PaymentManagerUpdated(old, _paymentManager);
        }
    }
    
    // ========== Modifiers ==========
    
    modifier whenNotPaused() {
        require(!roleManagerCore.paused(), "System paused");
        _;
    }
    
    // ========== Purchase Functions ==========
    
    /**
     * @notice Purchase a tier with ETH
     */
    function purchaseTierWithETH(
        bytes32 role,
        TierRegistry.MembershipTier tier
    ) external payable nonReentrant whenNotPaused {
        require(tierRegistry.isTierActive(role, tier), "Tier not active");
        
        uint256 price = tierRegistry.getTierPrice(role, tier);
        require(msg.value >= price, "Insufficient payment");
        
        TierRegistry.MembershipTier currentTier = tierRegistry.getUserTier(msg.sender, role);
        require(uint8(tier) > uint8(currentTier), "Must upgrade to higher tier");
        
        // Update tier
        tierRegistry.setUserTier(msg.sender, role, tier);
        
        // Grant role if not already granted
        if (!roleManagerCore.hasRole(role, msg.sender)) {
            roleManagerCore.grantRoleFromExtension(role, msg.sender);
        }
        
        // Set default membership duration (30 days) if membership manager is configured
        if (address(membershipManager) != address(0)) {
            uint256 currentExpiration = membershipManager.getMembershipExpiration(msg.sender, role);
            if (currentExpiration == 0 || currentExpiration < block.timestamp) {
                membershipManager.setMembershipExpiration(msg.sender, role, block.timestamp + 30 days);
            }
        }
        
        emit TierPurchased(msg.sender, role, tier, msg.value, address(0));
        
        if (currentTier != TierRegistry.MembershipTier.NONE) {
            emit TierUpgraded(msg.sender, role, currentTier, tier);
        }
        
        // Refund excess
        if (msg.value > price) {
            uint256 refund = msg.value - price;
            payable(msg.sender).transfer(refund);
            emit RefundIssued(msg.sender, refund, address(0));
        }
    }
    
    /**
     * @notice Purchase a tier with ERC20 token via PaymentManager
     */
    function purchaseTierWithToken(
        bytes32 role,
        TierRegistry.MembershipTier tier,
        address paymentToken,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(address(paymentManager) != address(0), "Payment manager not set");
        require(tierRegistry.isTierActive(role, tier), "Tier not active");
        
        TierRegistry.MembershipTier currentTier = tierRegistry.getUserTier(msg.sender, role);
        require(uint8(tier) > uint8(currentTier), "Must upgrade to higher tier");
        
        // Transfer tokens from buyer to this contract
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve payment manager
        IERC20(paymentToken).safeIncreaseAllowance(address(paymentManager), amount);
        
        // Process payment through payment manager
        paymentManager.processPayment(
            address(this),
            msg.sender,
            role,
            paymentToken,
            amount,
            uint8(tier)
        );
        
        // Update tier
        tierRegistry.setUserTier(msg.sender, role, tier);
        
        // Grant role if not already granted
        if (!roleManagerCore.hasRole(role, msg.sender)) {
            roleManagerCore.grantRoleFromExtension(role, msg.sender);
        }
        
        // Set default membership duration
        if (address(membershipManager) != address(0)) {
            uint256 currentExpiration = membershipManager.getMembershipExpiration(msg.sender, role);
            if (currentExpiration == 0 || currentExpiration < block.timestamp) {
                membershipManager.setMembershipExpiration(msg.sender, role, block.timestamp + 30 days);
            }
        }
        
        emit TierPurchased(msg.sender, role, tier, amount, paymentToken);
        
        if (currentTier != TierRegistry.MembershipTier.NONE) {
            emit TierUpgraded(msg.sender, role, currentTier, tier);
        }
    }
    
    /**
     * @notice Admin grant tier (free)
     */
    function adminGrantTier(
        address user,
        bytes32 role,
        TierRegistry.MembershipTier tier,
        uint256 durationDays
    ) external onlyOwner {
        tierRegistry.setUserTier(user, role, tier);
        
        if (!roleManagerCore.hasRole(role, user)) {
            roleManagerCore.grantRoleFromExtension(role, user);
        }
        
        if (address(membershipManager) != address(0) && durationDays > 0) {
            membershipManager.setMembershipExpiration(
                user,
                role,
                block.timestamp + (durationDays * 1 days)
            );
        }
        
        emit TierPurchased(user, role, tier, 0, address(0));
    }
    
    // ========== Withdraw Functions ==========
    
    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(amount <= address(this).balance, "Insufficient balance");
        to.transfer(amount);
    }
    
    function withdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid address");
        IERC20(token).safeTransfer(to, amount);
    }
    
    receive() external payable {}
}
