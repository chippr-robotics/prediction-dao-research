// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CTF1155 - Conditional Token Framework using ERC1155
 * @notice Gas-efficient conditional tokens based on Gnosis CTF standard
 * @dev Implements ERC1155 multi-token standard for conditional outcomes
 * 
 * Key features:
 * - Gas efficient transfers using ERC1155 batch operations
 * - Combinatorial outcomes support (A AND B, A OR B, etc.)
 * - Position splitting and merging
 * - Multiple collateral token support
 * - Deep vs shallow position management
 * 
 * Based on: https://github.com/gnosis/conditional-tokens-contracts
 */
contract CTF1155 is ERC1155, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Emitted when a condition is prepared
    event ConditionPreparation(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount
    );

    /// @notice Emitted when a condition is resolved
    event ConditionResolution(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount,
        uint256[] payoutNumerators
    );

    /// @notice Emitted when positions are split
    event PositionSplit(
        address indexed stakeholder,
        IERC20 collateralToken,
        bytes32 indexed parentCollectionId,
        bytes32 indexed conditionId,
        uint256[] partition,
        uint256 amount
    );

    /// @notice Emitted when positions are merged
    event PositionsMerge(
        address indexed stakeholder,
        IERC20 collateralToken,
        bytes32 indexed parentCollectionId,
        bytes32 indexed conditionId,
        uint256[] partition,
        uint256 amount
    );

    /// @notice Emitted when positions are redeemed
    event PayoutRedemption(
        address indexed redeemer,
        IERC20 indexed collateralToken,
        bytes32 indexed parentCollectionId,
        bytes32 conditionId,
        uint256[] indexSets,
        uint256 payout
    );

    /// @notice Condition information
    struct Condition {
        address oracle;
        bytes32 questionId;
        uint256 outcomeSlotCount;
        uint256[] payoutNumerators;
        uint256 payoutDenominator;
        bool resolved;
    }

    /// @notice Mapping from conditionId to Condition data
    mapping(bytes32 => Condition) private _conditions;

    /// @notice Mapping from collectionId to position data
    mapping(bytes32 => uint256) public collectionIds;

    constructor() ERC1155("") Ownable(msg.sender) {}

    /**
     * @notice Prepare a condition for binary or multi-outcome predictions
     * @param oracle Address that can report the outcome
     * @param questionId Unique identifier for the question
     * @param outcomeSlotCount Number of possible outcomes (2 for binary)
     * @return conditionId Unique identifier for this condition
     */
    function prepareCondition(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) external returns (bytes32 conditionId) {
        require(outcomeSlotCount > 1, "At least 2 outcomes required");
        require(outcomeSlotCount <= 256, "Too many outcomes");

        conditionId = keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
        
        require(_conditions[conditionId].oracle == address(0), "Condition already prepared");

        Condition storage condition = _conditions[conditionId];
        condition.oracle = oracle;
        condition.questionId = questionId;
        condition.outcomeSlotCount = outcomeSlotCount;
        condition.resolved = false;
        condition.payoutDenominator = 0;

        emit ConditionPreparation(conditionId, oracle, questionId, outcomeSlotCount);
    }

    /**
     * @notice Report the payout for a condition
     * @param questionId Question identifier
     * @param payouts Array of payout numerators for each outcome
     */
    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external {
        uint256 outcomeSlotCount = payouts.length;
        bytes32 conditionId = keccak256(
            abi.encodePacked(msg.sender, questionId, outcomeSlotCount)
        );

        Condition storage condition = _conditions[conditionId];
        require(condition.oracle == msg.sender, "Not the oracle");
        require(!condition.resolved, "Already resolved");
        require(payouts.length == condition.outcomeSlotCount, "Invalid payout array length");

        uint256 den = 0;
        for (uint256 i = 0; i < payouts.length; i++) {
            den += payouts[i];
        }
        require(den > 0, "Payout denominator must be positive");

        condition.payoutNumerators = payouts;
        condition.payoutDenominator = den;
        condition.resolved = true;

        emit ConditionResolution(
            conditionId,
            msg.sender,
            questionId,
            outcomeSlotCount,
            payouts
        );
    }

    /**
     * @notice Split collateral into conditional tokens
     * @param collateralToken ERC20 token used as collateral
     * @param parentCollectionId Collection ID for deep positions (0x0 for base)
     * @param conditionId Condition identifier
     * @param partition Array of outcome index sets to split into
     * @param amount Amount of collateral to split
     */
    function splitPosition(
        IERC20 collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(partition.length > 1, "Partition must have at least 2 parts");

        Condition storage condition = _conditions[conditionId];
        require(condition.oracle != address(0), "Condition not prepared");
        require(!condition.resolved, "Condition already resolved");

        // Validate partition
        uint256 fullIndexSet = (1 << condition.outcomeSlotCount) - 1;
        uint256 freeIndexSet = fullIndexSet;
        for (uint256 i = 0; i < partition.length; i++) {
            require(partition[i] > 0, "Invalid partition");
            require(partition[i] & freeIndexSet == partition[i], "Partition overlap");
            freeIndexSet ^= partition[i];
        }

        // Transfer collateral from user
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);

        // Mint conditional tokens for each partition
        uint256[] memory ids = new uint256[](partition.length);
        uint256[] memory amounts = new uint256[](partition.length);
        
        for (uint256 i = 0; i < partition.length; i++) {
            bytes32 collectionId = getCollectionId(parentCollectionId, conditionId, partition[i]);
            uint256 positionId = getPositionId(collateralToken, collectionId);
            
            ids[i] = positionId;
            amounts[i] = amount;
        }

        _mintBatch(msg.sender, ids, amounts, "");

        emit PositionSplit(
            msg.sender,
            collateralToken,
            parentCollectionId,
            conditionId,
            partition,
            amount
        );
    }

    /**
     * @notice Merge conditional tokens back into collateral
     * @param collateralToken ERC20 token used as collateral
     * @param parentCollectionId Collection ID for deep positions
     * @param conditionId Condition identifier
     * @param partition Array of outcome index sets to merge
     * @param amount Amount to merge
     */
    function mergePositions(
        IERC20 collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        require(partition.length > 1, "Partition must have at least 2 parts");

        // Burn conditional tokens for each partition
        uint256[] memory ids = new uint256[](partition.length);
        uint256[] memory amounts = new uint256[](partition.length);
        
        for (uint256 i = 0; i < partition.length; i++) {
            bytes32 collectionId = getCollectionId(parentCollectionId, conditionId, partition[i]);
            uint256 positionId = getPositionId(collateralToken, collectionId);
            
            ids[i] = positionId;
            amounts[i] = amount;
        }

        _burnBatch(msg.sender, ids, amounts);

        // Return collateral to user
        collateralToken.safeTransfer(msg.sender, amount);

        emit PositionsMerge(
            msg.sender,
            collateralToken,
            parentCollectionId,
            conditionId,
            partition,
            amount
        );
    }

    /**
     * @notice Redeem positions for resolved condition
     * @param collateralToken ERC20 token used as collateral
     * @param parentCollectionId Collection ID
     * @param conditionId Condition identifier
     * @param indexSets Array of index sets to redeem
     */
    function redeemPositions(
        IERC20 collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external nonReentrant {
        Condition storage condition = _conditions[conditionId];
        require(condition.resolved, "Condition not resolved");

        uint256 totalPayout = 0;
        uint256[] memory ids = new uint256[](indexSets.length);
        uint256[] memory amounts = new uint256[](indexSets.length);

        for (uint256 i = 0; i < indexSets.length; i++) {
            bytes32 collectionId = getCollectionId(parentCollectionId, conditionId, indexSets[i]);
            uint256 positionId = getPositionId(collateralToken, collectionId);
            uint256 balance = balanceOf(msg.sender, positionId);

            require(balance > 0, "No balance to redeem");

            // Calculate payout for this index set
            uint256 payoutNumerator = 0;
            for (uint256 j = 0; j < condition.outcomeSlotCount; j++) {
                if (indexSets[i] & (1 << j) != 0) {
                    payoutNumerator += condition.payoutNumerators[j];
                }
            }

            uint256 payout = (balance * payoutNumerator) / condition.payoutDenominator;
            totalPayout += payout;

            ids[i] = positionId;
            amounts[i] = balance;
        }

        // Burn redeemed positions
        _burnBatch(msg.sender, ids, amounts);

        // Transfer payout
        if (totalPayout > 0) {
            collateralToken.safeTransfer(msg.sender, totalPayout);
        }

        emit PayoutRedemption(
            msg.sender,
            collateralToken,
            parentCollectionId,
            conditionId,
            indexSets,
            totalPayout
        );
    }

    /**
     * @notice Get collection ID for a condition and index set
     * @param parentCollectionId Parent collection ID
     * @param conditionId Condition identifier
     * @param indexSet Index set for outcomes
     * @return Collection ID
     */
    function getCollectionId(
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256 indexSet
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentCollectionId, conditionId, indexSet));
    }

    /**
     * @notice Get position ID for a collateral token and collection
     * @param collateralToken Collateral token address
     * @param collectionId Collection identifier
     * @return Position ID (used as ERC1155 token ID)
     */
    function getPositionId(IERC20 collateralToken, bytes32 collectionId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(collateralToken, collectionId)));
    }

    /**
     * @notice Get condition ID
     * @param oracle Oracle address
     * @param questionId Question identifier
     * @param outcomeSlotCount Number of outcomes
     * @return Condition ID
     */
    function getConditionId(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
    }

    /**
     * @notice Get condition details
     * @param conditionId Condition identifier
     * @return oracle Oracle address
     * @return questionId Question identifier
     * @return outcomeSlotCount Number of outcomes
     * @return resolved Whether condition is resolved
     */
    function getCondition(bytes32 conditionId) external view returns (
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount,
        bool resolved
    ) {
        Condition storage condition = _conditions[conditionId];
        return (
            condition.oracle,
            condition.questionId,
            condition.outcomeSlotCount,
            condition.resolved
        );
    }

    /**
     * @notice Check if a condition is resolved
     * @param conditionId Condition identifier
     * @return Whether the condition is resolved
     */
    function isResolved(bytes32 conditionId) external view returns (bool) {
        return _conditions[conditionId].resolved;
    }

    /**
     * @notice Get payout numerators for a resolved condition
     * @param conditionId Condition identifier
     * @return Payout numerators array
     */
    function getPayoutNumerators(bytes32 conditionId) external view returns (uint256[] memory) {
        require(_conditions[conditionId].resolved, "Condition not resolved");
        return _conditions[conditionId].payoutNumerators;
    }

    /**
     * @notice Get payout denominator for a resolved condition
     * @param conditionId Condition identifier
     * @return Payout denominator
     */
    function getPayoutDenominator(bytes32 conditionId) external view returns (uint256) {
        require(_conditions[conditionId].resolved, "Condition not resolved");
        return _conditions[conditionId].payoutDenominator;
    }
}
