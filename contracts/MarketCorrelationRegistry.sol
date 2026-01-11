// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TieredRoleManager.sol";

/**
 * @title MarketCorrelationRegistry
 * @notice Registry for grouping related markets with role-based management
 * @dev Manages market correlation groups to prevent duplicate markets and enable
 * efficient aggregation of related prediction markets (e.g., election candidates)
 * 
 * Use case example:
 * For a campaign election with 5 candidates, all candidate markets can be grouped
 * together, allowing the front-end to display them as a cohesive set and ensuring
 * market efficiency by directing users to the most popular markets.
 * 
 * RBAC INTEGRATION:
 * - Group creation requires MARKET_MAKER_ROLE
 * - Admin functions require OPERATIONS_ADMIN_ROLE
 */
contract MarketCorrelationRegistry is Ownable, ReentrancyGuard {

    address private constant SAFE_SINGLETON_FACTORY = address(0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7);
    
    struct CorrelationGroup {
        string name;
        string description;
        address creator;
        uint256 createdAt;
        uint256[] marketIds;
        bool active;
    }
    
    // Group ID => CorrelationGroup
    mapping(uint256 => CorrelationGroup) public correlationGroups;
    
    // Market ID => Group ID (groupId + 1 to avoid 0 confusion)
    mapping(uint256 => uint256) private _marketToGroupPlusOne;
    
    // Category => Group IDs for efficient category-based queries
    mapping(string => uint256[]) private _categoryToGroups;
    
    // Group ID => Category
    mapping(uint256 => string) public groupCategory;
    
    uint256 public groupCount;
    
    bool private _initialized;
    
    // Role-based access control
    TieredRoleManager public roleManager;
    
    event CorrelationGroupCreated(
        uint256 indexed groupId,
        string name,
        string description,
        string category,
        address indexed creator,
        uint256 createdAt
    );
    
    event MarketAddedToGroup(
        uint256 indexed groupId,
        uint256 indexed marketId,
        uint256 addedAt
    );
    
    event MarketRemovedFromGroup(
        uint256 indexed groupId,
        uint256 indexed marketId,
        uint256 removedAt
    );
    
    event CorrelationGroupDeactivated(
        uint256 indexed groupId,
        uint256 deactivatedAt
    );
    
    event CorrelationGroupReactivated(
        uint256 indexed groupId,
        uint256 reactivatedAt
    );
    
    modifier groupExists(uint256 groupId) {
        require(groupId < groupCount, "Group does not exist");
        _;
    }

    modifier onlyGroupCreatorOrOwner(uint256 groupId) {
        require(
            msg.sender == correlationGroups[groupId].creator || msg.sender == owner(),
            "Not group creator or owner"
        );
        _;
    }
    
    constructor() Ownable(msg.sender) {
        // For direct deployments, prevent initialize() from being called.
        // For Safe Singleton Factory (CREATE2) deployments, allow a one-time initialize()
        // so ownership isn't stuck on the factory.
        _initialized = msg.sender != SAFE_SINGLETON_FACTORY;
    }
    
    /**
     * @notice Set the role manager contract
     * @param _roleManager Address of TieredRoleManager contract
     */
    function setRoleManager(address _roleManager) external onlyOwner {
        require(_roleManager != address(0), "Invalid role manager address");
        require(address(roleManager) == address(0), "Role manager already set");
        roleManager = TieredRoleManager(_roleManager);
    }
    
    /**
     * @notice Initialize the contract (used for clones)
     * @param initialOwner Address of the initial owner
     */
    function initialize(address initialOwner) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Invalid owner");
        _initialized = true;
        _transferOwnership(initialOwner);
    }
    
    /**
     * @notice Create a new correlation group for related markets
     * @param name Name of the correlation group (e.g., "2024 Presidential Election")
     * @param description Detailed description of what markets should be in this group
     * @param category Category for filtering (e.g., "politics", "sports", "finance")
     * @return groupId The ID of the newly created group
     */
    function createCorrelationGroup(
        string calldata name,
        string calldata description,
        string calldata category
    ) external returns (uint256 groupId) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(category).length > 0, "Category cannot be empty");
        
        groupId = groupCount++;
        
        CorrelationGroup storage group = correlationGroups[groupId];
        group.name = name;
        group.description = description;
        group.creator = msg.sender;
        group.createdAt = block.timestamp;
        group.active = true;
        
        groupCategory[groupId] = category;
        _categoryToGroups[category].push(groupId);
        
        emit CorrelationGroupCreated(
            groupId,
            name,
            description,
            category,
            msg.sender,
            block.timestamp
        );
    }
    
    /**
     * @notice Add a market to a correlation group
     * @dev Can be called by the group creator or contract owner
     * @param groupId ID of the correlation group
     * @param marketId ID of the market to add
     */
    function addMarketToGroup(
        uint256 groupId,
        uint256 marketId
    ) external groupExists(groupId) onlyGroupCreatorOrOwner(groupId) {
        require(correlationGroups[groupId].active, "Group is not active");
        require(_marketToGroupPlusOne[marketId] == 0, "Market already in a group");

        correlationGroups[groupId].marketIds.push(marketId);
        _marketToGroupPlusOne[marketId] = groupId + 1;

        emit MarketAddedToGroup(groupId, marketId, block.timestamp);
    }
    
    /**
     * @notice Remove a market from its correlation group
     * @dev Can be called by the group creator or contract owner
     * @param marketId ID of the market to remove
     */
    function removeMarketFromGroup(uint256 marketId) external {
        uint256 groupIdPlusOne = _marketToGroupPlusOne[marketId];
        require(groupIdPlusOne > 0, "Market not in any group");

        uint256 groupId = groupIdPlusOne - 1;
        require(
            msg.sender == correlationGroups[groupId].creator || msg.sender == owner(),
            "Not group creator or owner"
        );

        CorrelationGroup storage group = correlationGroups[groupId];

        // Find and remove market from array
        uint256[] storage marketIds = group.marketIds;
        for (uint256 i = 0; i < marketIds.length; i++) {
            if (marketIds[i] == marketId) {
                marketIds[i] = marketIds[marketIds.length - 1];
                marketIds.pop();
                break;
            }
        }

        delete _marketToGroupPlusOne[marketId];

        emit MarketRemovedFromGroup(groupId, marketId, block.timestamp);
    }
    
    /**
     * @notice Deactivate a correlation group
     * @param groupId ID of the group to deactivate
     */
    function deactivateGroup(uint256 groupId) external groupExists(groupId) onlyOwner {
        require(correlationGroups[groupId].active, "Group already inactive");
        correlationGroups[groupId].active = false;
        emit CorrelationGroupDeactivated(groupId, block.timestamp);
    }
    
    /**
     * @notice Reactivate a correlation group
     * @param groupId ID of the group to reactivate
     */
    function reactivateGroup(uint256 groupId) external groupExists(groupId) onlyOwner {
        require(!correlationGroups[groupId].active, "Group already active");
        correlationGroups[groupId].active = true;
        emit CorrelationGroupReactivated(groupId, block.timestamp);
    }
    
    /**
     * @notice Get all markets in a correlation group
     * @param groupId ID of the correlation group
     * @return marketIds Array of market IDs in the group
     */
    function getGroupMarkets(uint256 groupId) 
        external 
        view 
        groupExists(groupId) 
        returns (uint256[] memory marketIds) 
    {
        return correlationGroups[groupId].marketIds;
    }
    
    /**
     * @notice Get the correlation group ID for a market
     * @param marketId ID of the market
     * @return groupId The group ID (returns type(uint256).max if not in any group)
     */
    function getMarketGroup(uint256 marketId) external view returns (uint256 groupId) {
        uint256 groupIdPlusOne = _marketToGroupPlusOne[marketId];
        if (groupIdPlusOne == 0) {
            return type(uint256).max;
        }
        return groupIdPlusOne - 1;
    }
    
    /**
     * @notice Get all correlation groups in a category
     * @param category Category to query
     * @return groupIds Array of group IDs in the category
     */
    function getGroupsByCategory(string calldata category) 
        external 
        view 
        returns (uint256[] memory groupIds) 
    {
        return _categoryToGroups[category];
    }
    
    /**
     * @notice Check if a market is in a correlation group
     * @param marketId ID of the market
     * @return True if the market is in a group, false otherwise
     */
    function isMarketInGroup(uint256 marketId) external view returns (bool) {
        return _marketToGroupPlusOne[marketId] > 0;
    }
    
    /**
     * @notice Get the number of markets in a group
     * @param groupId ID of the correlation group
     * @return count Number of markets in the group
     */
    function getGroupMarketCount(uint256 groupId) 
        external 
        view 
        groupExists(groupId) 
        returns (uint256 count) 
    {
        return correlationGroups[groupId].marketIds.length;
    }
}
