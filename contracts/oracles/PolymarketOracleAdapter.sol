// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IPolymarketOracle.sol";
import "./IOracleAdapter.sol";

/**
 * @title PolymarketOracleAdapter
 * @notice Adapter contract to query Polymarket CTF conditions for resolving private markets
 * @dev This adapter allows FriendGroupMarketFactory markets to be resolved based on
 *      Polymarket market outcomes when deployed on the same network (e.g., Polygon)
 *
 * KEY FEATURES:
 * - Queries external Polymarket CTF contract for resolution data
 * - Supports multiple Polymarket CTF contract addresses (for upgrades)
 * - Caches resolution data for gas efficiency
 * - Emits events for off-chain tracking
 *
 * POLYMARKET ARCHITECTURE:
 * - Polymarket uses Gnosis CTF (Conditional Token Framework)
 * - Markets are identified by conditionId = keccak256(oracle, questionId, outcomeSlotCount)
 * - Resolution is binary: [1,0] for YES wins, [0,1] for NO wins
 * - UMA Optimistic Oracle is used for dispute resolution
 *
 * INTEGRATION FLOW:
 * 1. User creates private market and pegs to Polymarket conditionId
 * 2. When Polymarket resolves, anyone can call resolveFromPolymarket()
 * 3. Adapter fetches resolution data and resolves the private market
 */
