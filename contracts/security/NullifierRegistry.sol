// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../libraries/RSAAccumulator.sol";
import "../libraries/PrimeMapping.sol";

/**
 * @title NullifierRegistry
 * @notice Manages nullified markets and addresses using an RSA accumulator
 * @dev Provides efficient set membership management for protecting the platform from malicious markets/actors.
 *
 *      Architecture:
 *      - On-chain: Stores nullification status, accumulator value, and provides verification
 *      - Off-chain: Accumulator updates and witness generation (for gas efficiency)
 *      - Frontend: Validates market/address status before display
 *
 *      RSA Accumulator Benefits:
 *      - O(1) storage regardless of set size (just the accumulator value)
 *      - Compact non-membership proofs (~256 bytes for 2048-bit RSA)
 *      - Privacy: Set contents not revealed, only membership status
 *      - Efficient batch operations for adding/removing elements
 *
 *      Security Model:
 *      - RSA modulus generated via trusted setup (two secret safe primes)
 *      - Admins can nullify markets/addresses but cannot forge membership proofs
 *      - Accumulator updates require admin role
 *      - On-chain verification available for critical operations
 *
 *      Integration:
 *      - Frontend queries nullification status before displaying markets
 *      - ConditionalMarketFactory can optionally check nullification
 *      - Admin panel provides UI for nullification management
 */
