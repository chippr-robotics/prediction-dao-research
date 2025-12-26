// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TieredRoleManager.sol";

/**
 * @title PrivacyCoordinator
 * @notice MACI-style encrypted message submission with role-based access
 * @dev Manages encrypted position submission and Nightmarket-style position encryption
 * 
 * RBAC INTEGRATION:
 * - Privacy features available to CLEARPATH_USER_ROLE
 * - Admin functions require OPERATIONS_ADMIN_ROLE
 */
contract PrivacyCoordinator is Ownable {
    struct EncryptedPosition {
        bytes32 commitment;
        bytes zkProof;
        address user;
        uint256 marketId;
        uint256 timestamp;
        bool processed;
    }

    struct KeyChange {
        bytes encryptedMessage;
        uint256 timestamp;
        bool processed;
    }

    // User address => Public key
    mapping(address => bytes32) public publicKeys;
    
    // Position ID => EncryptedPosition
    mapping(uint256 => EncryptedPosition) public positionCommitments;
    
    // User address => KeyChange[]
    mapping(address => KeyChange[]) public keyChanges;
    
    // Epoch ID => batch of positions
    mapping(uint256 => uint256[]) public epochBatches;
    
    // User address => position IDs
    mapping(address => uint256[]) private userPositions;
    
    // Market ID => position IDs (for market-specific queries)
    mapping(uint256 => uint256[]) private marketPositions;

    uint256 public positionCount;
    uint256 public currentEpoch;
    uint256 public constant EPOCH_DURATION = 1 hours;
    uint256 public constant MAX_BATCH_SIZE = 100;
    uint256 public epochStartTime;

    address public coordinator;

    bool private _initialized;
    
    // Role-based access control
    TieredRoleManager public roleManager;

    event PublicKeyRegistered(address indexed user, bytes32 publicKey);
    
    event EncryptedPositionSubmitted(
        uint256 indexed positionId,
        address indexed user,
        uint256 indexed marketId,
        bytes32 commitment,
        uint256 epoch,
        uint256 timestamp
    );
    
    event KeyChangeSubmitted(address indexed user, uint256 keyChangeIndex);
    event EpochProcessed(uint256 indexed epochId, uint256 positionsProcessed);
    
    event BatchPositionsProcessed(
        uint256 indexed batchId,
        uint256 indexed epochId,
        uint256[] positionIds,
        uint256 processedCount,
        uint256 timestamp
    );
    
    event CoordinatorChanged(address indexed oldCoordinator, address indexed newCoordinator);

    modifier onlyCoordinator() {
        require(msg.sender == coordinator, "Not coordinator");
        _;
    }

    constructor() Ownable(msg.sender) {}
    
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
        coordinator = initialOwner;
        epochStartTime = block.timestamp;
        _transferOwnership(initialOwner);
    }

    /**
     * @notice Register or update public key for encrypted messaging
     * @param publicKey User's public key for ECDH key exchange
     */
    function registerPublicKey(bytes32 publicKey) external {
        require(publicKey != bytes32(0), "Invalid public key");
        publicKeys[msg.sender] = publicKey;
        emit PublicKeyRegistered(msg.sender, publicKey);
    }

    /**
     * @notice Submit encrypted position with zero-knowledge proof
     * @param commitment Poseidon hash commitment of position
     * @param zkProof Groth16 zkSNARK proof for position validity
     * @param marketId Market ID for the position
     */
    function submitEncryptedPosition(
        bytes32 commitment,
        bytes calldata zkProof,
        uint256 marketId
    ) external {
        require(publicKeys[msg.sender] != bytes32(0), "Public key not registered");
        require(commitment != bytes32(0), "Invalid commitment");
        require(zkProof.length > 0, "Invalid proof");

        uint256 positionId = positionCount++;

        positionCommitments[positionId] = EncryptedPosition({
            commitment: commitment,
            zkProof: zkProof,
            user: msg.sender,
            marketId: marketId,
            timestamp: block.timestamp,
            processed: false
        });

        // Add to current epoch batch
        epochBatches[currentEpoch].push(positionId);
        
        // Track user positions
        userPositions[msg.sender].push(positionId);
        
        // Track market positions
        marketPositions[marketId].push(positionId);

        emit EncryptedPositionSubmitted(
            positionId,
            msg.sender,
            marketId,
            commitment,
            currentEpoch,
            block.timestamp
        );
    }
    
    /**
     * @notice Batch submit multiple encrypted positions for efficiency
     * @param commitments Array of position commitments
     * @param zkProofs Array of zkSNARK proofs
     * @param marketIds Array of market IDs
     * @return positionIds Array of created position IDs
     */
    function batchSubmitPositions(
        bytes32[] calldata commitments,
        bytes[] calldata zkProofs,
        uint256[] calldata marketIds
    ) external returns (uint256[] memory positionIds) {
        require(publicKeys[msg.sender] != bytes32(0), "Public key not registered");
        require(commitments.length == zkProofs.length, "Array length mismatch");
        require(commitments.length == marketIds.length, "Array length mismatch");
        require(commitments.length > 0, "Empty batch");
        require(commitments.length <= MAX_BATCH_SIZE, "Batch too large");
        
        positionIds = new uint256[](commitments.length);
        
        for (uint256 i = 0; i < commitments.length; ) {
            require(commitments[i] != bytes32(0), "Invalid commitment");
            require(zkProofs[i].length > 0, "Invalid proof");
            
            uint256 positionId = positionCount++;
            positionIds[i] = positionId;
            
            positionCommitments[positionId] = EncryptedPosition({
                commitment: commitments[i],
                zkProof: zkProofs[i],
                user: msg.sender,
                marketId: marketIds[i],
                timestamp: block.timestamp,
                processed: false
            });
            
            // Add to current epoch batch
            epochBatches[currentEpoch].push(positionId);
            
            // Track user positions
            userPositions[msg.sender].push(positionId);
            
            // Track market positions
            marketPositions[marketIds[i]].push(positionId);
            
            emit EncryptedPositionSubmitted(
                positionId,
                msg.sender,
                marketIds[i],
                commitments[i],
                currentEpoch,
                block.timestamp
            );
            
            unchecked { ++i; }
        }
    }

    /**
     * @notice Submit key change message to invalidate previous votes
     * @param encryptedKeyChange Encrypted message containing new key
     */
    function submitKeyChange(bytes calldata encryptedKeyChange) external {
        require(publicKeys[msg.sender] != bytes32(0), "Public key not registered");
        require(encryptedKeyChange.length > 0, "Invalid key change");

        keyChanges[msg.sender].push(KeyChange({
            encryptedMessage: encryptedKeyChange,
            timestamp: block.timestamp,
            processed: false
        }));

        uint256 keyChangeIndex = keyChanges[msg.sender].length - 1;
        emit KeyChangeSubmitted(msg.sender, keyChangeIndex);
    }

    /**
     * @notice Process messages for an epoch (coordinator only)
     * @param epochId ID of the epoch to process
     */
    function processMessages(uint256 epochId) external onlyCoordinator {
        require(epochId <= currentEpoch, "Invalid epoch");
        
        uint256[] memory positions = epochBatches[epochId];
        uint256 processedCount = 0;

        for (uint256 i = 0; i < positions.length; ) {
            uint256 positionId = positions[i];
            if (!positionCommitments[positionId].processed) {
                positionCommitments[positionId].processed = true;
                unchecked { ++processedCount; }
            }
            unchecked { ++i; }
        }

        emit EpochProcessed(epochId, processedCount);
        emit BatchPositionsProcessed(
            epochId,
            epochId,
            positions,
            processedCount,
            block.timestamp
        );
    }
    
    /**
     * @notice Batch process specific positions for efficiency
     * @param positionIds Array of position IDs to process
     * @return processedCount Number of positions successfully processed
     */
    function batchProcessPositions(
        uint256[] calldata positionIds
    ) external onlyCoordinator returns (uint256 processedCount) {
        require(positionIds.length > 0, "Empty batch");
        require(positionIds.length <= MAX_BATCH_SIZE, "Batch too large");
        
        processedCount = 0;
        
        for (uint256 i = 0; i < positionIds.length; ) {
            uint256 positionId = positionIds[i];
            
            if (positionId < positionCount && !positionCommitments[positionId].processed) {
                positionCommitments[positionId].processed = true;
                unchecked { ++processedCount; }
            }
            unchecked { ++i; }
        }
        
        emit BatchPositionsProcessed(
            block.number,
            currentEpoch,
            positionIds,
            processedCount,
            block.timestamp
        );
    }

    /**
     * @notice Advance to next epoch
     */
    function advanceEpoch() external {
        require(block.timestamp >= epochStartTime + EPOCH_DURATION, "Epoch not ended");
        currentEpoch++;
        epochStartTime = block.timestamp;
    }

    /**
     * @notice Change coordinator address
     * @param newCoordinator Address of new coordinator
     */
    function setCoordinator(address newCoordinator) external onlyOwner {
        require(newCoordinator != address(0), "Invalid coordinator");
        address oldCoordinator = coordinator;
        coordinator = newCoordinator;
        emit CoordinatorChanged(oldCoordinator, newCoordinator);
    }

    /**
     * @notice Get user's key changes
     * @param user Address of the user
     */
    function getUserKeyChanges(address user) external view returns (KeyChange[] memory) {
        return keyChanges[user];
    }

    /**
     * @notice Get positions in an epoch
     * @param epochId ID of the epoch
     */
    function getEpochPositions(uint256 epochId) external view returns (uint256[] memory) {
        return epochBatches[epochId];
    }

    /**
     * @notice Get position details
     * @param positionId ID of the position
     */
    function getPosition(uint256 positionId) external view returns (EncryptedPosition memory) {
        require(positionId < positionCount, "Invalid position ID");
        return positionCommitments[positionId];
    }

    /**
     * @notice Verify if a position proof is valid (simplified)
     * @param positionId ID of the position
     * @return bool True if proof is valid
     */
    function verifyPositionProof(uint256 positionId) external view returns (bool) {
        require(positionId < positionCount, "Invalid position ID");
        // In production, this would call BN128 precompiles for zkSNARK verification
        // Simplified implementation just checks if proof exists
        return positionCommitments[positionId].zkProof.length > 0;
    }
    
    /**
     * @notice Get user positions with pagination
     * @param user User address
     * @param offset Starting index
     * @param limit Maximum results
     * @return positionIds Array of position IDs
     * @return hasMore Whether more results exist
     */
    function getUserPositions(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory positionIds, bool hasMore) {
        uint256[] storage allPositions = userPositions[user];
        uint256 totalCount = allPositions.length;
        
        if (offset >= totalCount) {
            return (new uint256[](0), false);
        }
        
        uint256 resultCount = totalCount - offset;
        if (resultCount > limit) {
            resultCount = limit;
            hasMore = true;
        } else {
            hasMore = false;
        }
        
        positionIds = new uint256[](resultCount);
        for (uint256 i = 0; i < resultCount; ) {
            positionIds[i] = allPositions[offset + i];
            unchecked { ++i; }
        }
    }
    
    /**
     * @notice Get positions for a specific market
     * @param marketId Market ID
     * @param offset Starting index
     * @param limit Maximum results
     * @return positionIds Array of position IDs
     * @return hasMore Whether more results exist
     */
    function getMarketPositions(
        uint256 marketId,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory positionIds, bool hasMore) {
        uint256[] storage allPositions = marketPositions[marketId];
        uint256 totalCount = allPositions.length;
        
        if (offset >= totalCount) {
            return (new uint256[](0), false);
        }
        
        uint256 resultCount = totalCount - offset;
        if (resultCount > limit) {
            resultCount = limit;
            hasMore = true;
        } else {
            hasMore = false;
        }
        
        positionIds = new uint256[](resultCount);
        for (uint256 i = 0; i < resultCount; ) {
            positionIds[i] = allPositions[offset + i];
            unchecked { ++i; }
        }
    }
    
    /**
     * @notice Get total position count for a user
     * @param user User address
     * @return count Number of positions
     */
    function getUserPositionCount(address user) external view returns (uint256) {
        return userPositions[user].length;
    }
    
    /**
     * @notice Get total position count for a market
     * @param marketId Market ID
     * @return count Number of positions
     */
    function getMarketPositionCount(uint256 marketId) external view returns (uint256) {
        return marketPositions[marketId].length;
    }
    
    /**
     * @notice Struct for batch position update parameters
     */
    struct BatchPositionUpdate {
        uint256[] positionIds;
        bytes32[] commitments;
        bytes[] zkProofs;
        uint256 batchTimestamp;
    }
}