contract PolymarketOracleAdapter is IOracleAdapter, Ownable, ReentrancyGuard {

    /// @notice Address of the Polymarket CTF contract (on same network)
    address public polymarketCTF;

    /// @notice Mapping of supported CTF contract addresses
    mapping(address => bool) public supportedCTFContracts;

    /// @notice Cache for resolved conditions (conditionId => resolution data)
    struct CachedResolution {
        bool resolved;
        uint256 passNumerator;  // Payout for YES/PASS outcome
        uint256 failNumerator;  // Payout for NO/FAIL outcome
        uint256 denominator;
        uint256 cachedAt;
    }
    mapping(bytes32 => CachedResolution) public resolutionCache;

    /// @notice Mapping of linked markets (friendMarketId => PolymarketCondition)
    struct PolymarketCondition {
        bytes32 conditionId;
        address ctfContract;
        bool linked;
    }
    mapping(uint256 => PolymarketCondition) public linkedMarkets;

    /// @notice Events
    event CTFContractAdded(address indexed ctfContract);
    event CTFContractRemoved(address indexed ctfContract);
    event PrimaryCtfUpdated(address indexed oldCTF, address indexed newCTF);
    event MarketLinkedToPolymarket(
        uint256 indexed friendMarketId,
        bytes32 indexed conditionId,
        address indexed ctfContract
    );
    event MarketUnlinked(uint256 indexed friendMarketId);
    event ResolutionFetched(
        bytes32 indexed conditionId,
        uint256 passNumerator,
        uint256 failNumerator,
        uint256 denominator
    );
    event ResolutionCached(
        bytes32 indexed conditionId,
        uint256 passNumerator,
        uint256 failNumerator,
        uint256 denominator
    );

    /// @notice Custom errors
    error InvalidAddress();
    error CTFNotSupported();
    error ConditionNotResolved();
    error MarketAlreadyLinked();
    error MarketNotLinked();
    error InvalidConditionId();
    error FetchFailed();

    constructor(address _polymarketCTF) Ownable(msg.sender) {
        if (_polymarketCTF == address(0)) revert InvalidAddress();
        polymarketCTF = _polymarketCTF;
        supportedCTFContracts[_polymarketCTF] = true;
        emit CTFContractAdded(_polymarketCTF);
    }

    // ========== Admin Functions ==========

    /**
     * @notice Add a supported CTF contract address
     * @param ctfContract Address of CTF contract to add
     */
    function addCTFContract(address ctfContract) external onlyOwner {
        if (ctfContract == address(0)) revert InvalidAddress();
        supportedCTFContracts[ctfContract] = true;
        emit CTFContractAdded(ctfContract);
    }

    /**
     * @notice Remove a supported CTF contract address
     * @param ctfContract Address of CTF contract to remove
     */
    function removeCTFContract(address ctfContract) external onlyOwner {
        supportedCTFContracts[ctfContract] = false;
        emit CTFContractRemoved(ctfContract);
    }

    /**
     * @notice Update the primary Polymarket CTF address
     * @param newCTF New primary CTF contract address
     */
    function updatePrimaryCTF(address newCTF) external onlyOwner {
        if (newCTF == address(0)) revert InvalidAddress();
        address oldCTF = polymarketCTF;
        polymarketCTF = newCTF;
        supportedCTFContracts[newCTF] = true;
        emit PrimaryCtfUpdated(oldCTF, newCTF);
    }

    // ========== Market Linking Functions ==========

    /**
     * @notice Link a friend market to a Polymarket condition
     * @param friendMarketId ID of the friend market
     * @param conditionId Polymarket condition ID
     */
    function linkMarketToPolymarket(
        uint256 friendMarketId,
        bytes32 conditionId
    ) external {
        linkMarketToPolymarketWithCTF(friendMarketId, conditionId, polymarketCTF);
    }

    /**
     * @notice Link a friend market to a Polymarket condition with specific CTF
     * @param friendMarketId ID of the friend market
     * @param conditionId Polymarket condition ID
     * @param ctfContract Address of the CTF contract
     */
    function linkMarketToPolymarketWithCTF(
        uint256 friendMarketId,
        bytes32 conditionId,
        address ctfContract
    ) public {
        if (!supportedCTFContracts[ctfContract]) revert CTFNotSupported();
        if (linkedMarkets[friendMarketId].linked) revert MarketAlreadyLinked();
        if (conditionId == bytes32(0)) revert InvalidConditionId();

        // Verify condition exists on CTF
        try IPolymarketOracle(ctfContract).getCondition(conditionId) returns (
            address oracle,
            bytes32 questionId,
            uint256 outcomeSlotCount,
            bool /* resolved */
        ) {
            // Condition must be prepared (oracle != 0)
            if (oracle == address(0)) revert InvalidConditionId();
            // We only support binary outcomes for friend markets
            require(outcomeSlotCount == 2, "Only binary conditions supported");
        } catch {
            revert InvalidConditionId();
        }

        linkedMarkets[friendMarketId] = PolymarketCondition({
            conditionId: conditionId,
            ctfContract: ctfContract,
            linked: true
        });

        emit MarketLinkedToPolymarket(friendMarketId, conditionId, ctfContract);
    }

    /**
     * @notice Unlink a friend market from Polymarket
     * @param friendMarketId ID of the friend market
     */
    function unlinkMarket(uint256 friendMarketId) external onlyOwner {
        if (!linkedMarkets[friendMarketId].linked) revert MarketNotLinked();
        delete linkedMarkets[friendMarketId];
        emit MarketUnlinked(friendMarketId);
    }

    // ========== Resolution Functions ==========

    /**
     * @notice Fetch resolution data from Polymarket CTF
     * @param conditionId The condition ID to fetch
     * @return passNumerator Payout numerator for PASS/YES outcome
     * @return failNumerator Payout numerator for FAIL/NO outcome
     * @return denominator Payout denominator
     */
    function fetchResolution(bytes32 conditionId) public returns (
        uint256 passNumerator,
        uint256 failNumerator,
        uint256 denominator
    ) {
        return fetchResolutionFromCTF(conditionId, polymarketCTF);
    }

    /**
     * @notice Fetch resolution data from a specific CTF contract
     * @param conditionId The condition ID to fetch
     * @param ctfContract The CTF contract address
     * @return passNumerator Payout numerator for PASS/YES outcome
     * @return failNumerator Payout numerator for FAIL/NO outcome
     * @return denominator Payout denominator
     */
    function fetchResolutionFromCTF(
        bytes32 conditionId,
        address ctfContract
    ) public returns (
        uint256 passNumerator,
        uint256 failNumerator,
        uint256 denominator
    ) {
        if (!supportedCTFContracts[ctfContract]) revert CTFNotSupported();

        // Check if resolved
        bool resolved;
        try IPolymarketOracle(ctfContract).isResolved(conditionId) returns (bool _resolved) {
            resolved = _resolved;
        } catch {
            revert FetchFailed();
        }

        if (!resolved) revert ConditionNotResolved();

        // Fetch payout numerators
        uint256[] memory payouts;
        try IPolymarketOracle(ctfContract).getPayoutNumerators(conditionId) returns (uint256[] memory _payouts) {
            payouts = _payouts;
        } catch {
            revert FetchFailed();
        }

        // Fetch denominator
        try IPolymarketOracle(ctfContract).getPayoutDenominator(conditionId) returns (uint256 _denominator) {
            denominator = _denominator;
        } catch {
            revert FetchFailed();
        }

        // For binary markets: payouts[0] = YES/PASS, payouts[1] = NO/FAIL
        require(payouts.length == 2, "Invalid payout array");
        passNumerator = payouts[0];
        failNumerator = payouts[1];

        // Cache the resolution
        resolutionCache[conditionId] = CachedResolution({
            resolved: true,
            passNumerator: passNumerator,
            failNumerator: failNumerator,
            denominator: denominator,
            cachedAt: block.timestamp
        });

        emit ResolutionFetched(conditionId, passNumerator, failNumerator, denominator);
        emit ResolutionCached(conditionId, passNumerator, failNumerator, denominator);
    }

    /**
     * @notice Get resolution data for a linked market
     * @param friendMarketId ID of the friend market
     * @return passNumerator Payout numerator for PASS/YES outcome
     * @return failNumerator Payout numerator for FAIL/NO outcome
     * @return denominator Payout denominator
     * @return resolved Whether the condition is resolved
     */
    function getResolutionForMarket(uint256 friendMarketId) external returns (
        uint256 passNumerator,
        uint256 failNumerator,
        uint256 denominator,
        bool resolved
    ) {
        PolymarketCondition storage condition = linkedMarkets[friendMarketId];
        if (!condition.linked) revert MarketNotLinked();

        // Check cache first
        CachedResolution storage cached = resolutionCache[condition.conditionId];
        if (cached.resolved) {
            return (
                cached.passNumerator,
                cached.failNumerator,
                cached.denominator,
                true
            );
        }

        // Try to fetch from CTF
        try this.fetchResolutionFromCTF(condition.conditionId, condition.ctfContract) returns (
            uint256 _passNumerator,
            uint256 _failNumerator,
            uint256 _denominator
        ) {
            return (_passNumerator, _failNumerator, _denominator, true);
        } catch {
            return (0, 0, 0, false);
        }
    }

    // ========== View Functions ==========

    /**
     * @notice Check if a market is linked to Polymarket
     * @param friendMarketId ID of the friend market
     */
    function isMarketLinked(uint256 friendMarketId) external view returns (bool) {
        return linkedMarkets[friendMarketId].linked;
    }

    /**
     * @notice Get linked market details
     * @param friendMarketId ID of the friend market
     */
    function getLinkedMarket(uint256 friendMarketId) external view returns (
        bytes32 conditionId,
        address ctfContract,
        bool linked
    ) {
        PolymarketCondition storage condition = linkedMarkets[friendMarketId];
        return (condition.conditionId, condition.ctfContract, condition.linked);
    }

    /**
     * @notice Check if a condition is resolved (from cache or CTF)
     * @param conditionId The condition ID to check
     * @return resolved True if the condition has been resolved
     */
    function isConditionResolved(bytes32 conditionId) external view override returns (bool resolved) {
        // Check cache first
        if (resolutionCache[conditionId].resolved) {
            return true;
        }

        // Check CTF
        try IPolymarketOracle(polymarketCTF).isResolved(conditionId) returns (bool isResolved) {
            return isResolved;
        } catch {
            return false;
        }
    }

    /**
     * @notice Get cached resolution data
     * @param conditionId The condition ID
     */
    function getCachedResolution(bytes32 conditionId) external view returns (
        bool resolved,
        uint256 passNumerator,
        uint256 failNumerator,
        uint256 denominator,
        uint256 cachedAt
    ) {
        CachedResolution storage cached = resolutionCache[conditionId];
        return (
            cached.resolved,
            cached.passNumerator,
            cached.failNumerator,
            cached.denominator,
            cached.cachedAt
        );
    }

    /**
     * @notice Compute condition ID (utility function matching CTF standard)
     * @param oracle The oracle address (Polymarket's UMA CTF Adapter)
     * @param questionId The question identifier (from Polymarket market)
     * @param outcomeSlotCount Number of outcomes (2 for binary)
     */
    function computeConditionId(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
    }

    /**
     * @notice Determine winning outcome from resolution data
     * @param passNumerator Payout numerator for PASS/YES
     * @param failNumerator Payout numerator for FAIL/NO
     * @return outcome True if PASS/YES wins, false if FAIL/NO wins
     * @return isTie True if it's a tie
     */
    function determineOutcome(
        uint256 passNumerator,
        uint256 failNumerator
    ) external pure returns (bool outcome, bool isTie) {
        if (passNumerator == failNumerator) {
            return (false, true);
        }
        return (passNumerator > failNumerator, false);
    }

    // ========== IOracleAdapter Implementation ==========

    /**
     * @notice Returns the oracle type
     * @return The oracle type as "Polymarket"
     */
    function oracleType() external pure override returns (string memory) {
        return "Polymarket";
    }

    /**
     * @notice Check if Polymarket oracle is available on this network
     * @dev Returns true if the Polymarket CTF contract is deployed and responding
     * @return available True if oracle can be used for resolution
     */
    function isAvailable() external view override returns (bool available) {
        // Check if CTF address is set
        if (polymarketCTF == address(0)) return false;

        // Check if the contract has code deployed
        uint256 size;
        address ctf = polymarketCTF;
        assembly {
            size := extcodesize(ctf)
        }
        if (size == 0) return false;

        // Try to call isResolved with a zero conditionId to verify it's the right contract
        // This will return false (not resolved) but proves the contract is present
        try IPolymarketOracle(polymarketCTF).isResolved(bytes32(0)) returns (bool) {
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @notice Get the chain ID this adapter is configured for
     * @dev Polymarket is deployed on Polygon (chainId 137)
     * @return chainId Current chain ID
     */
    function getConfiguredChainId() external view override returns (uint256 chainId) {
        return block.chainid;
    }

    /**
     * @notice Check if a condition ID is supported (has been linked or cached)
     * @param conditionId The condition to check
     * @return supported True if condition is known to this adapter
     */
    function isConditionSupported(bytes32 conditionId) external view override returns (bool supported) {
        // Check if we have cached resolution or if it exists in CTF
        if (resolutionCache[conditionId].cachedAt > 0) {
            return true;
        }
        // Try to check existence in primary CTF
        try IPolymarketOracle(polymarketCTF).getCondition(conditionId) returns (
            address, bytes32, uint256 outcomeSlotCount, bool
        ) {
            return outcomeSlotCount > 0;
        } catch {
            return false;
        }
    }

    /**
     * @notice Get the outcome of a resolved condition
     * @param conditionId The condition to query
     * @return outcome True if YES/PASS won
     * @return confidence Always 10000 (100%) for Polymarket
     * @return resolvedAt Timestamp when cached
     */
    function getOutcome(bytes32 conditionId) external view override returns (
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    ) {
        CachedResolution storage cached = resolutionCache[conditionId];
        if (cached.resolved) {
            return (
                cached.passNumerator > cached.failNumerator,
                10000, // 100% confidence for resolved conditions
                cached.cachedAt
            );
        }

        // Fetch from CTF if not cached
        try IPolymarketOracle(polymarketCTF).isResolved(conditionId) returns (bool isResolved) {
            if (!isResolved) {
                return (false, 0, 0);
            }
            uint256[] memory payouts = IPolymarketOracle(polymarketCTF).getPayoutNumerators(conditionId);
            if (payouts.length >= 2) {
                return (
                    payouts[0] > payouts[1],
                    10000,
                    block.timestamp
                );
            }
        } catch {
            // Fall through
        }
        return (false, 0, 0);
    }

    /**
     * @notice Get metadata about a condition
     * @param conditionId The condition to query
     * @return description Empty string (Polymarket doesn't store on-chain descriptions)
     * @return expectedResolutionTime Always 0 (not tracked on-chain)
     */
    function getConditionMetadata(bytes32 conditionId) external view override returns (
        string memory description,
        uint256 expectedResolutionTime
    ) {
        // Polymarket doesn't store descriptions on-chain
        // Return empty values - off-chain services should be used for metadata
        conditionId; // silence unused warning
        return ("", 0);
    }
}