contract NullifierRegistry is AccessControl, ReentrancyGuard, Pausable {
    using RSAAccumulator for RSAAccumulator.AccumulatorParams;
    using PrimeMapping for bytes32;

    // ========== Constants ==========

    /// @notice Role that can manage nullifications
    bytes32 public constant NULLIFIER_ADMIN_ROLE = keccak256("NULLIFIER_ADMIN_ROLE");

    /// @notice Maximum number of nullifications in a single batch
    uint256 public constant MAX_BATCH_SIZE = 50;

    /// @notice RSA key size in bytes (2048 bits)
    uint256 public constant RSA_BYTES = 256;

    // ========== State Variables ==========

    /// @notice RSA accumulator parameters (immutable after initialization)
    RSAAccumulator.AccumulatorParams public accumulatorParams;

    /// @notice Current accumulator value A = g^(product of all nullified primes) mod n
    bytes public accumulator;

    /// @notice Whether RSA parameters have been initialized
    bool public paramsInitialized;

    /// @notice Nullified market hashes (marketHash => nullified)
    mapping(bytes32 => bool) public nullifiedMarkets;

    /// @notice Nullified addresses (address => nullified)
    mapping(address => bool) public nullifiedAddresses;

    /// @notice Market hash to nullification timestamp
    mapping(bytes32 => uint256) public marketNullifiedAt;

    /// @notice Address to nullification timestamp
    mapping(address => uint256) public addressNullifiedAt;

    /// @notice Market hash to nullifying admin
    mapping(bytes32 => address) public marketNullifiedBy;

    /// @notice Address to nullifying admin
    mapping(address => address) public addressNullifiedBy;

    /// @notice Count of nullified markets
    uint256 public nullifiedMarketCount;

    /// @notice Count of nullified addresses
    uint256 public nullifiedAddressCount;

    /// @notice Total nullification operations performed
    uint256 public totalNullifications;

    /// @notice Total reinstatement operations performed
    uint256 public totalReinstatements;

    /// @notice Last accumulator update timestamp
    uint256 public lastAccumulatorUpdate;

    /// @notice Array of all nullified market hashes (for enumeration)
    bytes32[] public nullifiedMarketList;

    /// @notice Array of all nullified addresses (for enumeration)
    address[] public nullifiedAddressList;

    /// @notice Index lookup for market hashes
    mapping(bytes32 => uint256) private marketListIndex;

    /// @notice Index lookup for addresses
    mapping(address => uint256) private addressListIndex;

    // ========== Events ==========

    event RSAParamsInitialized(uint256 timestamp);

    event MarketNullified(
        bytes32 indexed marketHash,
        uint256 indexed marketId,
        address indexed admin,
        uint256 timestamp,
        string reason
    );

    event MarketReinstated(
        bytes32 indexed marketHash,
        uint256 indexed marketId,
        address indexed admin,
        uint256 timestamp,
        string reason
    );

    event AddressNullified(
        address indexed nullifiedAddr,
        address indexed admin,
        uint256 timestamp,
        string reason
    );

    event AddressReinstated(
        address indexed reinstatedAddr,
        address indexed admin,
        uint256 timestamp,
        string reason
    );

    event AccumulatorUpdated(
        bytes newAccumulator,
        uint256 timestamp,
        address indexed updater
    );

    event BatchMarketsNullified(
        bytes32[] marketHashes,
        address indexed admin,
        uint256 timestamp
    );

    event BatchAddressesNullified(
        address[] addresses,
        address indexed admin,
        uint256 timestamp
    );

    // ========== Errors ==========

    error ParamsAlreadyInitialized();
    error ParamsNotInitialized();
    error InvalidRSAModulus();
    error InvalidGenerator();
    error InvalidAccumulator();
    error MarketAlreadyNullified();
    error MarketNotNullified();
    error AddressAlreadyNullified();
    error AddressNotNullified();
    error InvalidAddress();
    error BatchTooLarge();
    error EmptyBatch();

    // ========== Constructor ==========

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setRoleAdmin(NULLIFIER_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
    }

    // ========== Initialization ==========

    /**
     * @notice Initialize RSA accumulator parameters
     * @dev Can only be called once. RSA modulus should be generated via trusted setup.
     *      The modulus n must be a product of two safe primes p, q where:
     *      - p = 2p' + 1 and q = 2q' + 1 for primes p' and q'
     *      - Generator g must be a quadratic residue mod n
     *
     * @param n RSA modulus (2048 bits = 256 bytes)
     * @param g Generator element
     * @param initialAccumulator Initial accumulator value (typically g)
     */
    function initializeParams(
        bytes calldata n,
        bytes calldata g,
        bytes calldata initialAccumulator
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (paramsInitialized) revert ParamsAlreadyInitialized();
        if (n.length != RSA_BYTES) revert InvalidRSAModulus();
        if (g.length != RSA_BYTES) revert InvalidGenerator();
        if (initialAccumulator.length != RSA_BYTES) revert InvalidAccumulator();

        accumulatorParams.n = n;
        accumulatorParams.g = g;
        accumulator = initialAccumulator;
        paramsInitialized = true;
        lastAccumulatorUpdate = block.timestamp;

        emit RSAParamsInitialized(block.timestamp);
    }

    // ========== Market Nullification ==========

    /**
     * @notice Nullify a market, preventing it from being displayed or traded
     * @param marketHash The keccak256 hash of the market data
     * @param marketId The market ID (for event logging)
     * @param reason Human-readable reason for nullification
     */
    function nullifyMarket(
        bytes32 marketHash,
        uint256 marketId,
        string calldata reason
    ) external onlyRole(NULLIFIER_ADMIN_ROLE) whenNotPaused {
        if (nullifiedMarkets[marketHash]) revert MarketAlreadyNullified();

        nullifiedMarkets[marketHash] = true;
        marketNullifiedAt[marketHash] = block.timestamp;
        marketNullifiedBy[marketHash] = msg.sender;

        // Add to enumerable list
        marketListIndex[marketHash] = nullifiedMarketList.length;
        nullifiedMarketList.push(marketHash);

        nullifiedMarketCount++;
        totalNullifications++;

        emit MarketNullified(marketHash, marketId, msg.sender, block.timestamp, reason);
    }

    /**
     * @notice Reinstate a previously nullified market
     * @param marketHash The market hash to reinstate
     * @param marketId The market ID (for event logging)
     * @param reason Human-readable reason for reinstatement
     */
    function reinstateMarket(
        bytes32 marketHash,
        uint256 marketId,
        string calldata reason
    ) external onlyRole(NULLIFIER_ADMIN_ROLE) whenNotPaused {
        if (!nullifiedMarkets[marketHash]) revert MarketNotNullified();

        nullifiedMarkets[marketHash] = false;
        marketNullifiedAt[marketHash] = 0;
        marketNullifiedBy[marketHash] = address(0);

        // Remove from enumerable list (swap and pop)
        _removeFromMarketList(marketHash);

        nullifiedMarketCount--;
        totalReinstatements++;

        emit MarketReinstated(marketHash, marketId, msg.sender, block.timestamp, reason);
    }

    /**
     * @notice Batch nullify multiple markets
     * @param marketHashes Array of market hashes to nullify
     * @param marketIds Array of market IDs (for event logging)
     * @param reason Shared reason for all nullifications
     */
    function batchNullifyMarkets(
        bytes32[] calldata marketHashes,
        uint256[] calldata marketIds,
        string calldata reason
    ) external onlyRole(NULLIFIER_ADMIN_ROLE) whenNotPaused {
        if (marketHashes.length == 0) revert EmptyBatch();
        if (marketHashes.length > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (marketHashes.length != marketIds.length) revert("Length mismatch");

        for (uint256 i = 0; i < marketHashes.length; i++) {
            bytes32 marketHash = marketHashes[i];
            if (!nullifiedMarkets[marketHash]) {
                nullifiedMarkets[marketHash] = true;
                marketNullifiedAt[marketHash] = block.timestamp;
                marketNullifiedBy[marketHash] = msg.sender;

                marketListIndex[marketHash] = nullifiedMarketList.length;
                nullifiedMarketList.push(marketHash);

                nullifiedMarketCount++;
                totalNullifications++;

                emit MarketNullified(marketHash, marketIds[i], msg.sender, block.timestamp, reason);
            }
        }

        emit BatchMarketsNullified(marketHashes, msg.sender, block.timestamp);
    }

    // ========== Address Nullification ==========

    /**
     * @notice Nullify an address, preventing it from interacting with the platform
     * @param addr The address to nullify
     * @param reason Human-readable reason for nullification
     */
    function nullifyAddress(
        address addr,
        string calldata reason
    ) external onlyRole(NULLIFIER_ADMIN_ROLE) whenNotPaused {
        if (addr == address(0)) revert InvalidAddress();
        if (nullifiedAddresses[addr]) revert AddressAlreadyNullified();

        nullifiedAddresses[addr] = true;
        addressNullifiedAt[addr] = block.timestamp;
        addressNullifiedBy[addr] = msg.sender;

        // Add to enumerable list
        addressListIndex[addr] = nullifiedAddressList.length;
        nullifiedAddressList.push(addr);

        nullifiedAddressCount++;
        totalNullifications++;

        emit AddressNullified(addr, msg.sender, block.timestamp, reason);
    }

    /**
     * @notice Reinstate a previously nullified address
     * @param addr The address to reinstate
     * @param reason Human-readable reason for reinstatement
     */
    function reinstateAddress(
        address addr,
        string calldata reason
    ) external onlyRole(NULLIFIER_ADMIN_ROLE) whenNotPaused {
        if (!nullifiedAddresses[addr]) revert AddressNotNullified();

        nullifiedAddresses[addr] = false;
        addressNullifiedAt[addr] = 0;
        addressNullifiedBy[addr] = address(0);

        // Remove from enumerable list
        _removeFromAddressList(addr);

        nullifiedAddressCount--;
        totalReinstatements++;

        emit AddressReinstated(addr, msg.sender, block.timestamp, reason);
    }

    /**
     * @notice Batch nullify multiple addresses
     * @param addrs Array of addresses to nullify
     * @param reason Shared reason for all nullifications
     */
    function batchNullifyAddresses(
        address[] calldata addrs,
        string calldata reason
    ) external onlyRole(NULLIFIER_ADMIN_ROLE) whenNotPaused {
        if (addrs.length == 0) revert EmptyBatch();
        if (addrs.length > MAX_BATCH_SIZE) revert BatchTooLarge();

        for (uint256 i = 0; i < addrs.length; i++) {
            address addr = addrs[i];
            if (addr != address(0) && !nullifiedAddresses[addr]) {
                nullifiedAddresses[addr] = true;
                addressNullifiedAt[addr] = block.timestamp;
                addressNullifiedBy[addr] = msg.sender;

                addressListIndex[addr] = nullifiedAddressList.length;
                nullifiedAddressList.push(addr);

                nullifiedAddressCount++;
                totalNullifications++;

                emit AddressNullified(addr, msg.sender, block.timestamp, reason);
            }
        }

        emit BatchAddressesNullified(addrs, msg.sender, block.timestamp);
    }

    // ========== Accumulator Management ==========

    /**
     * @notice Update the RSA accumulator value
     * @dev Called after off-chain computation of new accumulator value
     *      The new value should be: g^(product of all nullified element primes) mod n
     *
     * @param newAccumulator The updated accumulator value
     */
    function updateAccumulator(
        bytes calldata newAccumulator
    ) external onlyRole(NULLIFIER_ADMIN_ROLE) whenNotPaused {
        if (!paramsInitialized) revert ParamsNotInitialized();
        if (newAccumulator.length != RSA_BYTES) revert InvalidAccumulator();

        accumulator = newAccumulator;
        lastAccumulatorUpdate = block.timestamp;

        emit AccumulatorUpdated(newAccumulator, block.timestamp, msg.sender);
    }

    // ========== Verification Functions ==========

    /**
     * @notice Check if a market is nullified (simple lookup)
     * @param marketHash The market hash to check
     * @return True if the market is nullified
     */
    function isMarketNullified(bytes32 marketHash) external view returns (bool) {
        return nullifiedMarkets[marketHash];
    }

    /**
     * @notice Check if an address is nullified (simple lookup)
     * @param addr The address to check
     * @return True if the address is nullified
     */
    function isAddressNullified(address addr) external view returns (bool) {
        return nullifiedAddresses[addr];
    }

    /**
     * @notice Verify non-membership using RSA accumulator proof
     * @dev Verifies that an element is NOT in the nullified set using cryptographic proof
     *      This is useful for trustless verification without querying contract state
     *
     * @param elementHash Hash of the element (market or address)
     * @param witnessD Bezout coefficient d from the proof
     * @param witnessB Base component b from the proof
     * @param dNegative Whether d is negative
     * @return valid True if the proof verifies (element is NOT nullified)
     */
    function verifyNonMembership(
        bytes32 elementHash,
        bytes calldata witnessD,
        bytes calldata witnessB,
        bool dNegative
    ) external view returns (bool valid) {
        if (!paramsInitialized) revert ParamsNotInitialized();

        // Convert element hash to prime
        (, uint256 primeUint) = RSAAccumulator.hashToPrime(elementHash);
        bytes memory prime = RSAAccumulator.uint256ToBytes(primeUint, 32);

        // Create witness struct
        RSAAccumulator.NonMembershipWitness memory witness = RSAAccumulator.NonMembershipWitness({
            d: witnessD,
            b: witnessB,
            dNegative: dNegative
        });

        // Verify using RSA accumulator library
        return RSAAccumulator.verifyNonMembership(
            accumulatorParams,
            accumulator,
            prime,
            witness
        );
    }

    /**
     * @notice Compute the prime representative for a market hash
     * @param marketHash The market hash
     * @return prime The prime number representing this market
     */
    function computeMarketPrime(bytes32 marketHash) external pure returns (uint256 prime) {
        return PrimeMapping.hashToPrimeUint(marketHash);
    }

    /**
     * @notice Compute the prime representative for an address
     * @param addr The address
     * @return prime The prime number representing this address
     */
    function computeAddressPrime(address addr) external pure returns (uint256 prime) {
        return PrimeMapping.addressToPrime(addr);
    }

    // ========== View Functions ==========

    /**
     * @notice Get nullification details for a market
     * @param marketHash The market hash
     * @return nullified Whether the market is nullified
     * @return timestamp When it was nullified (0 if not)
     * @return admin Who nullified it (address(0) if not)
     */
    function getMarketNullificationDetails(bytes32 marketHash)
        external
        view
        returns (bool nullified, uint256 timestamp, address admin)
    {
        return (
            nullifiedMarkets[marketHash],
            marketNullifiedAt[marketHash],
            marketNullifiedBy[marketHash]
        );
    }

    /**
     * @notice Get nullification details for an address
     * @param addr The address
     * @return nullified Whether the address is nullified
     * @return timestamp When it was nullified (0 if not)
     * @return admin Who nullified it (address(0) if not)
     */
    function getAddressNullificationDetails(address addr)
        external
        view
        returns (bool nullified, uint256 timestamp, address admin)
    {
        return (
            nullifiedAddresses[addr],
            addressNullifiedAt[addr],
            addressNullifiedBy[addr]
        );
    }

    /**
     * @notice Get all nullified market hashes with pagination
     * @param offset Starting index
     * @param limit Maximum number of results
     * @return hashes Array of nullified market hashes
     * @return hasMore Whether more results exist
     */
    function getNullifiedMarkets(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory hashes, bool hasMore)
    {
        uint256 total = nullifiedMarketList.length;
        if (offset >= total) {
            return (new bytes32[](0), false);
        }

        uint256 remaining = total - offset;
        uint256 count = remaining > limit ? limit : remaining;
        hasMore = remaining > limit;

        hashes = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            hashes[i] = nullifiedMarketList[offset + i];
        }
    }

    /**
     * @notice Get all nullified addresses with pagination
     * @param offset Starting index
     * @param limit Maximum number of results
     * @return addrs Array of nullified addresses
     * @return hasMore Whether more results exist
     */
    function getNullifiedAddresses(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory addrs, bool hasMore)
    {
        uint256 total = nullifiedAddressList.length;
        if (offset >= total) {
            return (new address[](0), false);
        }

        uint256 remaining = total - offset;
        uint256 count = remaining > limit ? limit : remaining;
        hasMore = remaining > limit;

        addrs = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            addrs[i] = nullifiedAddressList[offset + i];
        }
    }

    /**
     * @notice Get current accumulator value
     * @return The current RSA accumulator value
     */
    function getAccumulator() external view returns (bytes memory) {
        return accumulator;
    }

    /**
     * @notice Get RSA parameters
     * @return n RSA modulus
     * @return g Generator
     */
    function getRSAParams() external view returns (bytes memory n, bytes memory g) {
        return (accumulatorParams.n, accumulatorParams.g);
    }

    /**
     * @notice Get registry statistics
     * @return markets Number of nullified markets
     * @return addresses Number of nullified addresses
     * @return nullifications Total nullification operations
     * @return reinstatements Total reinstatement operations
     * @return lastUpdate Last accumulator update timestamp
     */
    function getStats()
        external
        view
        returns (
            uint256 markets,
            uint256 addresses,
            uint256 nullifications,
            uint256 reinstatements,
            uint256 lastUpdate
        )
    {
        return (
            nullifiedMarketCount,
            nullifiedAddressCount,
            totalNullifications,
            totalReinstatements,
            lastAccumulatorUpdate
        );
    }

    // ========== Emergency Functions ==========

    /**
     * @notice Pause the registry
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the registry
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ========== Internal Functions ==========

    /**
     * @notice Remove a market hash from the enumerable list
     */
    function _removeFromMarketList(bytes32 marketHash) internal {
        uint256 index = marketListIndex[marketHash];
        uint256 lastIndex = nullifiedMarketList.length - 1;

        if (index != lastIndex) {
            bytes32 lastHash = nullifiedMarketList[lastIndex];
            nullifiedMarketList[index] = lastHash;
            marketListIndex[lastHash] = index;
        }

        nullifiedMarketList.pop();
        delete marketListIndex[marketHash];
    }

    /**
     * @notice Remove an address from the enumerable list
     */
    function _removeFromAddressList(address addr) internal {
        uint256 index = addressListIndex[addr];
        uint256 lastIndex = nullifiedAddressList.length - 1;

        if (index != lastIndex) {
            address lastAddr = nullifiedAddressList[lastIndex];
            nullifiedAddressList[index] = lastAddr;
            addressListIndex[lastAddr] = index;
        }

        nullifiedAddressList.pop();
        delete addressListIndex[addr];
    }
}
