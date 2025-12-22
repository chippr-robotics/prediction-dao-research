// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PrivacyCoordinator
 * @notice MACI-style encrypted message submission with key-change capability
 * @dev Manages encrypted position submission and Nightmarket-style position encryption
 */
contract PrivacyCoordinator is Ownable {
    struct EncryptedPosition {
        bytes32 commitment;
        bytes zkProof;
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

    uint256 public positionCount;
    uint256 public currentEpoch;
    uint256 public constant EPOCH_DURATION = 1 hours;
    uint256 public epochStartTime;

    address public coordinator;

    bool private _initialized;

    event PublicKeyRegistered(address indexed user, bytes32 publicKey);
    event EncryptedPositionSubmitted(uint256 indexed positionId, address indexed user, bytes32 commitment);
    event KeyChangeSubmitted(address indexed user, uint256 keyChangeIndex);
    event EpochProcessed(uint256 indexed epochId, uint256 positionsProcessed);
    event CoordinatorChanged(address indexed oldCoordinator, address indexed newCoordinator);

    modifier onlyCoordinator() {
        require(msg.sender == coordinator, "Not coordinator");
        _;
    }

    constructor() Ownable(msg.sender) {}

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
     */
    function submitEncryptedPosition(
        bytes32 commitment,
        bytes calldata zkProof
    ) external {
        require(publicKeys[msg.sender] != bytes32(0), "Public key not registered");
        require(commitment != bytes32(0), "Invalid commitment");
        require(zkProof.length > 0, "Invalid proof");

        uint256 positionId = positionCount++;

        positionCommitments[positionId] = EncryptedPosition({
            commitment: commitment,
            zkProof: zkProof,
            timestamp: block.timestamp,
            processed: false
        });

        // Add to current epoch batch
        epochBatches[currentEpoch].push(positionId);

        emit EncryptedPositionSubmitted(positionId, msg.sender, commitment);
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

        for (uint256 i = 0; i < positions.length; i++) {
            uint256 positionId = positions[i];
            if (!positionCommitments[positionId].processed) {
                positionCommitments[positionId].processed = true;
                processedCount++;
            }
        }

        emit EpochProcessed(epochId, processedCount);
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
}
