// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MembershipPaymentManager
 * @notice Manages ERC20 token payments for role-based access control memberships
 * @dev Supports multiple payment tokens with configurable pricing and routing
 * 
 * Key Features:
 * - Multiple ERC20 payment methods
 * - Adjustable pricing per role/tier
 * - Payment routing to treasury/multiple recipients
 * - Admin functions for refunds and emergency recovery
 * - Events for complete audit trail
 */
contract MembershipPaymentManager is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // ========== Role Definitions ==========
    
    bytes32 public constant PAYMENT_ADMIN_ROLE = keccak256("PAYMENT_ADMIN_ROLE");
    bytes32 public constant PRICING_ADMIN_ROLE = keccak256("PRICING_ADMIN_ROLE");
    bytes32 public constant TREASURY_ADMIN_ROLE = keccak256("TREASURY_ADMIN_ROLE");
    
    // ========== Payment Configuration ==========
    
    struct PaymentToken {
        address tokenAddress;
        bool isActive;
        uint8 decimals;
        string symbol;
    }
    
    struct RolePricing {
        mapping(address => uint256) priceByToken; // token address => price
        bool isActive;
    }
    
    struct PaymentRouting {
        address recipient;
        uint256 basisPoints; // 10000 = 100%
    }
    
    // Payment tokens (token address => PaymentToken info)
    mapping(address => PaymentToken) public paymentTokens;
    address[] public paymentTokenList;
    
    // Role pricing (role hash => RolePricing)
    mapping(bytes32 => RolePricing) private rolePricing;
    
    // Payment routing (array of recipients and their share)
    PaymentRouting[] public paymentRouting;
    
    // Treasury address (receives payments if no routing configured)
    address public treasury;
    
    // ========== Payment Tracking ==========
    
    struct Payment {
        address buyer;
        bytes32 role;
        address paymentToken;
        uint256 amount;
        uint256 timestamp;
        uint8 tier; // 0 for non-tiered, 1-4 for tiers
    }
    
    // Payment tracking
    mapping(bytes32 => Payment) public payments; // paymentId => Payment
    mapping(address => bytes32[]) public userPayments; // user => paymentIds
    uint256 public totalPaymentsCount;
    
    // Revenue tracking by token
    mapping(address => uint256) public revenueByToken;
    
    // ========== Events ==========
    
    event PaymentTokenAdded(address indexed token, string symbol, uint8 decimals);
    event PaymentTokenUpdated(address indexed token, bool isActive);
    event PaymentTokenRemoved(address indexed token);
    event RolePriceUpdated(bytes32 indexed role, address indexed token, uint256 price);
    event PaymentProcessed(
        bytes32 indexed paymentId,
        address indexed buyer,
        bytes32 indexed role,
        address paymentToken,
        uint256 amount,
        uint8 tier
    );
    event PaymentRefunded(bytes32 indexed paymentId, address indexed buyer, uint256 amount);
    event PaymentRoutingUpdated(address indexed recipient, uint256 basisPoints);
    event PaymentRoutingCleared();
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event FundsWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    event EmergencyWithdrawal(address indexed token, address indexed recipient, uint256 amount);
    
    // ========== Constructor ==========
    
    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury address");
        
        treasury = _treasury;
        
        // Grant deployer all admin roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAYMENT_ADMIN_ROLE, msg.sender);
        _grantRole(PRICING_ADMIN_ROLE, msg.sender);
        _grantRole(TREASURY_ADMIN_ROLE, msg.sender);
        
        // Set up role hierarchy
        _setRoleAdmin(PAYMENT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(PRICING_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
        _setRoleAdmin(TREASURY_ADMIN_ROLE, DEFAULT_ADMIN_ROLE);
    }
    
    // ========== Payment Token Management ==========
    
    /**
     * @notice Add a new payment token
     * @param token Address of the ERC20 token
     * @param symbol Token symbol for display
     * @param decimals Token decimals
     */
    function addPaymentToken(
        address token,
        string memory symbol,
        uint8 decimals
    ) external onlyRole(PAYMENT_ADMIN_ROLE) {
        require(token != address(0), "Invalid token address");
        require(!paymentTokens[token].isActive && paymentTokens[token].tokenAddress == address(0), "Token already exists");
        
        paymentTokens[token] = PaymentToken({
            tokenAddress: token,
            isActive: true,
            decimals: decimals,
            symbol: symbol
        });
        
        paymentTokenList.push(token);
        
        emit PaymentTokenAdded(token, symbol, decimals);
    }
    
    /**
     * @notice Update payment token active status
     * @param token Address of the token
     * @param isActive New active status
     */
    function setPaymentTokenActive(
        address token,
        bool isActive
    ) external onlyRole(PAYMENT_ADMIN_ROLE) {
        require(paymentTokens[token].tokenAddress != address(0), "Token not found");
        
        paymentTokens[token].isActive = isActive;
        
        emit PaymentTokenUpdated(token, isActive);
    }
    
    /**
     * @notice Remove a payment token (soft delete - mark as inactive)
     * @param token Address of the token
     */
    function removePaymentToken(address token) external onlyRole(PAYMENT_ADMIN_ROLE) {
        require(paymentTokens[token].tokenAddress != address(0), "Token not found");
        
        paymentTokens[token].isActive = false;
        
        emit PaymentTokenRemoved(token);
    }
    
    // ========== Pricing Management ==========
    
    /**
     * @notice Set price for a role in a specific token
     * @param role Role identifier
     * @param token Payment token address
     * @param price Price in token's smallest unit
     */
    function setRolePrice(
        bytes32 role,
        address token,
        uint256 price
    ) external onlyRole(PRICING_ADMIN_ROLE) {
        require(paymentTokens[token].isActive, "Token not active");
        
        rolePricing[role].priceByToken[token] = price;
        rolePricing[role].isActive = true;
        
        emit RolePriceUpdated(role, token, price);
    }
    
    /**
     * @notice Set prices for a role in multiple tokens at once
     * @param role Role identifier
     * @param tokens Array of payment token addresses
     * @param prices Array of prices in each token's smallest unit
     */
    function setRolePrices(
        bytes32 role,
        address[] calldata tokens,
        uint256[] calldata prices
    ) external onlyRole(PRICING_ADMIN_ROLE) {
        require(tokens.length == prices.length, "Arrays length mismatch");
        require(tokens.length > 0, "Empty arrays");
        
        for (uint256 i = 0; i < tokens.length; i++) {
            require(paymentTokens[tokens[i]].isActive, "Token not active");
            rolePricing[role].priceByToken[tokens[i]] = prices[i];
        }
        
        rolePricing[role].isActive = true;
        
        for (uint256 i = 0; i < tokens.length; i++) {
            emit RolePriceUpdated(role, tokens[i], prices[i]);
        }
    }
    
    /**
     * @notice Get price for a role in a specific token
     * @param role Role identifier
     * @param token Payment token address
     * @return price Price in token's smallest unit
     */
    function getRolePrice(bytes32 role, address token) external view returns (uint256) {
        return rolePricing[role].priceByToken[token];
    }
    
    // ========== Payment Routing Management ==========
    
    /**
     * @notice Set payment routing configuration
     * @param recipients Array of recipient addresses
     * @param basisPoints Array of basis points (10000 = 100%)
     */
    function setPaymentRouting(
        address[] calldata recipients,
        uint256[] calldata basisPoints
    ) external onlyRole(TREASURY_ADMIN_ROLE) {
        require(recipients.length == basisPoints.length, "Arrays length mismatch");
        
        // Clear existing routing
        delete paymentRouting;
        
        uint256 totalBasisPoints = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(basisPoints[i] > 0, "Basis points must be > 0");
            
            paymentRouting.push(PaymentRouting({
                recipient: recipients[i],
                basisPoints: basisPoints[i]
            }));
            
            totalBasisPoints += basisPoints[i];
            
            emit PaymentRoutingUpdated(recipients[i], basisPoints[i]);
        }
        
        require(totalBasisPoints == 10000, "Basis points must sum to 10000");
    }
    
    /**
     * @notice Clear payment routing (send all to treasury)
     */
    function clearPaymentRouting() external onlyRole(TREASURY_ADMIN_ROLE) {
        delete paymentRouting;
        emit PaymentRoutingCleared();
    }
    
    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external onlyRole(TREASURY_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury address");
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    // ========== Payment Processing ==========
    
    /**
     * @notice Process payment for a role purchase
     * @param payer Address that will transfer the tokens (usually msg.sender or contract holding tokens)
     * @param buyer Address of the actual buyer (for tracking purposes)
     * @param role Role identifier
     * @param paymentToken Token used for payment
     * @param amount Amount to pay
     * @param tier Tier level (0 for non-tiered)
     * @return paymentId Unique payment identifier
     */
    function processPayment(
        address payer,
        address buyer,
        bytes32 role,
        address paymentToken,
        uint256 amount,
        uint8 tier
    ) external nonReentrant whenNotPaused returns (bytes32) {
        require(buyer != address(0), "Invalid buyer");
        require(paymentTokens[paymentToken].isActive, "Payment token not active");
        require(rolePricing[role].isActive, "Role pricing not configured");
        
        uint256 requiredAmount = rolePricing[role].priceByToken[paymentToken];
        require(requiredAmount > 0, "Price not set for this token");
        require(amount >= requiredAmount, "Insufficient payment amount");
        
        // Transfer tokens from payer to this contract
        IERC20(paymentToken).safeTransferFrom(payer, address(this), amount);
        
        // Generate payment ID
        bytes32 paymentId = keccak256(
            abi.encodePacked(buyer, role, paymentToken, amount, block.timestamp, totalPaymentsCount)
        );
        
        // Record payment
        payments[paymentId] = Payment({
            buyer: buyer,
            role: role,
            paymentToken: paymentToken,
            amount: amount,
            timestamp: block.timestamp,
            tier: tier
        });
        
        userPayments[buyer].push(paymentId);
        totalPaymentsCount++;
        
        // Route payment
        _routePayment(paymentToken, amount);
        
        // Track revenue
        revenueByToken[paymentToken] += amount;
        
        emit PaymentProcessed(paymentId, buyer, role, paymentToken, amount, tier);
        
        return paymentId;
    }
    
    /**
     * @notice Route payment to recipients or treasury
     * @param token Payment token address
     * @param amount Total amount to route
     */
    function _routePayment(address token, uint256 amount) internal {
        if (paymentRouting.length == 0) {
            // No routing configured, send to treasury
            IERC20(token).safeTransfer(treasury, amount);
        } else {
            // Route according to configuration
            for (uint256 i = 0; i < paymentRouting.length; i++) {
                uint256 share = (amount * paymentRouting[i].basisPoints) / 10000;
                if (share > 0) {
                    IERC20(token).safeTransfer(paymentRouting[i].recipient, share);
                }
            }
        }
    }
    
    // ========== Refund Management ==========
    
    /**
     * @notice Refund a payment (admin function for dispute resolution)
     * @param paymentId Payment to refund
     */
    function refundPayment(bytes32 paymentId) external onlyRole(PAYMENT_ADMIN_ROLE) nonReentrant {
        Payment storage payment = payments[paymentId];
        require(payment.buyer != address(0), "Payment not found");
        require(payment.amount > 0, "Payment already refunded");
        
        address buyer = payment.buyer;
        address token = payment.paymentToken;
        uint256 amount = payment.amount;
        
        // Mark as refunded
        payment.amount = 0;
        
        // Reduce revenue tracking
        if (revenueByToken[token] >= amount) {
            revenueByToken[token] -= amount;
        }
        
        // Transfer funds back to buyer
        IERC20(token).safeTransfer(buyer, amount);
        
        emit PaymentRefunded(paymentId, buyer, amount);
    }
    
    // ========== Treasury Management ==========
    
    /**
     * @notice Withdraw accumulated funds to treasury
     * @param token Token to withdraw
     */
    function withdrawToTreasury(address token) external onlyRole(TREASURY_ADMIN_ROLE) nonReentrant {
        require(paymentTokens[token].tokenAddress != address(0), "Token not configured");
        
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        
        IERC20(token).safeTransfer(treasury, balance);
        
        emit FundsWithdrawn(token, treasury, balance);
    }
    
    /**
     * @notice Emergency withdrawal function (only DEFAULT_ADMIN)
     * @param token Token to withdraw
     * @param recipient Recipient address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        
        IERC20(token).safeTransfer(recipient, amount);
        
        emit EmergencyWithdrawal(token, recipient, amount);
    }
    
    // ========== View Functions ==========
    
    /**
     * @notice Get list of all payment tokens
     * @return tokens Array of token addresses
     */
    function getPaymentTokens() external view returns (address[] memory) {
        return paymentTokenList;
    }
    
    /**
     * @notice Get user's payment history
     * @param user User address
     * @return paymentIds Array of payment IDs
     */
    function getUserPayments(address user) external view returns (bytes32[] memory) {
        return userPayments[user];
    }
    
    /**
     * @notice Get payment routing configuration
     * @return recipients Array of recipient addresses
     * @return basisPoints Array of basis points
     */
    function getPaymentRouting() external view returns (
        address[] memory recipients,
        uint256[] memory basisPoints
    ) {
        uint256 length = paymentRouting.length;
        recipients = new address[](length);
        basisPoints = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            recipients[i] = paymentRouting[i].recipient;
            basisPoints[i] = paymentRouting[i].basisPoints;
        }
    }
    
    /**
     * @notice Get contract balance for a token
     * @param token Token address
     * @return balance Token balance
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
    
    // ========== Emergency Functions ==========
    
    /**
     * @notice Pause contract
     */
    function pause() external onlyRole(PAYMENT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause contract
     */
    function unpause() external onlyRole(PAYMENT_ADMIN_ROLE) {
        _unpause();
    }
}
