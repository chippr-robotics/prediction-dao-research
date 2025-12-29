// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title PredictionMarketExchange
 * @notice Permissionless order matching with CTF 1155 integration
 * @dev Gas-optimized exchange for ETC with EIP-712 signature verification
 * 
 * Features:
 * - Three matching modes: single fill, batch fill, maker-to-maker
 * - EIP-712 signature verification for off-chain order submission
 * - Nonce-based cancellation system
 * - Fee mechanism (0.1% default, configurable)
 * - Gas-optimized for ETC (~150k per order)
 * - CTF 1155 token support for conditional outcomes
 * 
 * Based on pmkt/1 protocol specification and Polymarket CLOB design
 */
contract PredictionMarketExchange is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    /// @notice Order structure for EIP-712 typed data
    struct Order {
        address maker;           // Order creator
        address makerAsset;      // Token maker is selling (CTF 1155 or ERC20)
        address takerAsset;      // Token maker wants to buy
        uint256 makerAmount;     // Amount maker is selling
        uint256 takerAmount;     // Amount maker wants to receive
        uint256 nonce;           // Unique nonce for cancellation
        uint256 expiration;      // Order expiration timestamp
        bytes32 salt;            // Random salt for uniqueness
        bool isMakerERC1155;     // True if maker asset is ERC1155
        bool isTakerERC1155;     // True if taker asset is ERC1155
        uint256 makerTokenId;    // Token ID if ERC1155 (0 for ERC20)
        uint256 takerTokenId;    // Token ID if ERC1155 (0 for ERC20)
    }

    /// @notice Fill result for batch operations
    struct FillResult {
        bool success;
        uint256 filledAmount;
        string reason;
    }

    /// @notice EIP-712 type hash for Order
    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address maker,address makerAsset,address takerAsset,uint256 makerAmount,uint256 takerAmount,uint256 nonce,uint256 expiration,bytes32 salt,bool isMakerERC1155,bool isTakerERC1155,uint256 makerTokenId,uint256 takerTokenId)"
    );

    /// @notice Default fee in basis points (0.1% = 10 bps)
    uint256 public feeBps = 10;
    uint256 public constant MAX_FEE_BPS = 100; // Max 1%

    /// @notice Fee recipient address
    address public feeRecipient;

    /// @notice Mapping from order hash to filled amount
    mapping(bytes32 => uint256) public filled;

    /// @notice Mapping from maker address to nonce to cancellation status
    mapping(address => mapping(uint256 => bool)) public cancelledNonces;

    /// @notice Events
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        address makerAsset,
        address takerAsset,
        uint256 makerAmount,
        uint256 takerAmount,
        uint256 makerFilled,
        uint256 takerFilled,
        uint256 fee
    );

    event OrderCancelled(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 indexed nonce
    );

    event BatchOrdersFilled(
        uint256 successCount,
        uint256 totalOrders,
        uint256 totalFees
    );

    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    constructor(address _feeRecipient) 
        EIP712("PredictionMarketExchange", "1")
        Ownable(msg.sender) 
    {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }

    /**
     * @notice Fill a single order
     * @param order Order to fill
     * @param signature EIP-712 signature from maker
     * @param takerAmount Amount taker wants to fill
     * @return actualMakerAmount Amount actually transferred from maker
     * @return actualTakerAmount Amount actually transferred from taker
     */
    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        uint256 takerAmount
    ) external nonReentrant returns (uint256 actualMakerAmount, uint256 actualTakerAmount) {
        // Verify order
        bytes32 orderHash = _hashOrder(order);
        require(_verifySignature(orderHash, order.maker, signature), "Invalid signature");
        require(block.timestamp <= order.expiration, "Order expired");
        require(!cancelledNonces[order.maker][order.nonce], "Order cancelled");
        require(takerAmount > 0, "Invalid taker amount");

        // Calculate fill amounts
        uint256 remainingMaker = order.makerAmount - filled[orderHash];
        require(remainingMaker > 0, "Order fully filled");

        // Calculate proportional amounts
        uint256 takerFillAmount = takerAmount;
        if (takerFillAmount > order.takerAmount - (filled[orderHash] * order.takerAmount / order.makerAmount)) {
            takerFillAmount = order.takerAmount - (filled[orderHash] * order.takerAmount / order.makerAmount);
        }

        uint256 makerFillAmount = (takerFillAmount * order.makerAmount) / order.takerAmount;
        require(makerFillAmount <= remainingMaker, "Exceeds remaining");

        // Calculate fee (taken from taker)
        uint256 fee = (takerFillAmount * feeBps) / 10000;
        uint256 takerAmountAfterFee = takerFillAmount - fee;

        // Update filled amount
        filled[orderHash] += makerFillAmount;

        // Execute transfers
        if (order.isMakerERC1155) {
            IERC1155(order.makerAsset).safeTransferFrom(
                order.maker,
                msg.sender,
                order.makerTokenId,
                makerFillAmount,
                ""
            );
        } else {
            IERC20(order.makerAsset).safeTransferFrom(
                order.maker,
                msg.sender,
                makerFillAmount
            );
        }

        if (order.isTakerERC1155) {
            IERC1155(order.takerAsset).safeTransferFrom(
                msg.sender,
                order.maker,
                order.takerTokenId,
                takerAmountAfterFee,
                ""
            );
            if (fee > 0) {
                IERC1155(order.takerAsset).safeTransferFrom(
                    msg.sender,
                    feeRecipient,
                    order.takerTokenId,
                    fee,
                    ""
                );
            }
        } else {
            IERC20(order.takerAsset).safeTransferFrom(
                msg.sender,
                order.maker,
                takerAmountAfterFee
            );
            if (fee > 0) {
                IERC20(order.takerAsset).safeTransferFrom(
                    msg.sender,
                    feeRecipient,
                    fee
                );
            }
        }

        emit OrderFilled(
            orderHash,
            order.maker,
            msg.sender,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount,
            makerFillAmount,
            takerFillAmount,
            fee
        );

        return (makerFillAmount, takerFillAmount);
    }

    /**
     * @notice Fill multiple orders in a single transaction
     * @param orders Array of orders to fill
     * @param signatures Array of EIP-712 signatures
     * @param takerAmounts Array of amounts to fill for each order
     * @return results Array of fill results
     */
    function batchFillOrders(
        Order[] calldata orders,
        bytes[] calldata signatures,
        uint256[] calldata takerAmounts
    ) external nonReentrant returns (FillResult[] memory results) {
        require(orders.length == signatures.length, "Length mismatch");
        require(orders.length == takerAmounts.length, "Length mismatch");
        require(orders.length > 0 && orders.length <= 50, "Invalid batch size");

        results = new FillResult[](orders.length);
        uint256 successCount = 0;
        uint256 totalFees = 0;

        for (uint256 i = 0; i < orders.length; i++) {
            try this.fillOrderInternal(orders[i], signatures[i], takerAmounts[i]) 
                returns (uint256, uint256, uint256 fee) 
            {
                results[i] = FillResult(true, takerAmounts[i], "");
                successCount++;
                totalFees += fee;
            } catch Error(string memory reason) {
                results[i] = FillResult(false, 0, reason);
            } catch {
                results[i] = FillResult(false, 0, "Unknown error");
            }
        }

        emit BatchOrdersFilled(successCount, orders.length, totalFees);
    }

    /**
     * @notice Internal function for batch fills (called via try/catch)
     * @param order Order to fill
     * @param signature EIP-712 signature
     * @param takerAmount Amount to fill
     * @return makerAmount Amount from maker
     * @return actualTakerAmount Amount from taker
     * @return fee Fee amount
     */
    function fillOrderInternal(
        Order calldata order,
        bytes calldata signature,
        uint256 takerAmount
    ) external returns (uint256 makerAmount, uint256 actualTakerAmount, uint256 fee) {
        require(msg.sender == address(this), "Internal only");
        
        // Verify order
        bytes32 orderHash = _hashOrder(order);
        require(_verifySignature(orderHash, order.maker, signature), "Invalid signature");
        require(block.timestamp <= order.expiration, "Order expired");
        require(!cancelledNonces[order.maker][order.nonce], "Order cancelled");
        require(takerAmount > 0, "Invalid taker amount");

        // Calculate fill amounts
        uint256 remainingMaker = order.makerAmount - filled[orderHash];
        require(remainingMaker > 0, "Order fully filled");

        uint256 takerFillAmount = takerAmount;
        if (takerFillAmount > order.takerAmount - (filled[orderHash] * order.takerAmount / order.makerAmount)) {
            takerFillAmount = order.takerAmount - (filled[orderHash] * order.takerAmount / order.makerAmount);
        }

        uint256 makerFillAmount = (takerFillAmount * order.makerAmount) / order.takerAmount;
        require(makerFillAmount <= remainingMaker, "Exceeds remaining");

        // Calculate fee
        fee = (takerFillAmount * feeBps) / 10000;
        uint256 takerAmountAfterFee = takerFillAmount - fee;

        // Update filled amount
        filled[orderHash] += makerFillAmount;

        // Execute transfers
        if (order.isMakerERC1155) {
            IERC1155(order.makerAsset).safeTransferFrom(
                order.maker,
                tx.origin,
                order.makerTokenId,
                makerFillAmount,
                ""
            );
        } else {
            IERC20(order.makerAsset).safeTransferFrom(
                order.maker,
                tx.origin,
                makerFillAmount
            );
        }

        if (order.isTakerERC1155) {
            IERC1155(order.takerAsset).safeTransferFrom(
                tx.origin,
                order.maker,
                order.takerTokenId,
                takerAmountAfterFee,
                ""
            );
            if (fee > 0) {
                IERC1155(order.takerAsset).safeTransferFrom(
                    tx.origin,
                    feeRecipient,
                    order.takerTokenId,
                    fee,
                    ""
                );
            }
        } else {
            IERC20(order.takerAsset).safeTransferFrom(
                tx.origin,
                order.maker,
                takerAmountAfterFee
            );
            if (fee > 0) {
                IERC20(order.takerAsset).safeTransferFrom(
                    tx.origin,
                    feeRecipient,
                    fee
                );
            }
        }

        emit OrderFilled(
            orderHash,
            order.maker,
            tx.origin,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount,
            makerFillAmount,
            takerFillAmount,
            fee
        );

        return (makerFillAmount, takerFillAmount, fee);
    }

    /**
     * @notice Match two maker orders directly (maker-to-maker)
     * @param orderA First maker order
     * @param signatureA Signature for orderA
     * @param orderB Second maker order
     * @param signatureB Signature for orderB
     * @param fillAmount Amount to match
     */
    function matchOrders(
        Order calldata orderA,
        bytes calldata signatureA,
        Order calldata orderB,
        bytes calldata signatureB,
        uint256 fillAmount
    ) external nonReentrant {
        // Verify both orders are compatible
        require(orderA.makerAsset == orderB.takerAsset, "Assets don't match");
        require(orderA.takerAsset == orderB.makerAsset, "Assets don't match");
        require(orderA.makerTokenId == orderB.takerTokenId, "Token IDs don't match");
        require(orderA.takerTokenId == orderB.makerTokenId, "Token IDs don't match");

        // Verify signatures
        bytes32 hashA = _hashOrder(orderA);
        bytes32 hashB = _hashOrder(orderB);
        require(_verifySignature(hashA, orderA.maker, signatureA), "Invalid signature A");
        require(_verifySignature(hashB, orderB.maker, signatureB), "Invalid signature B");

        // Verify orders not expired or cancelled
        require(block.timestamp <= orderA.expiration, "Order A expired");
        require(block.timestamp <= orderB.expiration, "Order B expired");
        require(!cancelledNonces[orderA.maker][orderA.nonce], "Order A cancelled");
        require(!cancelledNonces[orderB.maker][orderB.nonce], "Order B cancelled");

        // Calculate fills
        uint256 remainingA = orderA.makerAmount - filled[hashA];
        uint256 remainingB = orderB.makerAmount - filled[hashB];
        require(remainingA > 0 && remainingB > 0, "Orders fully filled");
        require(fillAmount <= remainingA && fillAmount <= remainingB, "Exceeds remaining");

        // Update filled amounts
        filled[hashA] += fillAmount;
        filled[hashB] += fillAmount;

        // Calculate fees (split between both makers)
        uint256 feeA = (fillAmount * feeBps) / 20000; // Half fee each
        uint256 feeB = (fillAmount * feeBps) / 20000;

        // Execute transfers (A -> B and B -> A)
        if (orderA.isMakerERC1155) {
            IERC1155(orderA.makerAsset).safeTransferFrom(
                orderA.maker,
                orderB.maker,
                orderA.makerTokenId,
                fillAmount - feeA,
                ""
            );
            if (feeA > 0) {
                IERC1155(orderA.makerAsset).safeTransferFrom(
                    orderA.maker,
                    feeRecipient,
                    orderA.makerTokenId,
                    feeA,
                    ""
                );
            }
        } else {
            IERC20(orderA.makerAsset).safeTransferFrom(
                orderA.maker,
                orderB.maker,
                fillAmount - feeA
            );
            if (feeA > 0) {
                IERC20(orderA.makerAsset).safeTransferFrom(
                    orderA.maker,
                    feeRecipient,
                    feeA
                );
            }
        }

        if (orderB.isMakerERC1155) {
            IERC1155(orderB.makerAsset).safeTransferFrom(
                orderB.maker,
                orderA.maker,
                orderB.makerTokenId,
                fillAmount - feeB,
                ""
            );
            if (feeB > 0) {
                IERC1155(orderB.makerAsset).safeTransferFrom(
                    orderB.maker,
                    feeRecipient,
                    orderB.makerTokenId,
                    feeB,
                    ""
                );
            }
        } else {
            IERC20(orderB.makerAsset).safeTransferFrom(
                orderB.maker,
                orderA.maker,
                fillAmount - feeB
            );
            if (feeB > 0) {
                IERC20(orderB.makerAsset).safeTransferFrom(
                    orderB.maker,
                    feeRecipient,
                    feeB
                );
            }
        }

        emit OrderFilled(hashA, orderA.maker, orderB.maker, orderA.makerAsset, orderA.takerAsset, 
                         orderA.makerAmount, orderA.takerAmount, fillAmount, fillAmount, feeA);
        emit OrderFilled(hashB, orderB.maker, orderA.maker, orderB.makerAsset, orderB.takerAsset,
                         orderB.makerAmount, orderB.takerAmount, fillAmount, fillAmount, feeB);
    }

    /**
     * @notice Cancel an order by nonce
     * @param nonce Nonce of the order to cancel
     */
    function cancelOrder(uint256 nonce) external {
        require(!cancelledNonces[msg.sender][nonce], "Already cancelled");
        cancelledNonces[msg.sender][nonce] = true;
        
        // Calculate order hash for event (approximation)
        bytes32 orderHash = keccak256(abi.encodePacked(msg.sender, nonce));
        emit OrderCancelled(orderHash, msg.sender, nonce);
    }

    /**
     * @notice Cancel multiple orders by nonce
     * @param nonces Array of nonces to cancel
     */
    function batchCancelOrders(uint256[] calldata nonces) external {
        for (uint256 i = 0; i < nonces.length; i++) {
            if (!cancelledNonces[msg.sender][nonces[i]]) {
                cancelledNonces[msg.sender][nonces[i]] = true;
                bytes32 orderHash = keccak256(abi.encodePacked(msg.sender, nonces[i]));
                emit OrderCancelled(orderHash, msg.sender, nonces[i]);
            }
        }
    }

    /**
     * @notice Update fee in basis points
     * @param newFeeBps New fee (max 100 bps = 1%)
     */
    function setFeeBps(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");
        uint256 oldFee = feeBps;
        feeBps = newFeeBps;
        emit FeeUpdated(oldFee, newFeeBps);
    }

    /**
     * @notice Update fee recipient
     * @param newRecipient New fee recipient address
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    /**
     * @notice Get order hash for EIP-712 signature
     * @param order Order to hash
     * @return Order hash
     */
    function getOrderHash(Order calldata order) external view returns (bytes32) {
        return _hashOrder(order);
    }

    /**
     * @notice Get filled amount for an order
     * @param orderHash Order hash
     * @return Filled amount
     */
    function getFilledAmount(bytes32 orderHash) external view returns (uint256) {
        return filled[orderHash];
    }

    /**
     * @notice Check if order is cancelled
     * @param maker Maker address
     * @param nonce Order nonce
     * @return Whether order is cancelled
     */
    function isCancelled(address maker, uint256 nonce) external view returns (bool) {
        return cancelledNonces[maker][nonce];
    }

    /**
     * @notice Internal function to hash order for EIP-712
     * @param order Order to hash
     * @return Order hash
     */
    function _hashOrder(Order calldata order) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.maker,
                    order.makerAsset,
                    order.takerAsset,
                    order.makerAmount,
                    order.takerAmount,
                    order.nonce,
                    order.expiration,
                    order.salt,
                    order.isMakerERC1155,
                    order.isTakerERC1155,
                    order.makerTokenId,
                    order.takerTokenId
                )
            )
        );
    }

    /**
     * @notice Verify EIP-712 signature
     * @param orderHash Order hash
     * @param maker Expected maker address
     * @param signature Signature to verify
     * @return Whether signature is valid
     */
    function _verifySignature(
        bytes32 orderHash,
        address maker,
        bytes calldata signature
    ) internal pure returns (bool) {
        address recovered = orderHash.recover(signature);
        return recovered == maker;
    }

    /**
     * @notice Required for ERC1155 token reception
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    /**
     * @notice Required for ERC1155 batch reception
     */
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
