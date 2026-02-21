// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IOracleAdapter.sol";

// Custom errors
error AdapterAlreadyRegistered();
error AdapterNotRegistered();
error InvalidAdapter();
error NoAdaptersFound();
error ConditionNotResolved();

/**
 * @title OracleRegistry
 * @notice Central registry for oracle adapters in the FairWins P2P wager system
 * @dev Manages multiple oracle adapters with verification and discovery capabilities
 *
 * KEY FEATURES:
 * - Register/unregister oracle adapters by unique ID
 * - Verification status for trust levels
 * - Query across all adapters for condition support
 * - Standardized resolution interface
 *
 * SUPPORTED ORACLES:
 * - Polymarket (prediction markets)
 * - Chainlink (price feeds)
 * - UMA (optimistic oracle)
 * - Custom adapters
 */
contract OracleRegistry is Ownable {
    // ========== Storage ==========

    // Oracle ID => Adapter address
    mapping(bytes32 => address) public adapters;

    // Adapter address => Verification status
    mapping(address => bool) public verifiedAdapters;

    // Adapter address => Active status
    mapping(address => bool) public activeAdapters;

    // List of registered oracle IDs
    bytes32[] public registeredOracleIds;

    // Oracle ID => Index in registeredOracleIds (for removal)
    mapping(bytes32 => uint256) private oracleIdIndex;

    // ========== Events ==========

    event AdapterRegistered(
        bytes32 indexed oracleId,
        address indexed adapter,
        string oracleType
    );

    event AdapterRemoved(
        bytes32 indexed oracleId,
        address indexed adapter
    );

    event AdapterVerified(
        address indexed adapter,
        bool verified
    );

    event AdapterStatusChanged(
        address indexed adapter,
        bool active
    );

    // ========== Constructor ==========

    constructor(address _owner) Ownable(_owner) {}

    // ========== Admin Functions ==========

    /**
     * @notice Register a new oracle adapter
     * @param oracleId Unique identifier for this oracle (e.g., keccak256("POLYMARKET"))
     * @param adapter Address of the adapter contract
     */
    function registerAdapter(bytes32 oracleId, address adapter) external onlyOwner {
        if (adapter == address(0)) revert InvalidAdapter();
        if (adapters[oracleId] != address(0)) revert AdapterAlreadyRegistered();

        adapters[oracleId] = adapter;
        activeAdapters[adapter] = true;

        // Add to list
        oracleIdIndex[oracleId] = registeredOracleIds.length;
        registeredOracleIds.push(oracleId);

        // Get oracle type from adapter
        string memory oracleType = IOracleAdapter(adapter).oracleType();

        emit AdapterRegistered(oracleId, adapter, oracleType);
    }

    /**
     * @notice Remove an oracle adapter
     * @param oracleId The oracle ID to remove
     */
    function removeAdapter(bytes32 oracleId) external onlyOwner {
        address adapter = adapters[oracleId];
        if (adapter == address(0)) revert AdapterNotRegistered();

        // Remove from mapping
        delete adapters[oracleId];
        delete activeAdapters[adapter];

        // Remove from list (swap and pop)
        uint256 index = oracleIdIndex[oracleId];
        uint256 lastIndex = registeredOracleIds.length - 1;
        if (index != lastIndex) {
            bytes32 lastOracleId = registeredOracleIds[lastIndex];
            registeredOracleIds[index] = lastOracleId;
            oracleIdIndex[lastOracleId] = index;
        }
        registeredOracleIds.pop();
        delete oracleIdIndex[oracleId];

        emit AdapterRemoved(oracleId, adapter);
    }

    /**
     * @notice Set verification status for an adapter
     * @param adapter Address of the adapter
     * @param verified Whether the adapter is verified (trusted)
     */
    function verifyAdapter(address adapter, bool verified) external onlyOwner {
        if (adapter == address(0)) revert InvalidAdapter();
        verifiedAdapters[adapter] = verified;
        emit AdapterVerified(adapter, verified);
    }

    /**
     * @notice Set active status for an adapter
     * @param adapter Address of the adapter
     * @param active Whether the adapter is active
     */
    function setAdapterStatus(address adapter, bool active) external onlyOwner {
        if (adapter == address(0)) revert InvalidAdapter();
        activeAdapters[adapter] = active;
        emit AdapterStatusChanged(adapter, active);
    }

    // ========== Query Functions ==========

    /**
     * @notice Get the adapter for a specific oracle ID
     * @param oracleId The oracle ID
     * @return adapter Address of the adapter (zero if not registered)
     */
    function getAdapter(bytes32 oracleId) external view returns (address adapter) {
        return adapters[oracleId];
    }

    /**
     * @notice Check if an adapter is registered and active
     * @param oracleId The oracle ID
     * @return isActive True if the adapter is registered and active
     */
    function isAdapterActive(bytes32 oracleId) external view returns (bool isActive) {
        address adapter = adapters[oracleId];
        return adapter != address(0) && activeAdapters[adapter];
    }

    /**
     * @notice Check if an adapter is verified
     * @param oracleId The oracle ID
     * @return isVerified True if the adapter is verified
     */
    function isAdapterVerified(bytes32 oracleId) external view returns (bool isVerified) {
        address adapter = adapters[oracleId];
        return adapter != address(0) && verifiedAdapters[adapter];
    }

    /**
     * @notice Resolve a condition using the specified oracle
     * @param oracleId The oracle ID to use
     * @param conditionId The condition to resolve
     * @return outcome The resolution outcome
     * @return confidence The confidence level
     */
    function resolveCondition(
        bytes32 oracleId,
        bytes32 conditionId
    ) external view returns (bool outcome, uint256 confidence) {
        address adapter = adapters[oracleId];
        if (adapter == address(0)) revert AdapterNotRegistered();
        if (!activeAdapters[adapter]) revert AdapterNotRegistered();

        if (!IOracleAdapter(adapter).isConditionResolved(conditionId)) {
            revert ConditionNotResolved();
        }

        (outcome, confidence, ) = IOracleAdapter(adapter).getOutcome(conditionId);
    }

    /**
     * @notice Find all adapters that support a given condition
     * @param conditionId The condition to check
     * @return supportingAdapters Array of adapter addresses that support the condition
     */
    function findAdaptersForCondition(
        bytes32 conditionId
    ) external view returns (address[] memory supportingAdapters) {
        // First pass: count supporting adapters
        uint256 count = 0;
        for (uint256 i = 0; i < registeredOracleIds.length; i++) {
            address adapter = adapters[registeredOracleIds[i]];
            if (activeAdapters[adapter] && IOracleAdapter(adapter).isConditionSupported(conditionId)) {
                count++;
            }
        }

        // Second pass: collect addresses
        supportingAdapters = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < registeredOracleIds.length; i++) {
            address adapter = adapters[registeredOracleIds[i]];
            if (activeAdapters[adapter] && IOracleAdapter(adapter).isConditionSupported(conditionId)) {
                supportingAdapters[index] = adapter;
                index++;
            }
        }
    }

    /**
     * @notice Get all registered oracle IDs
     * @return Array of oracle IDs
     */
    function getRegisteredOracleIds() external view returns (bytes32[] memory) {
        return registeredOracleIds;
    }

    /**
     * @notice Get the number of registered adapters
     * @return count Number of registered adapters
     */
    function getAdapterCount() external view returns (uint256 count) {
        return registeredOracleIds.length;
    }

    /**
     * @notice Get adapter info by oracle ID
     * @param oracleId The oracle ID
     * @return adapter The adapter address
     * @return oracleType The type of oracle
     * @return isVerified Whether the adapter is verified
     * @return isActive Whether the adapter is active
     */
    function getAdapterInfo(bytes32 oracleId) external view returns (
        address adapter,
        string memory oracleType,
        bool isVerified,
        bool isActive
    ) {
        adapter = adapters[oracleId];
        if (adapter == address(0)) {
            return (address(0), "", false, false);
        }

        oracleType = IOracleAdapter(adapter).oracleType();
        isVerified = verifiedAdapters[adapter];
        isActive = activeAdapters[adapter];
    }
}
