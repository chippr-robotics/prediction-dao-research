// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MetadataRegistry
 * @notice Central registry for storing IPFS CIDs for various platform resources
 * @dev Maps resource identifiers to IPFS content identifiers (CIDs)
 * 
 * This contract serves as a bridge between on-chain data and off-chain IPFS metadata.
 * It allows smart contracts to emit minimal data on-chain while storing rich metadata
 * in IPFS, following the OpenSea metadata standard.
 * 
 * Supported Resource Types:
 * - "market" - Prediction market metadata
 * - "proposal" - Governance proposal metadata
 * - "token" - Token metadata (ERC20/ERC721)
 * - "dao" - DAO configuration and information
 * - "group" - Correlation group metadata
 * 
 * Usage Pattern:
 * 1. Create resource on-chain (e.g., market via ConditionalMarketFactory)
 * 2. Upload metadata JSON to IPFS
 * 3. Store IPFS CID in this registry
 * 4. Frontend fetches CID from registry and metadata from IPFS
 */
contract MetadataRegistry is Ownable {
    
    // ========== Data Structures ==========
    
    /**
     * @notice Metadata entry for a resource
     * @param cid IPFS content identifier (v0 or v1)
     * @param updatedAt Timestamp of last update
     * @param updatedBy Address that last updated the metadata
     * @param version Metadata schema version
     */
    struct MetadataEntry {
        string cid;
        uint256 updatedAt;
        address updatedBy;
        uint256 version;
    }
    
    // ========== State Variables ==========
    
    /// @notice Mapping from resource key to metadata entry
    /// @dev Key format: "resourceType:resourceId" (e.g., "market:123")
    mapping(string => MetadataEntry) public metadata;
    
    /// @notice Authorized addresses that can update metadata
    mapping(address => bool) public authorizedUpdaters;
    
    /// @notice Tracks if a resource key has been registered
    mapping(string => bool) public isRegistered;
    
    /// @notice List of all registered resource keys
    string[] public resourceKeys;
    
    /// @notice Current metadata schema version
    uint256 public currentSchemaVersion = 1;
    
    // ========== Events ==========
    
    /**
     * @notice Emitted when metadata is set for a resource
     * @param resourceType Type of resource (market, proposal, token, dao, group)
     * @param resourceId Unique identifier for the resource
     * @param cid IPFS content identifier
     * @param version Metadata schema version
     * @param updatedBy Address that updated the metadata
     */
    event MetadataSet(
        string indexed resourceType,
        string resourceId,
        string cid,
        uint256 version,
        address indexed updatedBy
    );
    
    /**
     * @notice Emitted when metadata is updated
     * @param resourceType Type of resource
     * @param resourceId Unique identifier for the resource
     * @param oldCid Previous IPFS CID
     * @param newCid New IPFS CID
     * @param version Metadata schema version
     */
    event MetadataUpdated(
        string indexed resourceType,
        string resourceId,
        string oldCid,
        string newCid,
        uint256 version
    );
    
    /**
     * @notice Emitted when an updater is authorized or deauthorized
     * @param updater Address of the updater
     * @param authorized Whether the updater is authorized
     */
    event UpdaterAuthorizationChanged(
        address indexed updater,
        bool authorized
    );
    
    /**
     * @notice Emitted when schema version is updated
     * @param oldVersion Previous schema version
     * @param newVersion New schema version
     */
    event SchemaVersionUpdated(
        uint256 oldVersion,
        uint256 newVersion
    );
    
    // ========== Constructor ==========
    
    constructor() Ownable(msg.sender) {
        // Owner is automatically an authorized updater
        authorizedUpdaters[msg.sender] = true;
    }
    
    // ========== Modifiers ==========
    
    /**
     * @notice Restricts function to authorized updaters
     */
    modifier onlyAuthorized() {
        require(
            authorizedUpdaters[msg.sender] || msg.sender == owner(),
            "Not authorized to update metadata"
        );
        _;
    }
    
    // ========== Public Functions ==========
    
    /**
     * @notice Set metadata for a resource
     * @param resourceType Type of resource (market, proposal, token, dao, group)
     * @param resourceId Unique identifier (can be numeric or string)
     * @param ipfsCid IPFS content identifier
     * @dev Only authorized updaters can call this
     */
    function setMetadata(
        string calldata resourceType,
        string calldata resourceId,
        string calldata ipfsCid
    ) external onlyAuthorized {
        string memory key = _buildKey(resourceType, resourceId);
        
        bool isUpdate = isRegistered[key];
        string memory oldCid = metadata[key].cid;
        
        metadata[key] = MetadataEntry({
            cid: ipfsCid,
            updatedAt: block.timestamp,
            updatedBy: msg.sender,
            version: currentSchemaVersion
        });
        
        if (!isUpdate) {
            isRegistered[key] = true;
            resourceKeys.push(key);
            emit MetadataSet(resourceType, resourceId, ipfsCid, currentSchemaVersion, msg.sender);
        } else {
            emit MetadataUpdated(resourceType, resourceId, oldCid, ipfsCid, currentSchemaVersion);
        }
    }
    
    /**
     * @notice Set metadata using numeric resource ID
     * @param resourceType Type of resource
     * @param resourceId Numeric identifier
     * @param ipfsCid IPFS content identifier
     */
    function setMetadataById(
        string calldata resourceType,
        uint256 resourceId,
        string calldata ipfsCid
    ) external onlyAuthorized {
        string memory key = _buildKey(resourceType, _uint2str(resourceId));
        
        bool isUpdate = isRegistered[key];
        string memory oldCid = metadata[key].cid;
        
        metadata[key] = MetadataEntry({
            cid: ipfsCid,
            updatedAt: block.timestamp,
            updatedBy: msg.sender,
            version: currentSchemaVersion
        });
        
        if (!isUpdate) {
            isRegistered[key] = true;
            resourceKeys.push(key);
            emit MetadataSet(resourceType, _uint2str(resourceId), ipfsCid, currentSchemaVersion, msg.sender);
        } else {
            emit MetadataUpdated(resourceType, _uint2str(resourceId), oldCid, ipfsCid, currentSchemaVersion);
        }
    }
    
    /**
     * @notice Get metadata CID for a resource
     * @param resourceType Type of resource
     * @param resourceId Unique identifier
     * @return IPFS content identifier
     */
    function getMetadata(
        string calldata resourceType,
        string calldata resourceId
    ) external view returns (string memory) {
        string memory key = _buildKey(resourceType, resourceId);
        require(isRegistered[key], "Metadata not found");
        return metadata[key].cid;
    }
    
    /**
     * @notice Get metadata CID using numeric resource ID
     * @param resourceType Type of resource
     * @param resourceId Numeric identifier
     * @return IPFS content identifier
     */
    function getMetadataById(
        string calldata resourceType,
        uint256 resourceId
    ) external view returns (string memory) {
        string memory key = _buildKey(resourceType, _uint2str(resourceId));
        require(isRegistered[key], "Metadata not found");
        return metadata[key].cid;
    }
    
    /**
     * @notice Get full metadata entry with timestamp and updater info
     * @param resourceType Type of resource
     * @param resourceId Unique identifier
     * @return entry Complete metadata entry
     */
    function getMetadataEntry(
        string calldata resourceType,
        string calldata resourceId
    ) external view returns (MetadataEntry memory) {
        string memory key = _buildKey(resourceType, resourceId);
        require(isRegistered[key], "Metadata not found");
        return metadata[key];
    }
    
    /**
     * @notice Check if metadata exists for a resource
     * @param resourceType Type of resource
     * @param resourceId Unique identifier
     * @return exists True if metadata is registered
     */
    function hasMetadata(
        string calldata resourceType,
        string calldata resourceId
    ) external view returns (bool) {
        string memory key = _buildKey(resourceType, resourceId);
        return isRegistered[key];
    }
    
    /**
     * @notice Get total number of registered resources
     * @return count Number of resources with metadata
     */
    function getResourceCount() external view returns (uint256) {
        return resourceKeys.length;
    }
    
    /**
     * @notice Get resource key at specific index
     * @param index Index in the resource keys array
     * @return key Resource key at the index
     */
    function getResourceKeyAt(uint256 index) external view returns (string memory) {
        require(index < resourceKeys.length, "Index out of bounds");
        return resourceKeys[index];
    }
    
    /**
     * @notice Batch get metadata CIDs
     * @param resourceType Type of resource
     * @param resourceIds Array of resource identifiers
     * @return cids Array of IPFS CIDs
     */
    function batchGetMetadata(
        string calldata resourceType,
        string[] calldata resourceIds
    ) external view returns (string[] memory) {
        string[] memory cids = new string[](resourceIds.length);
        
        for (uint256 i = 0; i < resourceIds.length; i++) {
            string memory key = _buildKey(resourceType, resourceIds[i]);
            if (isRegistered[key]) {
                cids[i] = metadata[key].cid;
            } else {
                cids[i] = "";
            }
        }
        
        return cids;
    }
    
    /**
     * @notice Batch get metadata CIDs using numeric IDs
     * @param resourceType Type of resource
     * @param resourceIds Array of numeric identifiers
     * @return cids Array of IPFS CIDs
     */
    function batchGetMetadataById(
        string calldata resourceType,
        uint256[] calldata resourceIds
    ) external view returns (string[] memory) {
        string[] memory cids = new string[](resourceIds.length);
        
        for (uint256 i = 0; i < resourceIds.length; i++) {
            string memory key = _buildKey(resourceType, _uint2str(resourceIds[i]));
            if (isRegistered[key]) {
                cids[i] = metadata[key].cid;
            } else {
                cids[i] = "";
            }
        }
        
        return cids;
    }
    
    // ========== Admin Functions ==========
    
    /**
     * @notice Authorize or deauthorize an updater
     * @param updater Address to authorize/deauthorize
     * @param authorized Whether to authorize or deauthorize
     */
    function setAuthorizedUpdater(
        address updater,
        bool authorized
    ) external onlyOwner {
        require(updater != address(0), "Invalid updater address");
        authorizedUpdaters[updater] = authorized;
        emit UpdaterAuthorizationChanged(updater, authorized);
    }
    
    /**
     * @notice Batch authorize multiple updaters
     * @param updaters Array of addresses to authorize
     * @param authorized Whether to authorize or deauthorize
     */
    function batchSetAuthorizedUpdaters(
        address[] calldata updaters,
        bool authorized
    ) external onlyOwner {
        for (uint256 i = 0; i < updaters.length; i++) {
            require(updaters[i] != address(0), "Invalid updater address");
            authorizedUpdaters[updaters[i]] = authorized;
            emit UpdaterAuthorizationChanged(updaters[i], authorized);
        }
    }
    
    /**
     * @notice Update the schema version
     * @param newVersion New schema version number
     */
    function updateSchemaVersion(uint256 newVersion) external onlyOwner {
        require(newVersion > currentSchemaVersion, "Version must increase");
        uint256 oldVersion = currentSchemaVersion;
        currentSchemaVersion = newVersion;
        emit SchemaVersionUpdated(oldVersion, newVersion);
    }
    
    // ========== Internal Functions ==========
    
    /**
     * @notice Build a resource key from type and ID
     * @param resourceType Type of resource
     * @param resourceId Resource identifier
     * @return key Combined key string
     */
    function _buildKey(
        string memory resourceType,
        string memory resourceId
    ) internal pure returns (string memory) {
        return string.concat(resourceType, ":", resourceId);
    }
    
    /**
     * @notice Convert uint to string
     * @param value Number to convert
     * @return str String representation
     */
    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        
        uint256 temp = value;
        uint256 digits;
        
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        
        bytes memory buffer = new bytes(digits);
        
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        
        return string(buffer);
    }
}
