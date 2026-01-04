// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TierRegistry.sol";

interface IRoleManagerCore {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function paused() external view returns (bool);
}

/**
 * @title MembershipManager
 * @notice Manages membership duration, expiration, and extensions
 * @dev Part of modular TieredRoleManager system
 */
contract MembershipManager is Ownable, ReentrancyGuard {
    
    address internal constant SAFE_SINGLETON_FACTORY = 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7;
    
    bool private _initialized;
    
    // ========== References ==========
    
    IRoleManagerCore public roleManagerCore;
    TierRegistry public tierRegistry;
    
    // ========== Membership Duration ==========
    
    enum MembershipDuration {
        ONE_MONTH,      // 30 days
        THREE_MONTHS,   // 90 days
        SIX_MONTHS,     // 180 days
        TWELVE_MONTHS,  // 365 days
        ENTERPRISE      // Custom/unlimited
    }
    
    // Duration discounts in basis points (100 = 1%)
    mapping(MembershipDuration => uint256) public durationDiscounts;
    
    // user => role => membership expiration timestamp
    mapping(address => mapping(bytes32 => uint256)) public membershipExpiration;
    
    // user => role => membership duration type
    mapping(address => mapping(bytes32 => MembershipDuration)) public membershipDurationType;
    
    // ========== Events ==========
    
    event MembershipExtended(
        address indexed user,
        bytes32 indexed role,
        uint256 newExpiration,
        MembershipDuration duration
    );
    event MembershipExpired(address indexed user, bytes32 indexed role);
    event MembershipSet(address indexed user, bytes32 indexed role, uint256 expiration);
    event DurationDiscountUpdated(MembershipDuration duration, uint256 discount);
    
    // ========== Constructor ==========
    
    constructor() Ownable(msg.sender) {
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
        
        // Set default discounts
        durationDiscounts[MembershipDuration.ONE_MONTH] = 0;
        durationDiscounts[MembershipDuration.THREE_MONTHS] = 1000;  // 10%
        durationDiscounts[MembershipDuration.SIX_MONTHS] = 2000;    // 20%
        durationDiscounts[MembershipDuration.TWELVE_MONTHS] = 3000; // 30%
        durationDiscounts[MembershipDuration.ENTERPRISE] = 4000;    // 40%
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
    
    function setDurationDiscount(MembershipDuration duration, uint256 discount) external onlyOwner {
        require(discount <= 5000, "Discount too high"); // Max 50%
        durationDiscounts[duration] = discount;
        emit DurationDiscountUpdated(duration, discount);
    }
    
    // ========== Modifiers ==========
    
    modifier whenNotPaused() {
        require(!roleManagerCore.paused(), "System paused");
        _;
    }
    
    modifier onlyAuthorized() {
        require(
            msg.sender == owner() ||
            msg.sender == address(tierRegistry),
            "Not authorized"
        );
        _;
    }
    
    // ========== Membership Management ==========
    
    /**
     * @notice Set membership expiration (called by PaymentProcessor)
     */
    function setMembershipExpiration(
        address user,
        bytes32 role,
        uint256 expiration
    ) external onlyAuthorized {
        membershipExpiration[user][role] = expiration;
        emit MembershipSet(user, role, expiration);
    }
    
    /**
     * @notice Extend membership with payment
     */
    function extendMembership(
        bytes32 role,
        MembershipDuration duration
    ) external payable nonReentrant whenNotPaused {
        TierRegistry.MembershipTier tier = tierRegistry.getUserTier(msg.sender, role);
        require(tier != TierRegistry.MembershipTier.NONE, "No active tier");
        
        uint256 extensionDays = _getDurationDays(duration);
        uint256 discount = durationDiscounts[duration];
        
        // Calculate price based on tier
        uint256 basePrice = tierRegistry.getTierPrice(role, tier);
        uint256 monthlyRate = basePrice / 12;
        uint256 totalPrice = (monthlyRate * extensionDays) / 30;
        uint256 discountedPrice = totalPrice - (totalPrice * discount / 10000);
        
        require(msg.value >= discountedPrice, "Insufficient payment");
        
        // Calculate new expiration
        uint256 currentExpiration = membershipExpiration[msg.sender][role];
        uint256 startFrom = currentExpiration > block.timestamp ? currentExpiration : block.timestamp;
        uint256 newExpiration = startFrom + (extensionDays * 1 days);
        
        membershipExpiration[msg.sender][role] = newExpiration;
        membershipDurationType[msg.sender][role] = duration;
        
        emit MembershipExtended(msg.sender, role, newExpiration, duration);
        
        // Refund excess
        if (msg.value > discountedPrice) {
            payable(msg.sender).transfer(msg.value - discountedPrice);
        }
    }
    
    /**
     * @notice Admin set membership duration
     */
    function adminSetMembership(
        address user,
        bytes32 role,
        uint256 durationDays,
        MembershipDuration durationType
    ) external onlyOwner {
        uint256 expiration = block.timestamp + (durationDays * 1 days);
        membershipExpiration[user][role] = expiration;
        membershipDurationType[user][role] = durationType;
        emit MembershipSet(user, role, expiration);
    }
    
    /**
     * @notice Admin grant unlimited membership
     */
    function adminGrantUnlimitedMembership(
        address user,
        bytes32 role
    ) external onlyOwner {
        membershipExpiration[user][role] = type(uint256).max;
        membershipDurationType[user][role] = MembershipDuration.ENTERPRISE;
        emit MembershipSet(user, role, type(uint256).max);
    }
    
    // ========== View Functions ==========
    
    /**
     * @notice Get membership expiration timestamp
     */
    function getMembershipExpiration(
        address user,
        bytes32 role
    ) external view returns (uint256) {
        return membershipExpiration[user][role];
    }
    
    /**
     * @notice Check if membership is active (not expired)
     */
    function isMembershipActive(
        address user,
        bytes32 role
    ) external view returns (bool) {
        uint256 expiration = membershipExpiration[user][role];
        if (expiration == 0) return true; // No expiration set = active
        return block.timestamp <= expiration;
    }
    
    /**
     * @notice Get effective user tier (NONE if expired)
     */
    function getEffectiveTier(
        address user,
        bytes32 role
    ) external view returns (TierRegistry.MembershipTier) {
        uint256 expiration = membershipExpiration[user][role];
        if (expiration > 0 && block.timestamp > expiration) {
            return TierRegistry.MembershipTier.NONE;
        }
        return tierRegistry.getUserTier(user, role);
    }
    
    /**
     * @notice Get remaining membership days
     */
    function getRemainingDays(
        address user,
        bytes32 role
    ) external view returns (uint256) {
        uint256 expiration = membershipExpiration[user][role];
        if (expiration == 0 || expiration == type(uint256).max) {
            return type(uint256).max; // Unlimited
        }
        if (block.timestamp >= expiration) {
            return 0;
        }
        return (expiration - block.timestamp) / 1 days;
    }
    
    /**
     * @notice Calculate extension price
     */
    function calculateExtensionPrice(
        bytes32 role,
        TierRegistry.MembershipTier tier,
        MembershipDuration duration
    ) external view returns (uint256 price, uint256 discount) {
        uint256 extensionDays = _getDurationDays(duration);
        discount = durationDiscounts[duration];
        
        uint256 basePrice = tierRegistry.getTierPrice(role, tier);
        uint256 monthlyRate = basePrice / 12;
        uint256 totalPrice = (monthlyRate * extensionDays) / 30;
        price = totalPrice - (totalPrice * discount / 10000);
        
        return (price, discount);
    }
    
    // ========== Internal Functions ==========
    
    function _getDurationDays(MembershipDuration duration) internal pure returns (uint256) {
        if (duration == MembershipDuration.ONE_MONTH) return 30;
        if (duration == MembershipDuration.THREE_MONTHS) return 90;
        if (duration == MembershipDuration.SIX_MONTHS) return 180;
        if (duration == MembershipDuration.TWELVE_MONTHS) return 365;
        if (duration == MembershipDuration.ENTERPRISE) return 365 * 10; // 10 years
        return 30;
    }
    
    // ========== Withdraw ==========
    
    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(amount <= address(this).balance, "Insufficient balance");
        to.transfer(amount);
    }
    
    receive() external payable {}
}
