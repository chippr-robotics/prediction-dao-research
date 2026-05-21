// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TierRegistry
 * @notice Stores tier metadata and limits configuration
 * @dev Part of modular TieredRoleManager system
 */
contract TierRegistry is Ownable {
    
    address internal constant SAFE_SINGLETON_FACTORY = 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7;
    
    bool private _initialized;
    
    // Reference to core role manager
    address public roleManagerCore;

    // Authorized extensions (e.g., PaymentProcessor)
    mapping(address => bool) public authorizedExtensions;
    
    // ========== Tier Definitions ==========
    
    enum MembershipTier { NONE, BRONZE, SILVER, GOLD, PLATINUM }
    
    struct TierLimits {
        uint256 dailyBetLimit;
        uint256 weeklyBetLimit;
        uint256 monthlyMarketCreation;
        uint256 maxPositionSize;
        uint256 maxConcurrentMarkets;
        uint256 withdrawalLimit;
        bool canCreatePrivateMarkets;
        bool canUseAdvancedFeatures;
        uint256 feeDiscount; // basis points (100 = 1%)
    }
    
    struct TierMetadata {
        string name;
        string description;
        uint256 price;
        TierLimits limits;
        bool isActive;
    }
    
    // role => tier => metadata
    mapping(bytes32 => mapping(MembershipTier => TierMetadata)) public tierMetadata;
    
    // user => role => current tier
    mapping(address => mapping(bytes32 => MembershipTier)) public userTiers;
    
    // user => role => tier => purchase timestamp
    mapping(address => mapping(bytes32 => mapping(MembershipTier => uint256))) public tierPurchases;
    
    // ========== Events ==========
    
    event TierMetadataSet(bytes32 indexed role, MembershipTier indexed tier, string name, uint256 price);
    event TierLimitsUpdated(bytes32 indexed role, MembershipTier indexed tier);
    event TierActiveStatusChanged(bytes32 indexed role, MembershipTier indexed tier, bool active);
    event TierPriceUpdated(bytes32 indexed role, MembershipTier indexed tier, uint256 newPrice);
    event UserTierSet(address indexed user, bytes32 indexed role, MembershipTier tier);
    event AuthorizedExtensionSet(address indexed extension, bool authorized);
    
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
        roleManagerCore = _roleManagerCore;
    }

    function setAuthorizedExtension(address extension, bool authorized) external onlyOwner {
        authorizedExtensions[extension] = authorized;
        emit AuthorizedExtensionSet(extension, authorized);
    }
    
    // ========== Tier Metadata Management ==========
    
    function setTierMetadata(
        bytes32 role,
        MembershipTier tier,
        string calldata name,
        string calldata description,
        uint256 price,
        TierLimits calldata limits,
        bool isActive
    ) external onlyOwner {
        tierMetadata[role][tier] = TierMetadata({
            name: name,
            description: description,
            price: price,
            limits: limits,
            isActive: isActive
        });
        emit TierMetadataSet(role, tier, name, price);
        if (isActive) {
            emit TierActiveStatusChanged(role, tier, true);
        }
    }
    
    function batchSetTierMetadata(
        bytes32[] calldata roles,
        MembershipTier[] calldata tiers,
        string[] calldata names,
        string[] calldata descriptions,
        uint256[] calldata prices,
        TierLimits[] calldata limits,
        bool[] calldata isActives
    ) external onlyOwner {
        uint256 len = roles.length;
        require(
            tiers.length == len &&
            names.length == len &&
            descriptions.length == len &&
            prices.length == len &&
            limits.length == len &&
            isActives.length == len,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < len; i++) {
            tierMetadata[roles[i]][tiers[i]] = TierMetadata({
                name: names[i],
                description: descriptions[i],
                price: prices[i],
                limits: limits[i],
                isActive: isActives[i]
            });
            emit TierMetadataSet(roles[i], tiers[i], names[i], prices[i]);
        }
    }
    
    function updateTierPrice(
        bytes32 role,
        MembershipTier tier,
        uint256 newPrice
    ) external onlyOwner {
        tierMetadata[role][tier].price = newPrice;
        emit TierPriceUpdated(role, tier, newPrice);
    }
    
    function updateTierLimits(
        bytes32 role,
        MembershipTier tier,
        TierLimits calldata newLimits
    ) external onlyOwner {
        tierMetadata[role][tier].limits = newLimits;
        emit TierLimitsUpdated(role, tier);
    }
    
    function setTierActive(
        bytes32 role,
        MembershipTier tier,
        bool active
    ) external onlyOwner {
        tierMetadata[role][tier].isActive = active;
        emit TierActiveStatusChanged(role, tier, active);
    }
    
    // ========== User Tier Management ==========
    
    modifier onlyAuthorized() {
        require(
            msg.sender == owner() ||
            msg.sender == roleManagerCore ||
            authorizedExtensions[msg.sender],
            "Not authorized"
        );
        _;
    }
    
    function setUserTier(
        address user,
        bytes32 role,
        MembershipTier tier
    ) external onlyAuthorized {
        userTiers[user][role] = tier;
        tierPurchases[user][role][tier] = block.timestamp;
        emit UserTierSet(user, role, tier);
    }
    
    // ========== View Functions ==========
    
    function getUserTier(address user, bytes32 role) external view returns (MembershipTier) {
        return userTiers[user][role];
    }
    
    function getTierLimits(bytes32 role, MembershipTier tier) external view returns (TierLimits memory) {
        return tierMetadata[role][tier].limits;
    }
    
    function getTierPrice(bytes32 role, MembershipTier tier) external view returns (uint256) {
        return tierMetadata[role][tier].price;
    }
    
    function isTierActive(bytes32 role, MembershipTier tier) external view returns (bool) {
        return tierMetadata[role][tier].isActive;
    }
    
    function getTierMetadata(
        bytes32 role,
        MembershipTier tier
    ) external view returns (
        string memory name,
        string memory description,
        uint256 price,
        bool isActive
    ) {
        TierMetadata storage meta = tierMetadata[role][tier];
        return (meta.name, meta.description, meta.price, meta.isActive);
    }
    
    function getUserTierPurchaseTime(
        address user,
        bytes32 role,
        MembershipTier tier
    ) external view returns (uint256) {
        return tierPurchases[user][role][tier];
    }
}
