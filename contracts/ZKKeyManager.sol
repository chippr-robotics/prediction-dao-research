// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ZKKeyManager
 * @notice Production-ready ZK key lifecycle management for ClearPath system
 * @dev Manages registration, rotation, and revocation of zero-knowledge public keys
 * 
 * Key Lifecycle:
 * 1. Registration - User registers initial ZK public key
 * 2. Active - Key is valid and can be used for ZK proofs
 * 3. Rotation - User can rotate to a new key, invalidating old key
 * 4. Revocation - Admin or user can revoke a key
 * 5. Expired - Keys automatically expire after configured duration
 */
contract ZKKeyManager is AccessControl, Pausable {
    
    // ========== Role Definitions ==========
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CLEARPATH_USER_ROLE = keccak256("CLEARPATH_USER_ROLE");
    
    // ========== Key Status ==========
    
    enum KeyStatus {
        NONE,           // Key doesn't exist
        ACTIVE,         // Key is valid
        ROTATED,        // Key has been rotated (replaced)
        REVOKED,        // Key has been revoked
        EXPIRED         // Key has expired
    }
    
    // ========== Key Metadata ==========
    
    struct ZKKey {
        bytes32 keyHash;        // Hash of the public key for efficient storage
        string publicKey;       // Full public key string
        uint256 registeredAt;   // Timestamp of registration
        uint256 expiresAt;      // Expiration timestamp
        KeyStatus status;       // Current status
        uint256 rotationCount;  // Number of times user has rotated
        bytes32 previousKeyHash; // Hash of previous key (for rotation history)
    }
    
    // ========== Storage ==========
    
    // User address => current key hash
    mapping(address => bytes32) public currentKeyHash;
    
    // Key hash => ZKKey metadata
    mapping(bytes32 => ZKKey) public keys;
    
    // User address => all key hashes (history)
    mapping(address => bytes32[]) public userKeyHistory;
    
    // Configuration
    uint256 public keyExpirationDuration;  // Default: 365 days
    uint256 public maxRotationsPerYear;     // Rate limiting
    bool public requireKeyExpiration;       // Toggle expiration requirement
    
    // Rate limiting tracking
    mapping(address => uint256) public rotationsThisYear;
    mapping(address => uint256) public yearStartTime;
    
    // ========== Events ==========
    
    event KeyRegistered(
        address indexed user,
        bytes32 indexed keyHash,
        uint256 expiresAt,
        uint256 timestamp
    );
    
    event KeyRotated(
        address indexed user,
        bytes32 indexed oldKeyHash,
        bytes32 indexed newKeyHash,
        uint256 timestamp
    );
    
    event KeyRevoked(
        address indexed user,
        bytes32 indexed keyHash,
        address indexed revoker,
        uint256 timestamp
    );
    
    event KeyExpired(
        address indexed user,
        bytes32 indexed keyHash,
        uint256 timestamp
    );
    
    event ConfigurationUpdated(
        uint256 keyExpirationDuration,
        uint256 maxRotationsPerYear,
        bool requireKeyExpiration
    );
    
    // ========== Errors ==========
    
    error KeyAlreadyExists(address user);
    error NoKeyRegistered(address user);
    error InvalidKeyFormat(string reason);
    error KeyNotActive(bytes32 keyHash, KeyStatus status);
    error RateLimitExceeded(address user, uint256 rotationsThisYear);
    error UnauthorizedRevocation(address caller, address keyOwner);
    error KeyExpiredError(bytes32 keyHash);
    
    // ========== Constructor ==========
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        
        // Default configuration
        keyExpirationDuration = 365 days;
        maxRotationsPerYear = 4;  // Once per quarter
        requireKeyExpiration = true;
    }
    
    // ========== Key Registration ==========
    
    /**
     * @notice Register a new ZK public key
     * @param publicKey The zero-knowledge public key (base64 or hex encoded)
     * @dev Validates key format and creates new key entry
     */
    function registerKey(string memory publicKey) external whenNotPaused {
        // Check user doesn't already have an active key
        bytes32 existingKeyHash = currentKeyHash[msg.sender];
        if (existingKeyHash != bytes32(0)) {
            ZKKey storage existingKey = keys[existingKeyHash];
            if (existingKey.status == KeyStatus.ACTIVE && !_isExpired(existingKey)) {
                revert KeyAlreadyExists(msg.sender);
            }
        }
        
        // Validate key format
        _validateKeyFormat(publicKey);
        
        // Create key hash
        bytes32 keyHash = keccak256(abi.encodePacked(msg.sender, publicKey, block.timestamp));
        
        // Calculate expiration
        uint256 expiresAt = requireKeyExpiration 
            ? block.timestamp + keyExpirationDuration 
            : type(uint256).max;
        
        // Store key metadata
        keys[keyHash] = ZKKey({
            keyHash: keyHash,
            publicKey: publicKey,
            registeredAt: block.timestamp,
            expiresAt: expiresAt,
            status: KeyStatus.ACTIVE,
            rotationCount: 0,
            previousKeyHash: bytes32(0)
        });
        
        // Update current key
        currentKeyHash[msg.sender] = keyHash;
        
        // Add to history
        userKeyHistory[msg.sender].push(keyHash);
        
        // Initialize rate limiting
        if (yearStartTime[msg.sender] == 0) {
            yearStartTime[msg.sender] = block.timestamp;
        }
        
        emit KeyRegistered(msg.sender, keyHash, expiresAt, block.timestamp);
    }
    
    // ========== Key Rotation ==========
    
    /**
     * @notice Rotate to a new ZK public key
     * @param newPublicKey The new zero-knowledge public key
     * @dev Marks old key as ROTATED and registers new key
     */
    function rotateKey(string memory newPublicKey) external whenNotPaused {
        bytes32 oldKeyHash = currentKeyHash[msg.sender];
        if (oldKeyHash == bytes32(0)) {
            revert NoKeyRegistered(msg.sender);
        }
        
        ZKKey storage oldKey = keys[oldKeyHash];
        if (oldKey.status != KeyStatus.ACTIVE) {
            revert KeyNotActive(oldKeyHash, oldKey.status);
        }
        
        // Check rate limiting
        _checkRotationRateLimit(msg.sender);
        
        // Validate new key format
        _validateKeyFormat(newPublicKey);
        
        // Create new key hash
        bytes32 newKeyHash = keccak256(abi.encodePacked(msg.sender, newPublicKey, block.timestamp));
        
        // Calculate expiration
        uint256 expiresAt = requireKeyExpiration 
            ? block.timestamp + keyExpirationDuration 
            : type(uint256).max;
        
        // Mark old key as rotated
        oldKey.status = KeyStatus.ROTATED;
        
        // Create new key
        keys[newKeyHash] = ZKKey({
            keyHash: newKeyHash,
            publicKey: newPublicKey,
            registeredAt: block.timestamp,
            expiresAt: expiresAt,
            status: KeyStatus.ACTIVE,
            rotationCount: oldKey.rotationCount + 1,
            previousKeyHash: oldKeyHash
        });
        
        // Update current key
        currentKeyHash[msg.sender] = newKeyHash;
        
        // Add to history
        userKeyHistory[msg.sender].push(newKeyHash);
        
        // Update rate limiting
        rotationsThisYear[msg.sender]++;
        
        emit KeyRotated(msg.sender, oldKeyHash, newKeyHash, block.timestamp);
    }
    
    // ========== Key Revocation ==========
    
    /**
     * @notice Revoke a ZK public key
     * @param user Address of the key owner
     * @dev Can be called by key owner or admin
     */
    function revokeKey(address user) external whenNotPaused {
        // Check authorization
        if (msg.sender != user && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedRevocation(msg.sender, user);
        }
        
        bytes32 keyHash = currentKeyHash[user];
        if (keyHash == bytes32(0)) {
            revert NoKeyRegistered(user);
        }
        
        ZKKey storage key = keys[keyHash];
        if (key.status != KeyStatus.ACTIVE) {
            revert KeyNotActive(keyHash, key.status);
        }
        
        // Mark as revoked
        key.status = KeyStatus.REVOKED;
        
        emit KeyRevoked(user, keyHash, msg.sender, block.timestamp);
    }
    
    // ========== Key Validation ==========
    
    /**
     * @notice Validate that a user has an active ZK key
     * @param user Address to check
     * @return bool True if user has valid active key
     */
    function hasValidKey(address user) external view returns (bool) {
        bytes32 keyHash = currentKeyHash[user];
        if (keyHash == bytes32(0)) {
            return false;
        }
        
        ZKKey storage key = keys[keyHash];
        return key.status == KeyStatus.ACTIVE && !_isExpired(key);
    }
    
    /**
     * @notice Get user's current public key
     * @param user Address to query
     * @return publicKey The current public key string
     */
    function getPublicKey(address user) external view returns (string memory) {
        bytes32 keyHash = currentKeyHash[user];
        if (keyHash == bytes32(0)) {
            return "";
        }
        
        return keys[keyHash].publicKey;
    }
    
    /**
     * @notice Get detailed key metadata
     * @param user Address to query
     * @return key The ZKKey struct
     */
    function getKeyMetadata(address user) external view returns (ZKKey memory) {
        bytes32 keyHash = currentKeyHash[user];
        require(keyHash != bytes32(0), "No key registered");
        
        return keys[keyHash];
    }
    
    /**
     * @notice Get user's key rotation history
     * @param user Address to query
     * @return Array of key hashes in chronological order
     */
    function getKeyHistory(address user) external view returns (bytes32[] memory) {
        return userKeyHistory[user];
    }
    
    /**
     * @notice Check if a specific key is valid and active
     * @param keyHash Hash of the key to check
     * @return bool True if key is active and not expired
     */
    function isKeyValid(bytes32 keyHash) external view returns (bool) {
        ZKKey storage key = keys[keyHash];
        return key.status == KeyStatus.ACTIVE && !_isExpired(key);
    }
    
    // ========== Internal Functions ==========
    
    /**
     * @dev Validate key format and length
     */
    function _validateKeyFormat(string memory publicKey) internal pure {
        bytes memory keyBytes = bytes(publicKey);
        
        // Minimum length check (typical ZK keys are 64+ characters)
        if (keyBytes.length < 32) {
            revert InvalidKeyFormat("Key too short");
        }
        
        // Maximum length check (prevent DoS)
        if (keyBytes.length > 512) {
            revert InvalidKeyFormat("Key too long");
        }
        
        // Check for empty or only whitespace
        if (keyBytes.length == 0) {
            revert InvalidKeyFormat("Key is empty");
        }
    }
    
    /**
     * @dev Check if key has expired
     */
    function _isExpired(ZKKey storage key) internal view returns (bool) {
        if (!requireKeyExpiration) {
            return false;
        }
        return block.timestamp >= key.expiresAt;
    }
    
    /**
     * @dev Check rotation rate limit
     */
    function _checkRotationRateLimit(address user) internal {
        // Reset counter if year has passed
        if (block.timestamp >= yearStartTime[user] + 365 days) {
            yearStartTime[user] = block.timestamp;
            rotationsThisYear[user] = 0;
        }
        
        // Check limit
        if (rotationsThisYear[user] >= maxRotationsPerYear) {
            revert RateLimitExceeded(user, rotationsThisYear[user]);
        }
    }
    
    // ========== Admin Functions ==========
    
    /**
     * @notice Update configuration parameters
     * @param _keyExpirationDuration New expiration duration in seconds
     * @param _maxRotationsPerYear New max rotations per year
     * @param _requireKeyExpiration Whether to enforce expiration
     */
    function updateConfiguration(
        uint256 _keyExpirationDuration,
        uint256 _maxRotationsPerYear,
        bool _requireKeyExpiration
    ) external onlyRole(ADMIN_ROLE) {
        require(_keyExpirationDuration >= 30 days, "Expiration too short");
        require(_keyExpirationDuration <= 730 days, "Expiration too long");
        require(_maxRotationsPerYear > 0, "Must allow rotations");
        require(_maxRotationsPerYear <= 52, "Too many rotations");
        
        keyExpirationDuration = _keyExpirationDuration;
        maxRotationsPerYear = _maxRotationsPerYear;
        requireKeyExpiration = _requireKeyExpiration;
        
        emit ConfigurationUpdated(_keyExpirationDuration, _maxRotationsPerYear, _requireKeyExpiration);
    }
    
    /**
     * @notice Emergency pause
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Manually expire a key (admin only)
     * @param user Address of key owner
     */
    function expireKey(address user) external onlyRole(ADMIN_ROLE) {
        bytes32 keyHash = currentKeyHash[user];
        require(keyHash != bytes32(0), "No key registered");
        
        ZKKey storage key = keys[keyHash];
        require(key.status == KeyStatus.ACTIVE, "Key not active");
        
        key.status = KeyStatus.EXPIRED;
        
        emit KeyExpired(user, keyHash, block.timestamp);
    }
}
