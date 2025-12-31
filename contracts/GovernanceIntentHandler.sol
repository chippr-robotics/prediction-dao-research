// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "./ConditionalMarketFactory.sol";
import "./CTF1155.sol";

/**
 * @title GovernanceIntentHandler
 * @notice EIP-712 signature handler for governance intents on ERC1155 CFT tokens
 * @dev Allows participants to submit signed intents for governance actions
 * 
 * Features:
 * - EIP-712 typed data signing for all participant actions
 * - Support for trading intents on CTF1155 conditional tokens
 * - Support for voting intents on governance proposals
 * - Nonce-based replay protection
 * - Deadline-based expiration
 * - Batch intent processing
 * 
 * Intent Types:
 * - TradeIntent: Buy/sell CTF1155 position tokens
 * - VoteIntent: Cast vote on governance proposal (delegated)
 * - SplitIntent: Split collateral into position tokens
 * - MergeIntent: Merge position tokens back to collateral
 * - RedeemIntent: Redeem winning positions after resolution
 */
contract GovernanceIntentHandler is EIP712, Ownable, ReentrancyGuard, ERC1155Holder {
    using ECDSA for bytes32;

    // ============ Structs ============

    /// @notice Trade intent for buying/selling CTF1155 positions
    struct TradeIntent {
        address participant;      // Intent signer
        uint256 marketId;         // Target market
        bool buyPass;             // True for pass, false for fail
        uint256 amount;           // Amount of collateral (buy) or tokens (sell)
        bool isBuy;               // True for buy, false for sell
        uint256 minAmountOut;     // Minimum output for slippage protection
        uint256 nonce;            // Unique nonce for replay protection
        uint256 deadline;         // Expiration timestamp
    }

    /// @notice Split intent for converting collateral to positions
    struct SplitIntent {
        address participant;      // Intent signer
        uint256 marketId;         // Target market
        uint256 amount;           // Collateral amount to split
        uint256 nonce;            // Unique nonce
        uint256 deadline;         // Expiration timestamp
    }

    /// @notice Merge intent for converting positions back to collateral
    struct MergeIntent {
        address participant;      // Intent signer
        uint256 marketId;         // Target market
        uint256 amount;           // Amount to merge
        uint256 nonce;            // Unique nonce
        uint256 deadline;         // Expiration timestamp
    }

    /// @notice Redeem intent for claiming winnings after resolution
    struct RedeemIntent {
        address participant;      // Intent signer
        uint256 marketId;         // Target market
        uint256[] indexSets;      // Position index sets to redeem
        uint256 nonce;            // Unique nonce
        uint256 deadline;         // Expiration timestamp
    }

    // ============ Type Hashes ============

    bytes32 public constant TRADE_INTENT_TYPEHASH = keccak256(
        "TradeIntent(address participant,uint256 marketId,bool buyPass,uint256 amount,bool isBuy,uint256 minAmountOut,uint256 nonce,uint256 deadline)"
    );

    bytes32 public constant SPLIT_INTENT_TYPEHASH = keccak256(
        "SplitIntent(address participant,uint256 marketId,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    bytes32 public constant MERGE_INTENT_TYPEHASH = keccak256(
        "MergeIntent(address participant,uint256 marketId,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    bytes32 public constant REDEEM_INTENT_TYPEHASH = keccak256(
        "RedeemIntent(address participant,uint256 marketId,uint256[] indexSets,uint256 nonce,uint256 deadline)"
    );

    // ============ State Variables ============

    /// @notice Reference to ConditionalMarketFactory
    ConditionalMarketFactory public marketFactory;

    /// @notice Reference to CTF1155
    CTF1155 public ctf1155;

    /// @notice Nonces for replay protection (participant => nonce => used)
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice Trusted executors who can submit intents on behalf of participants
    mapping(address => bool) public trustedExecutors;

    // ============ Events ============

    event TradeIntentExecuted(
        address indexed participant,
        uint256 indexed marketId,
        bool buyPass,
        uint256 amount,
        uint256 amountOut,
        uint256 nonce
    );

    event SplitIntentExecuted(
        address indexed participant,
        uint256 indexed marketId,
        uint256 amount,
        uint256 nonce
    );

    event MergeIntentExecuted(
        address indexed participant,
        uint256 indexed marketId,
        uint256 amount,
        uint256 nonce
    );

    event RedeemIntentExecuted(
        address indexed participant,
        uint256 indexed marketId,
        uint256 payout,
        uint256 nonce
    );

    event TrustedExecutorUpdated(address indexed executor, bool trusted);
    event NonceInvalidated(address indexed participant, uint256 nonce);

    // ============ Errors ============

    error InvalidSignature();
    error ExpiredIntent();
    error NonceAlreadyUsed();
    error InvalidMarket();
    error SlippageExceeded();
    error UnauthorizedExecutor();
    error ZeroAmount();

    // ============ Constructor ============

    constructor(
        address _marketFactory,
        address _ctf1155
    ) EIP712("GovernanceIntentHandler", "1") Ownable(msg.sender) {
        require(_marketFactory != address(0), "Invalid market factory");
        require(_ctf1155 != address(0), "Invalid CTF1155");
        
        marketFactory = ConditionalMarketFactory(_marketFactory);
        ctf1155 = CTF1155(_ctf1155);
    }

    // ============ External Functions ============

    /**
     * @notice Execute a trade intent with EIP-712 signature
     * @param intent The trade intent details
     * @param signature EIP-712 signature from participant
     * @return amountOut Amount of tokens received
     */
    function executeTradeIntent(
        TradeIntent calldata intent,
        bytes calldata signature
    ) external nonReentrant returns (uint256 amountOut) {
        // Validate intent
        _validateTradeIntent(intent, signature);

        // Mark nonce as used
        usedNonces[intent.participant][intent.nonce] = true;

        // Get market info
        ConditionalMarketFactory.Market memory market = marketFactory.getMarket(intent.marketId);
        if (market.status != ConditionalMarketFactory.MarketStatus.Active) {
            revert InvalidMarket();
        }

        // Execute trade through market factory
        // The participant must have approved this contract to spend their tokens
        if (intent.isBuy) {
            // For buy: transfer collateral from participant to this contract, then buy
            IERC20(market.collateralToken).transferFrom(intent.participant, address(this), intent.amount);
            IERC20(market.collateralToken).approve(address(marketFactory), intent.amount);
            
            amountOut = marketFactory.buyTokens(intent.marketId, intent.buyPass, intent.amount);
            
            // Transfer resulting tokens to participant
            uint256 positionId = intent.buyPass ? market.passPositionId : market.failPositionId;
            ctf1155.safeTransferFrom(address(this), intent.participant, positionId, amountOut, "");
        } else {
            // For sell: transfer position tokens from participant, then sell
            uint256 positionId = intent.buyPass ? market.passPositionId : market.failPositionId;
            ctf1155.safeTransferFrom(intent.participant, address(this), positionId, intent.amount, "");
            
            amountOut = marketFactory.sellTokens(intent.marketId, intent.buyPass, intent.amount);
            
            // Transfer collateral back to participant
            IERC20(market.collateralToken).transfer(intent.participant, amountOut);
        }

        // Check slippage
        if (amountOut < intent.minAmountOut) {
            revert SlippageExceeded();
        }

        emit TradeIntentExecuted(
            intent.participant,
            intent.marketId,
            intent.buyPass,
            intent.amount,
            amountOut,
            intent.nonce
        );
    }

    /**
     * @notice Execute a split intent with EIP-712 signature
     * @param intent The split intent details
     * @param signature EIP-712 signature from participant
     */
    function executeSplitIntent(
        SplitIntent calldata intent,
        bytes calldata signature
    ) external nonReentrant {
        // Validate intent
        _validateSplitIntent(intent, signature);

        // Mark nonce as used
        usedNonces[intent.participant][intent.nonce] = true;

        // Get market info
        ConditionalMarketFactory.Market memory market = marketFactory.getMarket(intent.marketId);

        // Transfer collateral from participant
        IERC20(market.collateralToken).transferFrom(intent.participant, address(this), intent.amount);
        IERC20(market.collateralToken).approve(address(ctf1155), intent.amount);

        // Split positions
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1; // PASS
        partition[1] = 2; // FAIL

        ctf1155.splitPosition(
            IERC20(market.collateralToken),
            bytes32(0),
            market.conditionId,
            partition,
            intent.amount
        );

        // Transfer both positions to participant
        ctf1155.safeTransferFrom(address(this), intent.participant, market.passPositionId, intent.amount, "");
        ctf1155.safeTransferFrom(address(this), intent.participant, market.failPositionId, intent.amount, "");

        emit SplitIntentExecuted(intent.participant, intent.marketId, intent.amount, intent.nonce);
    }

    /**
     * @notice Execute a merge intent with EIP-712 signature
     * @param intent The merge intent details
     * @param signature EIP-712 signature from participant
     */
    function executeMergeIntent(
        MergeIntent calldata intent,
        bytes calldata signature
    ) external nonReentrant {
        // Validate intent
        _validateMergeIntent(intent, signature);

        // Mark nonce as used
        usedNonces[intent.participant][intent.nonce] = true;

        // Get market info
        ConditionalMarketFactory.Market memory market = marketFactory.getMarket(intent.marketId);

        // Transfer both positions from participant
        ctf1155.safeTransferFrom(intent.participant, address(this), market.passPositionId, intent.amount, "");
        ctf1155.safeTransferFrom(intent.participant, address(this), market.failPositionId, intent.amount, "");

        // Merge positions
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1; // PASS
        partition[1] = 2; // FAIL

        ctf1155.mergePositions(
            IERC20(market.collateralToken),
            bytes32(0),
            market.conditionId,
            partition,
            intent.amount
        );

        // Transfer collateral back to participant
        IERC20(market.collateralToken).transfer(intent.participant, intent.amount);

        emit MergeIntentExecuted(intent.participant, intent.marketId, intent.amount, intent.nonce);
    }

    /**
     * @notice Execute a redeem intent with EIP-712 signature
     * @param intent The redeem intent details
     * @param signature EIP-712 signature from participant
     * @return payout Amount of collateral redeemed
     */
    function executeRedeemIntent(
        RedeemIntent calldata intent,
        bytes calldata signature
    ) external nonReentrant returns (uint256 payout) {
        // Validate intent
        _validateRedeemIntent(intent, signature);

        // Mark nonce as used
        usedNonces[intent.participant][intent.nonce] = true;

        // Get market info
        ConditionalMarketFactory.Market memory market = marketFactory.getMarket(intent.marketId);
        require(market.resolved, "Market not resolved");

        // Transfer positions from participant
        for (uint256 i = 0; i < intent.indexSets.length; i++) {
            bytes32 collectionId = ctf1155.getCollectionId(bytes32(0), market.conditionId, intent.indexSets[i]);
            uint256 positionId = ctf1155.getPositionId(IERC20(market.collateralToken), collectionId);
            uint256 balance = ctf1155.balanceOf(intent.participant, positionId);
            
            if (balance > 0) {
                ctf1155.safeTransferFrom(intent.participant, address(this), positionId, balance, "");
            }
        }

        // Get initial balance
        uint256 balanceBefore = IERC20(market.collateralToken).balanceOf(address(this));

        // Redeem positions
        ctf1155.redeemPositions(
            IERC20(market.collateralToken),
            bytes32(0),
            market.conditionId,
            intent.indexSets
        );

        // Calculate payout
        payout = IERC20(market.collateralToken).balanceOf(address(this)) - balanceBefore;

        // Transfer payout to participant
        if (payout > 0) {
            IERC20(market.collateralToken).transfer(intent.participant, payout);
        }

        emit RedeemIntentExecuted(intent.participant, intent.marketId, payout, intent.nonce);
    }

    /**
     * @notice Batch execute multiple trade intents
     * @param intents Array of trade intents
     * @param signatures Array of signatures
     * @return amountsOut Array of output amounts
     */
    function batchExecuteTradeIntents(
        TradeIntent[] calldata intents,
        bytes[] calldata signatures
    ) external nonReentrant returns (uint256[] memory amountsOut) {
        require(intents.length == signatures.length, "Length mismatch");
        require(intents.length > 0 && intents.length <= 50, "Invalid batch size");

        amountsOut = new uint256[](intents.length);

        for (uint256 i = 0; i < intents.length; i++) {
            // Skip if nonce already used
            if (usedNonces[intents[i].participant][intents[i].nonce]) {
                continue;
            }

            try this.executeTradeIntentInternal(intents[i], signatures[i]) returns (uint256 amount) {
                amountsOut[i] = amount;
            } catch {
                // Silently fail individual intents
                amountsOut[i] = 0;
            }
        }
    }

    /**
     * @notice Invalidate a nonce without executing an intent
     * @param nonce Nonce to invalidate
     */
    function invalidateNonce(uint256 nonce) external {
        usedNonces[msg.sender][nonce] = true;
        emit NonceInvalidated(msg.sender, nonce);
    }

    /**
     * @notice Batch invalidate multiple nonces
     * @param nonces Array of nonces to invalidate
     */
    function batchInvalidateNonces(uint256[] calldata nonces) external {
        for (uint256 i = 0; i < nonces.length; i++) {
            usedNonces[msg.sender][nonces[i]] = true;
            emit NonceInvalidated(msg.sender, nonces[i]);
        }
    }

    // ============ Admin Functions ============

    /**
     * @notice Update trusted executor status
     * @param executor Address of executor
     * @param trusted Whether executor is trusted
     */
    function setTrustedExecutor(address executor, bool trusted) external onlyOwner {
        trustedExecutors[executor] = trusted;
        emit TrustedExecutorUpdated(executor, trusted);
    }

    /**
     * @notice Update market factory reference
     * @param _marketFactory New market factory address
     */
    function setMarketFactory(address _marketFactory) external onlyOwner {
        require(_marketFactory != address(0), "Invalid market factory");
        marketFactory = ConditionalMarketFactory(_marketFactory);
    }

    /**
     * @notice Update CTF1155 reference
     * @param _ctf1155 New CTF1155 address
     */
    function setCTF1155(address _ctf1155) external onlyOwner {
        require(_ctf1155 != address(0), "Invalid CTF1155");
        ctf1155 = CTF1155(_ctf1155);
    }

    // ============ View Functions ============

    /**
     * @notice Get EIP-712 domain separator
     * @return Domain separator hash
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Hash a trade intent for signing
     * @param intent Trade intent to hash
     * @return Intent hash for EIP-712 signature
     */
    function hashTradeIntent(TradeIntent calldata intent) external view returns (bytes32) {
        return _hashTypedDataV4(_hashTradeIntentStruct(intent));
    }

    /**
     * @notice Hash a split intent for signing
     * @param intent Split intent to hash
     * @return Intent hash for EIP-712 signature
     */
    function hashSplitIntent(SplitIntent calldata intent) external view returns (bytes32) {
        return _hashTypedDataV4(_hashSplitIntentStruct(intent));
    }

    /**
     * @notice Hash a merge intent for signing
     * @param intent Merge intent to hash
     * @return Intent hash for EIP-712 signature
     */
    function hashMergeIntent(MergeIntent calldata intent) external view returns (bytes32) {
        return _hashTypedDataV4(_hashMergeIntentStruct(intent));
    }

    /**
     * @notice Hash a redeem intent for signing
     * @param intent Redeem intent to hash
     * @return Intent hash for EIP-712 signature
     */
    function hashRedeemIntent(RedeemIntent calldata intent) external view returns (bytes32) {
        return _hashTypedDataV4(_hashRedeemIntentStruct(intent));
    }

    /**
     * @notice Check if a nonce has been used
     * @param participant Participant address
     * @param nonce Nonce to check
     * @return Whether nonce is used
     */
    function isNonceUsed(address participant, uint256 nonce) external view returns (bool) {
        return usedNonces[participant][nonce];
    }

    // ============ Internal Functions ============

    /**
     * @notice Internal function for batch execution (allows try/catch)
     */
    function executeTradeIntentInternal(
        TradeIntent calldata intent,
        bytes calldata signature
    ) external returns (uint256) {
        require(msg.sender == address(this), "Internal only");
        return this.executeTradeIntent(intent, signature);
    }

    function _validateTradeIntent(
        TradeIntent calldata intent,
        bytes calldata signature
    ) internal view {
        if (intent.amount == 0) revert ZeroAmount();
        if (block.timestamp > intent.deadline) revert ExpiredIntent();
        if (usedNonces[intent.participant][intent.nonce]) revert NonceAlreadyUsed();

        bytes32 structHash = _hashTradeIntentStruct(intent);
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (signer != intent.participant) revert InvalidSignature();
    }

    function _validateSplitIntent(
        SplitIntent calldata intent,
        bytes calldata signature
    ) internal view {
        if (intent.amount == 0) revert ZeroAmount();
        if (block.timestamp > intent.deadline) revert ExpiredIntent();
        if (usedNonces[intent.participant][intent.nonce]) revert NonceAlreadyUsed();

        bytes32 structHash = _hashSplitIntentStruct(intent);
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (signer != intent.participant) revert InvalidSignature();
    }

    function _validateMergeIntent(
        MergeIntent calldata intent,
        bytes calldata signature
    ) internal view {
        if (intent.amount == 0) revert ZeroAmount();
        if (block.timestamp > intent.deadline) revert ExpiredIntent();
        if (usedNonces[intent.participant][intent.nonce]) revert NonceAlreadyUsed();

        bytes32 structHash = _hashMergeIntentStruct(intent);
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (signer != intent.participant) revert InvalidSignature();
    }

    function _validateRedeemIntent(
        RedeemIntent calldata intent,
        bytes calldata signature
    ) internal view {
        if (block.timestamp > intent.deadline) revert ExpiredIntent();
        if (usedNonces[intent.participant][intent.nonce]) revert NonceAlreadyUsed();

        bytes32 structHash = _hashRedeemIntentStruct(intent);
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (signer != intent.participant) revert InvalidSignature();
    }

    function _hashTradeIntentStruct(TradeIntent calldata intent) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TRADE_INTENT_TYPEHASH,
                intent.participant,
                intent.marketId,
                intent.buyPass,
                intent.amount,
                intent.isBuy,
                intent.minAmountOut,
                intent.nonce,
                intent.deadline
            )
        );
    }

    function _hashSplitIntentStruct(SplitIntent calldata intent) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                SPLIT_INTENT_TYPEHASH,
                intent.participant,
                intent.marketId,
                intent.amount,
                intent.nonce,
                intent.deadline
            )
        );
    }

    function _hashMergeIntentStruct(MergeIntent calldata intent) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MERGE_INTENT_TYPEHASH,
                intent.participant,
                intent.marketId,
                intent.amount,
                intent.nonce,
                intent.deadline
            )
        );
    }

    function _hashRedeemIntentStruct(RedeemIntent calldata intent) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                REDEEM_INTENT_TYPEHASH,
                intent.participant,
                intent.marketId,
                keccak256(abi.encodePacked(intent.indexSets)),
                intent.nonce,
                intent.deadline
            )
        );
    }
}
