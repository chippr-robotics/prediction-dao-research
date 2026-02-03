// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ConditionalMarketFactory.sol";
import "./FriendGroupMarketLib.sol";
import "../security/RagequitModule.sol";
import "../security/NullifierRegistry.sol";
import "../access/TieredRoleManager.sol";
import "../access/MembershipPaymentManager.sol";
import "../oracles/PolymarketOracleAdapter.sol";

// Custom errors (stake/nullification errors from library, reused here)
error InvalidAddress();
error InvalidMarketId();
error InvalidOpponent();
error InvalidDescription();
error InvalidDeadline();
error InvalidStake();
error InvalidLimit();
error InvalidThreshold();
error NotAuthorized();
error MembershipRequired();
error MembershipExpired();
error MarketLimitReached();
error MemberLimitReached();
error NotPending();
error NotActive();
error AlreadyAccepted();
error AlreadyMember();
error NotMember();
error NotInvited();
error DeadlinePassed();
error DeadlineNotPassed();
error AlreadyPegged();
error NotPegged();
error NotResolved();
error TransferFailed();
error InsufficientPayment();
error InvalidMember();
error InvalidOdds();
error MissingMarketMakerRole();
error InvalidResolutionType();
error PolymarketAdapterNotSet();
error InvalidConditionId();
error PolymarketNotResolved();
error AlreadyPeggedToPolymarket();

/**
 * @title FriendGroupMarketFactory
 * @notice Factory for creating small-scale prediction markets between friends
 * @dev Supports P2P betting with tiered membership, member limits, and ERC20 payments
 * 
 * KEY FEATURES:
 * - Tiered membership system (gas-only markets for members)
 * - ERC20 token support (USDC, USDT, stablecoins)
 * - Member limit enforcement to prevent bypassing public markets
 * - Support for 1v1 bets, group prop bets, and event tracking scenarios
 * - Optional third-party arbitration
 * - Integration with RagequitModule for fair exits
 * - USD-based pricing display
 * 
 * USE CASES:
 * 1. Competitive event tracking (poker, board games, etc.)
 * 2. 1v1 prop bets between friends
 * 3. Small group predictions with arbitrator
 * 4. Friend group contests and competitions
 */
contract FriendGroupMarketFactory is Ownable, ReentrancyGuard {
    
    // Market type to distinguish friend markets from public markets
    enum MarketType {
        OneVsOne,           // 1v1 direct bet between two parties
        SmallGroup,         // 3-10 participants
        EventTracking,      // Tracking for competitive events/games
        PropBet,            // General proposition bet
        Bookmaker           // Leveraged 1v1 market requiring dual roles
    }

    // Market status for multi-party acceptance flow
    enum FriendMarketStatus {
        PendingAcceptance,  // Waiting for participants to accept
        Active,             // All required parties accepted, market live
        Resolved,           // Market has been resolved
        Cancelled,          // Creator cancelled before activation
        Refunded            // Stakes returned due to deadline expiration
    }

    // Resolution type for determining who can resolve the market
    enum ResolutionType {
        Either,           // Either creator OR opponent can resolve (default)
        Initiator,        // Only creator can resolve
        Receiver,         // Only opponent can resolve
        ThirdParty,       // Designated arbitrator resolves
        AutoPegged,       // Auto-resolves based on linked public market
        PolymarketOracle  // Resolves based on Polymarket market outcome
    }

    // Acceptance record for each participant
    struct AcceptanceRecord {
        address participant;
        uint256 stakedAmount;
        uint256 acceptedAt;
        bool hasAccepted;
        bool isArbitrator;      // Arbitrators don't stake
    }
    
    struct FriendMarket {
        uint256 marketId;              // ID in ConditionalMarketFactory
        MarketType marketType;
        address creator;
        address[] members;             // Limited participant list
        address arbitrator;            // Optional third-party for resolution
        uint256 memberLimit;           // Max concurrent members
        uint256 creationFee;           // Reduced fee for friend markets
        uint256 createdAt;
        bool active;
        string description;
        uint256 peggedPublicMarketId;  // Public market ID to peg resolution to (0 = none)
        bool autoPegged;               // Whether resolution is pegged to public market
        address paymentToken;          // ERC20 token used (address(0) = native ETC)
        uint256 liquidityAmount;       // Initial liquidity in payment token
        // Multi-party acceptance flow fields
        FriendMarketStatus status;     // Current market status
        uint256 acceptanceDeadline;    // Unix timestamp for acceptance deadline
        uint256 minAcceptanceThreshold; // Minimum participants needed to activate
        uint256 stakePerParticipant;   // Stake amount required from each participant
        address stakeToken;            // Token used for stakes (address(0) = native)
        uint256 tradingPeriodSeconds;  // Trading period stored for later activation
        uint16 opponentOddsMultiplier; // Odds for 1v1/Bookmaker: 200=2x (equal), 10000=100x. Min 200.
        ResolutionType resolutionType; // Who can resolve the market
        bytes32 polymarketConditionId; // Polymarket condition ID for PolymarketOracle resolution
    }
    
    // Friend market ID => FriendMarket
    mapping(uint256 => FriendMarket) public friendMarkets;
    
    // User => array of friend market IDs they're in
    mapping(address => uint256[]) public userMarkets;
    
    // Member count tracking per market
    mapping(uint256 => uint256) public memberCount;
    
    // Track which public markets have pegged friend markets
    mapping(uint256 => uint256[]) public publicMarketToPeggedFriendMarkets;

    // Acceptance tracking for multi-party flow (friendMarketId => participant => AcceptanceRecord)
    mapping(uint256 => mapping(address => AcceptanceRecord)) public marketAcceptances;

    // Count of accepted participants per market
    mapping(uint256 => uint256) public acceptedParticipantCount;

    // Total staked amount per market (held until activation or refund)
    mapping(uint256 => uint256) public marketTotalStaked;

    uint256 public friendMarketCount;
    
    // Reference to main market factory
    ConditionalMarketFactory public marketFactory;
    
    // Reference to ragequit module
    RagequitModule public ragequitModule;
    
    // Reference to tiered role manager for membership checks
    TieredRoleManager public tieredRoleManager;

    // Reference to nullifier registry for anti-money-laundering protection
    NullifierRegistry public nullifierRegistry;

    // Whether to enforce nullification checks (can be disabled if nullifier not deployed)
    bool public enforceNullification;
    
    // Default collateral token for markets (ERC20, required for CTF)
    address public defaultCollateralToken;
    
    // Pricing tiers (updateable by managers)
    uint256 public publicMarketFee = 1 ether;      // Standard market fee
    uint256 public friendMarketFee = 0.1 ether;    // Reduced fee for friend markets
    uint256 public oneVsOneFee = 0.05 ether;       // Even lower for 1v1
    
    // Proposal ID offset to avoid collision with public markets
    // Using 10 billion to allow for massive scale (10B public markets before collision)
    uint256 public constant PROPOSAL_ID_OFFSET = 10_000_000_000;
    
    // Member limits (updateable by managers)
    uint256 public maxSmallGroupMembers = 10;
    uint256 public maxOneVsOneMembers = 2;
    uint256 public minEventTrackingMembers = 3;
    uint256 public maxEventTrackingMembers = 10;
    
    // Manager role for updating configuration
    address public manager;
    
    // Reference to membership payment manager for ERC20 handling
    MembershipPaymentManager public paymentManager;

    // Reference to Polymarket oracle adapter for cross-platform resolution
    PolymarketOracleAdapter public polymarketAdapter;

    // Track Polymarket condition to friend market mappings
    mapping(bytes32 => uint256[]) public polymarketConditionToFriendMarkets;

    // Accepted payment tokens for market creation and liquidity (address => isAccepted)
    mapping(address => bool) public acceptedPaymentTokens;
    
    // Track accepted token list
    address[] public acceptedTokenList;
    
    // Events
    event FriendMarketCreated(
        uint256 indexed friendMarketId,
        uint256 indexed underlyingMarketId,
        MarketType marketType,
        address indexed creator,
        uint256 memberLimit,
        uint256 creationFee,
        address paymentToken
    );
    event MemberAdded(uint256 indexed friendMarketId, address indexed member);
    event MemberRemoved(uint256 indexed friendMarketId, address indexed member);
    event MarketPegged(uint256 indexed friendMarketId, uint256 indexed publicMarketId);
    event BatchResolution(uint256 indexed publicMarketId, uint256[] friendMarketIds, uint256 outcome);
    event FeesUpdated(uint256 publicFee, uint256 friendFee, uint256 oneVsOneFee);
    event MemberLimitsUpdated(uint256 maxSmallGroup, uint256 maxOneVsOne, uint256 minEventTracking, uint256 maxEventTracking);
    event ManagerUpdated(address indexed oldManager, address indexed newManager);
    event PaymentTokenAdded(address indexed token);
    event PaymentTokenRemoved(address indexed token);
    event NullifierRegistryUpdated(address indexed nullifierRegistry);
    event NullificationEnforcementUpdated(bool enforce);
    
    event ArbitratorSet(
        uint256 indexed friendMarketId,
        address indexed arbitrator
    );
    
    event MarketResolved(
        uint256 indexed friendMarketId,
        address indexed resolver,
        bool outcome
    );
    
    event MarketPeggedToPublic(
        uint256 indexed friendMarketId,
        uint256 indexed publicMarketId
    );
    
    event PeggedMarketAutoResolved(
        uint256 indexed friendMarketId,
        uint256 indexed publicMarketId,
        uint256 passValue,
        uint256 failValue
    );

    // Multi-party acceptance flow events
    event MarketCreatedPending(
        uint256 indexed friendMarketId,
        address indexed creator,
        uint256 acceptanceDeadline,
        uint256 stakePerParticipant,
        uint16 opponentOddsMultiplier,
        address stakeToken,
        address[] invitedParticipants,
        address arbitrator
    );

    event ParticipantAccepted(
        uint256 indexed friendMarketId,
        address indexed participant,
        uint256 stakedAmount,
        uint256 acceptedAt
    );

    event ArbitratorAccepted(
        uint256 indexed friendMarketId,
        address indexed arbitrator,
        uint256 acceptedAt
    );

    event MarketActivated(
        uint256 indexed friendMarketId,
        uint256 underlyingMarketId,
        uint256 activatedAt,
        uint256 totalStaked,
        uint256 participantCount
    );

    event MarketCancelledByCreator(
        uint256 indexed friendMarketId,
        address indexed creator,
        uint256 cancelledAt
    );

    event AcceptanceDeadlinePassed(
        uint256 indexed friendMarketId,
        uint256 deadline,
        uint256 acceptedCount,
        uint256 requiredCount
    );

    event StakeRefunded(
        uint256 indexed friendMarketId,
        address indexed participant,
        uint256 amount
    );

    event PolymarketAdapterUpdated(address indexed adapter);

    event MarketPeggedToPolymarket(
        uint256 indexed friendMarketId,
        bytes32 indexed conditionId
    );

    event PolymarketMarketResolved(
        uint256 indexed friendMarketId,
        bytes32 indexed conditionId,
        uint256 passNumerator,
        uint256 failNumerator,
        bool outcome
    );
    
    constructor(
        address _marketFactory,
        address payable _ragequitModule,
        address _tieredRoleManager,
        address _paymentManager,
        address _owner
    ) Ownable(_owner) {
        if (_marketFactory == address(0)) revert InvalidAddress();
        if (_ragequitModule == address(0)) revert InvalidAddress();
        if (_tieredRoleManager == address(0)) revert InvalidAddress();
        if (_paymentManager == address(0)) revert InvalidAddress();
        if (_owner == address(0)) revert InvalidAddress();

        marketFactory = ConditionalMarketFactory(_marketFactory);
        ragequitModule = RagequitModule(_ragequitModule);
        tieredRoleManager = TieredRoleManager(_tieredRoleManager);
        paymentManager = MembershipPaymentManager(_paymentManager);
        manager = _owner; // Initially owner, transferable

        // Accept native ETC by default
        acceptedPaymentTokens[address(0)] = true;
    }
    
    // ========== Manager Functions ==========
    
    /**
     * @notice Update manager address (only owner)
     * @param newManager New manager address
     */
    function updateManager(address newManager) external onlyOwner {
        if (newManager == address(0)) revert InvalidAddress();
        address oldManager = manager;
        manager = newManager;
        emit ManagerUpdated(oldManager, newManager);
    }
    
    /**
     * @notice Set default collateral token for markets (ERC20, required for CTF)
     * @param _collateralToken Address of ERC20 token to use as collateral
     */
    function setDefaultCollateralToken(address _collateralToken) external onlyOwner {
        if (_collateralToken == address(0)) revert InvalidAddress();
        defaultCollateralToken = _collateralToken;
    }

    function addAcceptedPaymentToken(address token, bool active) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();

        bool wasAccepted = acceptedPaymentTokens[token];
        acceptedPaymentTokens[token] = active;

        if (active && !wasAccepted && token != address(0)) {
            acceptedTokenList.push(token);
            emit PaymentTokenAdded(token);
        } else if (!active && wasAccepted) {
            emit PaymentTokenRemoved(token);
        }
    }

    function removeAcceptedPaymentToken(address token) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();
        if (token == address(0)) revert InvalidAddress();

        acceptedPaymentTokens[token] = false;
        emit PaymentTokenRemoved(token);
    }

    function updateFees(uint256 _publicFee, uint256 _friendFee, uint256 _oneVsOneFee) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();
        publicMarketFee = _publicFee;
        friendMarketFee = _friendFee;
        oneVsOneFee = _oneVsOneFee;
        emit FeesUpdated(_publicFee, _friendFee, _oneVsOneFee);
    }
    
    /**
     * @notice Update member limits (only manager)
     * @param _maxSmallGroup Max members for small group markets
     * @param _maxOneVsOne Max members for 1v1 markets (should be 2)
     * @param _minEventTracking Min members for event tracking
     * @param _maxEventTracking Max members for event tracking
     */
    function updateMemberLimits(
        uint256 _maxSmallGroup,
        uint256 _maxOneVsOne,
        uint256 _minEventTracking,
        uint256 _maxEventTracking
    ) external {
        if (msg.sender != manager && msg.sender != owner()) revert NotAuthorized();
        if (_maxOneVsOne != 2) revert InvalidLimit();
        if (_minEventTracking > _maxEventTracking) revert InvalidLimit();
        maxSmallGroupMembers = _maxSmallGroup;
        maxOneVsOneMembers = _maxOneVsOne;
        minEventTrackingMembers = _minEventTracking;
        maxEventTrackingMembers = _maxEventTracking;
        emit MemberLimitsUpdated(_maxSmallGroup, _maxOneVsOne, _minEventTracking, _maxEventTracking);
    }

    /**
     * @notice Update TieredRoleManager address (only owner)
     * @param _tieredRoleManager New TieredRoleManager address
     */
    function setTieredRoleManager(address _tieredRoleManager) external onlyOwner {
        if (_tieredRoleManager == address(0)) revert InvalidAddress();
        tieredRoleManager = TieredRoleManager(_tieredRoleManager);
    }

    /**
     * @notice Set the NullifierRegistry contract (only owner)
     * @param _nullifierRegistry Address of NullifierRegistry contract
     */
    function setNullifierRegistry(address _nullifierRegistry) external onlyOwner {
        if (_nullifierRegistry == address(0)) revert InvalidAddress();
        nullifierRegistry = NullifierRegistry(_nullifierRegistry);
        emit NullifierRegistryUpdated(_nullifierRegistry);
    }

    /**
     * @notice Enable or disable nullification enforcement (only owner)
     * @param _enforce Whether to enforce nullification checks
     */
    function setNullificationEnforcement(bool _enforce) external onlyOwner {
        // Can only enable if registry is set
        if (_enforce && address(nullifierRegistry) == address(0)) revert InvalidAddress();
        enforceNullification = _enforce;
        emit NullificationEnforcementUpdated(_enforce);
    }

    /**
     * @notice Set the Polymarket oracle adapter contract (only owner)
     * @dev Required for resolving markets based on Polymarket outcomes
     * @param _polymarketAdapter Address of the PolymarketOracleAdapter contract
     */
    function setPolymarketAdapter(address _polymarketAdapter) external onlyOwner {
        if (_polymarketAdapter == address(0)) revert InvalidAddress();
        polymarketAdapter = PolymarketOracleAdapter(_polymarketAdapter);
        emit PolymarketAdapterUpdated(_polymarketAdapter);
    }

    // ========== Multi-Party Acceptance Flow Functions ==========

    /**
     * @notice Create a 1v1 market with pending acceptance (equal stakes)
     * @param opponent Address of the counterparty
     * @param description Market description
     * @param tradingPeriod Duration after activation (7-21 days)
     * @param arbitrator Optional third-party arbitrator (required if resolutionType is ThirdParty)
     * @param acceptanceDeadline Unix timestamp for acceptance deadline
     * @param stakeAmount Equal stake amount for both parties
     * @param stakeToken ERC20 token address for stakes (address(0) for native)
     * @param resolutionType Who can resolve the market
     * @return friendMarketId ID of the pending friend market
     */
    function createOneVsOneMarketPending(
        address opponent,
        string memory description,
        uint256 tradingPeriod,
        address arbitrator,
        uint256 acceptanceDeadline,
        uint256 stakeAmount,
        address stakeToken,
        ResolutionType resolutionType
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        if (opponent == address(0) || opponent == msg.sender) revert InvalidOpponent();
        if (bytes(description).length == 0) revert InvalidDescription();
        if (acceptanceDeadline <= block.timestamp + 1 hours || acceptanceDeadline >= block.timestamp + 30 days) revert InvalidDeadline();
        if (stakeAmount == 0) revert InvalidStake();

        // Validate resolution type
        if (resolutionType == ResolutionType.ThirdParty && arbitrator == address(0)) revert InvalidAddress();

        bytes32 role = tieredRoleManager.FRIEND_MARKET_ROLE();
        if (!tieredRoleManager.hasRole(role, msg.sender)) revert MembershipRequired();
        if (!tieredRoleManager.isMembershipActive(msg.sender, role)) revert MembershipExpired();
        if (!tieredRoleManager.checkMarketCreationLimitFor(msg.sender, role)) revert MarketLimitReached();

        // Anti-money-laundering: Check if creator or opponent is nullified
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, opponent);

        // Equal stakes for 1v1 markets
        FriendGroupMarketLib.collectStake(msg.sender, stakeToken, stakeAmount);

        // Create pending market (no underlying market yet - created on activation)
        friendMarketId = friendMarketCount++;

        address[] memory participants = new address[](2);
        participants[0] = msg.sender;
        participants[1] = opponent;

        friendMarkets[friendMarketId] = FriendMarket({
            marketId: 0, // Not created until activated
            marketType: MarketType.OneVsOne,
            creator: msg.sender,
            members: participants,
            arbitrator: arbitrator,
            memberLimit: maxOneVsOneMembers,
            creationFee: 0,
            createdAt: block.timestamp,
            active: false, // Not active until accepted
            description: description,
            peggedPublicMarketId: 0,
            autoPegged: false,
            paymentToken: stakeToken,
            liquidityAmount: 0,
            status: FriendMarketStatus.PendingAcceptance,
            acceptanceDeadline: acceptanceDeadline,
            minAcceptanceThreshold: 2, // Both must accept for 1v1
            stakePerParticipant: stakeAmount, // Equal stake for both parties
            stakeToken: stakeToken,
            tradingPeriodSeconds: tradingPeriod,
            opponentOddsMultiplier: 200, // Equal stakes (2x)
            resolutionType: resolutionType,
            polymarketConditionId: bytes32(0) // Set later via pegToPolymarketCondition
        });

        // Record creator's acceptance (equal stake)
        marketAcceptances[friendMarketId][msg.sender] = AcceptanceRecord({
            participant: msg.sender,
            stakedAmount: stakeAmount,
            acceptedAt: block.timestamp,
            hasAccepted: true,
            isArbitrator: false
        });

        acceptedParticipantCount[friendMarketId] = 1;
        marketTotalStaked[friendMarketId] = stakeAmount;

        memberCount[friendMarketId] = 2;
        userMarkets[msg.sender].push(friendMarketId);
        userMarkets[opponent].push(friendMarketId);

        emit MarketCreatedPending(
            friendMarketId,
            msg.sender,
            acceptanceDeadline,
            stakeAmount,
            200, // Equal stakes
            stakeToken,
            participants,
            arbitrator
        );

        if (arbitrator != address(0)) {
            emit ArbitratorSet(friendMarketId, arbitrator);
        }
    }

    /**
     * @notice Create a Bookmaker market - leveraged 1v1 requiring both MARKET_MAKER and FRIEND_MARKET roles
     * @dev More dispute-prone due to asymmetric stakes, hence separated from regular 1v1
     * @param opponent Address of the counterparty (must have FRIEND_MARKET_ROLE)
     * @param description Market description
     * @param tradingPeriod Duration after activation (7-21 days)
     * @param acceptanceDeadline Unix timestamp for acceptance deadline
     * @param opponentStakeAmount Amount opponent must stake (creator stake derived from odds)
     * @param opponentOddsMultiplier Opponent's payout multiplier: 200=2x (equal), 10000=100x
     * @param stakeToken ERC20 token address for stakes (address(0) for native)
     * @param resolutionType Who can resolve the market
     * @param arbitrator Optional third-party arbitrator (required if resolutionType is ThirdParty)
     * @return friendMarketId ID of the pending friend market
     */
    function createBookmakerMarket(
        address opponent,
        string memory description,
        uint256 tradingPeriod,
        uint256 acceptanceDeadline,
        uint256 opponentStakeAmount,
        uint16 opponentOddsMultiplier,
        address stakeToken,
        ResolutionType resolutionType,
        address arbitrator
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        if (opponent == address(0) || opponent == msg.sender) revert InvalidOpponent();
        if (bytes(description).length == 0) revert InvalidDescription();
        if (acceptanceDeadline <= block.timestamp + 1 hours || acceptanceDeadline >= block.timestamp + 30 days) revert InvalidDeadline();
        if (opponentStakeAmount == 0) revert InvalidStake();
        if (opponentOddsMultiplier < 200) revert InvalidOdds(); // Minimum 2x (equal stakes)

        // Validate resolution type
        if (resolutionType == ResolutionType.ThirdParty && arbitrator == address(0)) revert InvalidAddress();

        // Creator must have BOTH MARKET_MAKER_ROLE and FRIEND_MARKET_ROLE
        bytes32 friendRole = tieredRoleManager.FRIEND_MARKET_ROLE();
        bytes32 makerRole = tieredRoleManager.MARKET_MAKER_ROLE();

        if (!tieredRoleManager.hasRole(friendRole, msg.sender)) revert MembershipRequired();
        if (!tieredRoleManager.hasRole(makerRole, msg.sender)) revert MissingMarketMakerRole();
        if (!tieredRoleManager.isMembershipActive(msg.sender, friendRole)) revert MembershipExpired();
        if (!tieredRoleManager.isMembershipActive(msg.sender, makerRole)) revert MembershipExpired();
        if (!tieredRoleManager.checkMarketCreationLimitFor(msg.sender, friendRole)) revert MarketLimitReached();

        // Opponent only needs FRIEND_MARKET_ROLE to accept
        if (!tieredRoleManager.hasRole(friendRole, opponent)) revert MembershipRequired();

        // Anti-money-laundering: Check if creator or opponent is nullified
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, opponent);

        // Calculate creator's stake based on odds (creator is "insurer", stakes more)
        // Formula: creatorStake = opponentStake × (multiplier - 100) / 100
        uint256 creatorStake = (opponentStakeAmount * (uint256(opponentOddsMultiplier) - 100)) / 100;
        FriendGroupMarketLib.collectStake(msg.sender, stakeToken, creatorStake);

        // Create pending market
        friendMarketId = friendMarketCount++;

        address[] memory participants = new address[](2);
        participants[0] = msg.sender;
        participants[1] = opponent;

        friendMarkets[friendMarketId] = FriendMarket({
            marketId: 0, // Not created until activated
            marketType: MarketType.Bookmaker,
            creator: msg.sender,
            members: participants,
            arbitrator: arbitrator,
            memberLimit: maxOneVsOneMembers,
            creationFee: 0,
            createdAt: block.timestamp,
            active: false, // Not active until accepted
            description: description,
            peggedPublicMarketId: 0,
            autoPegged: false,
            paymentToken: stakeToken,
            liquidityAmount: 0,
            status: FriendMarketStatus.PendingAcceptance,
            acceptanceDeadline: acceptanceDeadline,
            minAcceptanceThreshold: 2, // Both must accept for 1v1
            stakePerParticipant: opponentStakeAmount, // Opponent's required stake
            stakeToken: stakeToken,
            tradingPeriodSeconds: tradingPeriod,
            opponentOddsMultiplier: opponentOddsMultiplier,
            resolutionType: resolutionType,
            polymarketConditionId: bytes32(0) // Set later via pegToPolymarketCondition
        });

        // Record creator's acceptance (creator stakes more based on odds)
        marketAcceptances[friendMarketId][msg.sender] = AcceptanceRecord({
            participant: msg.sender,
            stakedAmount: creatorStake,
            acceptedAt: block.timestamp,
            hasAccepted: true,
            isArbitrator: false
        });

        acceptedParticipantCount[friendMarketId] = 1;
        marketTotalStaked[friendMarketId] = creatorStake;

        memberCount[friendMarketId] = 2;
        userMarkets[msg.sender].push(friendMarketId);
        userMarkets[opponent].push(friendMarketId);

        emit MarketCreatedPending(
            friendMarketId,
            msg.sender,
            acceptanceDeadline,
            opponentStakeAmount,
            opponentOddsMultiplier,
            stakeToken,
            participants,
            arbitrator
        );

        if (arbitrator != address(0)) {
            emit ArbitratorSet(friendMarketId, arbitrator);
        }
    }

    /**
     * @notice Create a small group market with pending acceptance
     * @param description Market description
     * @param invitedMembers Initial participant addresses (excluding creator)
     * @param memberLimit Maximum concurrent members
     * @param tradingPeriod Duration after activation
     * @param arbitrator Optional third-party arbitrator
     * @param acceptanceDeadline Unix timestamp for acceptance deadline
     * @param minAcceptanceThreshold Minimum participants to activate (including creator)
     * @param stakeAmount Amount each party must stake
     * @param stakeToken ERC20 token address for stakes
     * @return friendMarketId ID of the pending friend market
     */
    function createSmallGroupMarketPending(
        string memory description,
        address[] memory invitedMembers,
        uint256 memberLimit,
        uint256 tradingPeriod,
        address arbitrator,
        uint256 acceptanceDeadline,
        uint256 minAcceptanceThreshold,
        uint256 stakeAmount,
        address stakeToken
    ) external payable nonReentrant returns (uint256 friendMarketId) {
        if (bytes(description).length == 0) revert InvalidDescription();
        if (memberLimit <= 2 || memberLimit > maxSmallGroupMembers) revert InvalidLimit();
        if (invitedMembers.length == 0 || invitedMembers.length >= memberLimit) revert InvalidLimit();
        if (acceptanceDeadline <= block.timestamp + 1 hours || acceptanceDeadline >= block.timestamp + 30 days) revert InvalidDeadline();
        if (stakeAmount == 0) revert InvalidStake();
        if (minAcceptanceThreshold < 2) revert InvalidThreshold();
        if (minAcceptanceThreshold > invitedMembers.length + 1) revert InvalidThreshold();

        FriendGroupMarketLib.validateMembersExcluding(invitedMembers, msg.sender);

        bytes32 role = tieredRoleManager.FRIEND_MARKET_ROLE();
        if (!tieredRoleManager.hasRole(role, msg.sender)) revert MembershipRequired();
        if (!tieredRoleManager.isMembershipActive(msg.sender, role)) revert MembershipExpired();
        if (!tieredRoleManager.checkMarketCreationLimitFor(msg.sender, role)) revert MarketLimitReached();

        // Anti-money-laundering: Check if creator or any invited member is nullified
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);
        FriendGroupMarketLib.checkNullificationBatch(nullifierRegistry, enforceNullification, invitedMembers);

        FriendGroupMarketLib.collectStake(msg.sender, stakeToken, stakeAmount);

        // Build full participant list (creator + invited)
        address[] memory allParticipants = new address[](invitedMembers.length + 1);
        allParticipants[0] = msg.sender;
        for (uint256 i = 0; i < invitedMembers.length; i++) {
            allParticipants[i + 1] = invitedMembers[i];
        }

        // Create pending market
        friendMarketId = friendMarketCount++;

        friendMarkets[friendMarketId] = FriendMarket({
            marketId: 0,
            marketType: MarketType.SmallGroup,
            creator: msg.sender,
            members: allParticipants,
            arbitrator: arbitrator,
            memberLimit: memberLimit,
            creationFee: 0,
            createdAt: block.timestamp,
            active: false,
            description: description,
            peggedPublicMarketId: 0,
            autoPegged: false,
            paymentToken: stakeToken,
            liquidityAmount: 0,
            status: FriendMarketStatus.PendingAcceptance,
            acceptanceDeadline: acceptanceDeadline,
            minAcceptanceThreshold: minAcceptanceThreshold,
            stakePerParticipant: stakeAmount,
            stakeToken: stakeToken,
            tradingPeriodSeconds: tradingPeriod,
            opponentOddsMultiplier: 200, // Group markets use equal stakes
            resolutionType: ResolutionType.Either, // Group markets use default resolution
            polymarketConditionId: bytes32(0) // Set later via pegToPolymarketCondition
        });

        // Record creator's acceptance
        marketAcceptances[friendMarketId][msg.sender] = AcceptanceRecord({
            participant: msg.sender,
            stakedAmount: stakeAmount,
            acceptedAt: block.timestamp,
            hasAccepted: true,
            isArbitrator: false
        });

        acceptedParticipantCount[friendMarketId] = 1;
        marketTotalStaked[friendMarketId] = stakeAmount;
        memberCount[friendMarketId] = allParticipants.length;

        // Add all participants to user markets
        for (uint256 i = 0; i < allParticipants.length; i++) {
            userMarkets[allParticipants[i]].push(friendMarketId);
        }

        emit MarketCreatedPending(
            friendMarketId,
            msg.sender,
            acceptanceDeadline,
            stakeAmount,
            200, // Group markets use equal stakes (2x)
            stakeToken,
            allParticipants,
            arbitrator
        );

        if (arbitrator != address(0)) {
            emit ArbitratorSet(friendMarketId, arbitrator);
        }
    }

    /**
     * @notice Add a member to an existing small group market
     * @param friendMarketId ID of the friend market
     * @param newMember Address of new member
     */
    function addMember(uint256 friendMarketId, address newMember) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        if (!market.active) revert NotActive();
        if (msg.sender != market.creator) revert NotAuthorized();
        if (newMember == address(0)) revert InvalidMember();
        if (memberCount[friendMarketId] >= market.memberLimit) revert MemberLimitReached();

        // Anti-money-laundering: Check if new member is nullified
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, newMember);

        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == newMember) revert AlreadyMember();
        }

        market.members.push(newMember);
        memberCount[friendMarketId]++;
        userMarkets[newMember].push(friendMarketId);

        emit MemberAdded(friendMarketId, newMember);
    }

    function removeSelf(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        if (!market.active) revert NotActive();

        bool found = false;
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == msg.sender) {
                market.members[i] = market.members[market.members.length - 1];
                market.members.pop();
                memberCount[friendMarketId]--;
                found = true;
                break;
            }
        }

        if (!found) revert NotMember();
        emit MemberRemoved(friendMarketId, msg.sender);
    }

    function acceptMarket(uint256 friendMarketId) external payable nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        if (market.status != FriendMarketStatus.PendingAcceptance) revert NotPending();
        if (block.timestamp >= market.acceptanceDeadline) revert DeadlinePassed();
        if (marketAcceptances[friendMarketId][msg.sender].hasAccepted) revert AlreadyAccepted();

        // Anti-money-laundering: Check if accepting participant is nullified
        FriendGroupMarketLib.checkNullification(nullifierRegistry, enforceNullification, msg.sender);

        bool isInvited = false;
        bool isArbitrator = market.arbitrator == msg.sender;

        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == msg.sender) {
                isInvited = true;
                break;
            }
        }

        if (!isInvited && !isArbitrator) revert NotInvited();

        if (isArbitrator) {
            // Arbitrators don't stake
            marketAcceptances[friendMarketId][msg.sender] = AcceptanceRecord({
                participant: msg.sender,
                stakedAmount: 0,
                acceptedAt: block.timestamp,
                hasAccepted: true,
                isArbitrator: true
            });

            emit ArbitratorAccepted(friendMarketId, msg.sender, block.timestamp);
        } else {
            // Collect stake from participant
            FriendGroupMarketLib.collectStake(msg.sender, market.stakeToken, market.stakePerParticipant);

            marketAcceptances[friendMarketId][msg.sender] = AcceptanceRecord({
                participant: msg.sender,
                stakedAmount: market.stakePerParticipant,
                acceptedAt: block.timestamp,
                hasAccepted: true,
                isArbitrator: false
            });

            acceptedParticipantCount[friendMarketId]++;
            marketTotalStaked[friendMarketId] += market.stakePerParticipant;

            emit ParticipantAccepted(
                friendMarketId,
                msg.sender,
                market.stakePerParticipant,
                block.timestamp
            );
        }

        // Check if market should activate
        _checkAndActivateMarket(friendMarketId);
    }

    /**
     * @notice Cancel a pending market (creator only, before activation)
     * @param friendMarketId ID of the pending market
     */
    function cancelPendingMarket(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        if (market.status != FriendMarketStatus.PendingAcceptance) revert NotPending();
        if (msg.sender != market.creator) revert NotAuthorized();

        market.status = FriendMarketStatus.Cancelled;
        _refundAllStakesInternal(friendMarketId);

        emit MarketCancelledByCreator(friendMarketId, msg.sender, block.timestamp);
    }

    function processExpiredDeadline(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        if (market.status != FriendMarketStatus.PendingAcceptance) revert NotPending();
        if (block.timestamp < market.acceptanceDeadline) revert DeadlineNotPassed();

        uint256 accepted = acceptedParticipantCount[friendMarketId];
        uint256 required = market.minAcceptanceThreshold;

        // Check if arbitrator acceptance is also required and met
        bool arbitratorOk = true;
        if (market.arbitrator != address(0)) {
            arbitratorOk = marketAcceptances[friendMarketId][market.arbitrator].hasAccepted;
        }

        if (accepted >= required && arbitratorOk) {
            // Threshold met - activate market
            _activateMarket(friendMarketId);
        } else {
            // Threshold not met - refund all
            market.status = FriendMarketStatus.Refunded;
            _refundAllStakesInternal(friendMarketId);

            emit AcceptanceDeadlinePassed(friendMarketId, market.acceptanceDeadline, accepted, required);
        }
    }

    // ========== Internal Helper Functions for Acceptance Flow ==========

    /**
     * @notice Refund all stakes for a market (uses library for individual refunds)
     */
    function _refundAllStakesInternal(uint256 friendMarketId) internal {
        FriendMarket storage market = friendMarkets[friendMarketId];

        for (uint256 i = 0; i < market.members.length; i++) {
            address participant = market.members[i];
            AcceptanceRecord storage record = marketAcceptances[friendMarketId][participant];

            if (record.hasAccepted && record.stakedAmount > 0) {
                FriendGroupMarketLib.refundStake(participant, market.stakeToken, record.stakedAmount);
                emit StakeRefunded(friendMarketId, participant, record.stakedAmount);
            }
        }

        marketTotalStaked[friendMarketId] = 0;
    }

    /**
     * @notice Check if market should activate and do so if conditions are met
     */
    function _checkAndActivateMarket(uint256 friendMarketId) internal {
        FriendMarket storage market = friendMarkets[friendMarketId];

        uint256 accepted = acceptedParticipantCount[friendMarketId];
        uint256 required = market.minAcceptanceThreshold;

        // Check if arbitrator acceptance is required and met
        bool arbitratorOk = true;
        if (market.arbitrator != address(0)) {
            arbitratorOk = marketAcceptances[friendMarketId][market.arbitrator].hasAccepted;
        }

        if (accepted >= required && arbitratorOk) {
            _activateMarket(friendMarketId);
        }
    }

    /**
     * @notice Activate a pending market by deploying the underlying market
     */
    function _activateMarket(uint256 friendMarketId) internal {
        FriendMarket storage market = friendMarkets[friendMarketId];

        uint256 totalStaked = marketTotalStaked[friendMarketId];

        // Deploy underlying market in ConditionalMarketFactory
        uint256 proposalId = friendMarketId + PROPOSAL_ID_OFFSET;
        address collateral = defaultCollateralToken != address(0) ? defaultCollateralToken : market.stakeToken;

        // Approve collateral transfer to ConditionalMarketFactory
        if (collateral != address(0)) {
            IERC20(collateral).approve(address(marketFactory), totalStaked);
        }

        uint256 underlyingMarketId = marketFactory.deployMarketPair(
            proposalId,
            collateral,
            totalStaked,
            0.01 ether, // Liquidity parameter
            market.tradingPeriodSeconds,
            ConditionalMarketFactory.BetType.YesNo
        );

        market.marketId = underlyingMarketId;
        market.status = FriendMarketStatus.Active;
        market.active = true;
        market.liquidityAmount = totalStaked;

        emit MarketActivated(
            friendMarketId,
            underlyingMarketId,
            block.timestamp,
            totalStaked,
            acceptedParticipantCount[friendMarketId]
        );
    }

    // ========== Acceptance Flow View Functions ==========

    /**
     * @notice Get acceptance status for a market
     */
    function getAcceptanceStatus(uint256 friendMarketId) external view returns (
        uint256 accepted,
        uint256 required,
        uint256 deadline,
        bool arbitratorRequired,
        bool arbitratorAccepted,
        FriendMarketStatus status
    ) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        return (
            acceptedParticipantCount[friendMarketId],
            market.minAcceptanceThreshold,
            market.acceptanceDeadline,
            market.arbitrator != address(0),
            market.arbitrator != address(0) ?
                marketAcceptances[friendMarketId][market.arbitrator].hasAccepted : true,
            market.status
        );
    }

    /**
     * @notice Get participant's acceptance record
     */
    function getParticipantAcceptance(uint256 friendMarketId, address participant)
        external view returns (AcceptanceRecord memory)
    {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        return marketAcceptances[friendMarketId][participant];
    }

    function hasAccepted(uint256 friendMarketId, address participant) external view returns (bool) {
        return marketAcceptances[friendMarketId][participant].hasAccepted;
    }

    /**
     * @notice Get stake requirements for a 1v1 market with custom odds
     * @param friendMarketId ID of the friend market
     * @return opponentStake Amount opponent must stake
     * @return creatorStake Amount creator staked
     * @return totalPot Total pot if both stakes collected
     * @return oddsMultiplier The odds multiplier (200 = 2x, 10000 = 100x)
     */
    function getStakeRequirements(uint256 friendMarketId) external view returns (
        uint256 opponentStake,
        uint256 creatorStake,
        uint256 totalPot,
        uint16 oddsMultiplier
    ) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        opponentStake = market.stakePerParticipant;
        // Treat 0 as 200 (2x) for backwards compatibility with legacy markets
        oddsMultiplier = market.opponentOddsMultiplier == 0 ? 200 : market.opponentOddsMultiplier;
        creatorStake = (opponentStake * (uint256(oddsMultiplier) - 100)) / 100;
        totalPot = (opponentStake * uint256(oddsMultiplier)) / 100;
    }

    /**
     * @notice Get friend market details with acceptance info
     */
    function getFriendMarketWithStatus(uint256 friendMarketId) external view returns (
        uint256 marketId,
        MarketType marketType,
        address creator,
        address[] memory members,
        address arbitrator,
        FriendMarketStatus status,
        uint256 acceptanceDeadline,
        uint256 stakePerParticipant,
        address stakeToken,
        uint256 acceptedCount,
        uint256 minThreshold,
        uint16 opponentOddsMultiplier,
        string memory description,
        ResolutionType resolutionType
    ) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];

        return (
            market.marketId,
            market.marketType,
            market.creator,
            market.members,
            market.arbitrator,
            market.status,
            market.acceptanceDeadline,
            market.stakePerParticipant,
            market.stakeToken,
            acceptedParticipantCount[friendMarketId],
            market.minAcceptanceThreshold,
            market.opponentOddsMultiplier == 0 ? 200 : market.opponentOddsMultiplier,
            market.description,
            market.resolutionType
        );
    }

    /**
     * @notice Get friend market details
     * @param friendMarketId ID of the friend market
     */
    function getFriendMarket(uint256 friendMarketId) external view returns (
        uint256 marketId,
        MarketType marketType,
        address creator,
        address[] memory members,
        address arbitrator,
        uint256 memberLimit,
        uint256 creationFee,
        uint256 createdAt,
        bool active,
        string memory description,
        uint256 peggedPublicMarketId,
        bool autoPegged,
        address paymentToken,
        uint256 liquidityAmount
    ) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        
        return (
            market.marketId,
            market.marketType,
            market.creator,
            market.members,
            market.arbitrator,
            market.memberLimit,
            market.creationFee,
            market.createdAt,
            market.active,
            market.description,
            market.peggedPublicMarketId,
            market.autoPegged,
            market.paymentToken,
            market.liquidityAmount
        );
    }
    
    /**
     * @notice Get all markets for a user
     * @param user Address of the user
     */
    function getUserMarkets(address user) external view returns (uint256[] memory) {
        return userMarkets[user];
    }
    
    /**
     * @notice Check if user is a member of a market
     * @param friendMarketId ID of the friend market
     * @param user Address to check
     */
    function isMember(uint256 friendMarketId, address user) public view returns (bool) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        
        for (uint256 i = 0; i < market.members.length; i++) {
            if (market.members[i] == user) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * @notice Get member count for a market
     * @param friendMarketId ID of the friend market
     */
    function getMemberCount(uint256 friendMarketId) external view returns (uint256) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        return memberCount[friendMarketId];
    }
    
    /**
     * @notice Peg an existing friend market to a public market
     * @param friendMarketId ID of the friend market
     * @param publicMarketId ID of the public market to peg to
     */
    function pegToPublicMarket(uint256 friendMarketId, uint256 publicMarketId) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        if (publicMarketId >= marketFactory.marketCount()) revert InvalidMarketId();

        FriendMarket storage market = friendMarkets[friendMarketId];
        if (!market.active) revert NotActive();
        if (msg.sender != market.creator) revert NotAuthorized();
        if (market.autoPegged) revert AlreadyPegged();

        market.peggedPublicMarketId = publicMarketId;
        market.autoPegged = true;
        
        publicMarketToPeggedFriendMarkets[publicMarketId].push(friendMarketId);
        emit MarketPeggedToPublic(friendMarketId, publicMarketId);
    }
    
    /**
     * @notice Automatically resolve friend market based on pegged public market
     * @param friendMarketId ID of the friend market
     */
    function autoResolvePeggedMarket(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();

        FriendMarket storage market = friendMarkets[friendMarketId];
        if (!market.active) revert NotActive();
        if (!market.autoPegged) revert NotPegged();
        if (market.peggedPublicMarketId == 0) revert NotPegged();

        ConditionalMarketFactory.Market memory publicMarket = marketFactory.getMarket(market.peggedPublicMarketId);
        if (!publicMarket.resolved) revert NotResolved();
        
        // Resolve friend market based on public market outcome
        market.active = false;
        
        emit PeggedMarketAutoResolved(
            friendMarketId,
            market.peggedPublicMarketId,
            publicMarket.passValue,
            publicMarket.failValue
        );
        
        // Also emit standard resolution event
        bool outcome = publicMarket.passValue > publicMarket.failValue;
        emit MarketResolved(friendMarketId, msg.sender, outcome);
    }
    
    /**
     * @notice Batch resolve all pegged markets for a resolved public market
     * @param publicMarketId ID of the resolved public market
     */
    function batchAutoResolvePeggedMarkets(uint256 publicMarketId) external nonReentrant {
        if (publicMarketId >= marketFactory.marketCount()) revert InvalidMarketId();

        ConditionalMarketFactory.Market memory publicMarket = marketFactory.getMarket(publicMarketId);
        if (!publicMarket.resolved) revert NotResolved();

        uint256[] storage peggedMarkets = publicMarketToPeggedFriendMarkets[publicMarketId];

        for (uint256 i = 0; i < peggedMarkets.length; i++) {
            uint256 friendMarketId = peggedMarkets[i];
            FriendMarket storage market = friendMarkets[friendMarketId];

            if (market.active && market.autoPegged) {
                market.active = false;

                emit PeggedMarketAutoResolved(
                    friendMarketId,
                    publicMarketId,
                    publicMarket.passValue,
                    publicMarket.failValue
                );

                bool outcome = publicMarket.passValue > publicMarket.failValue;
                emit MarketResolved(friendMarketId, msg.sender, outcome);
            }
        }
    }

    // ========== Polymarket Oracle Integration Functions ==========

    /**
     * @notice Peg a friend market to a Polymarket condition for oracle resolution
     * @dev This allows the friend market to be resolved based on Polymarket's outcome
     * @param friendMarketId ID of the friend market
     * @param conditionId Polymarket condition ID (from their CTF)
     */
    function pegToPolymarketCondition(uint256 friendMarketId, bytes32 conditionId) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        if (address(polymarketAdapter) == address(0)) revert PolymarketAdapterNotSet();
        if (conditionId == bytes32(0)) revert InvalidConditionId();

        FriendMarket storage market = friendMarkets[friendMarketId];
        if (!market.active) revert NotActive();
        if (msg.sender != market.creator) revert NotAuthorized();
        if (market.polymarketConditionId != bytes32(0)) revert AlreadyPeggedToPolymarket();
        if (market.autoPegged) revert AlreadyPegged(); // Can't use both public market and Polymarket pegging

        // Link in the adapter (validates condition exists)
        polymarketAdapter.linkMarketToPolymarket(friendMarketId, conditionId);

        market.polymarketConditionId = conditionId;
        market.resolutionType = ResolutionType.PolymarketOracle;

        polymarketConditionToFriendMarkets[conditionId].push(friendMarketId);

        emit MarketPeggedToPolymarket(friendMarketId, conditionId);
    }

    /**
     * @notice Resolve a friend market based on its linked Polymarket condition
     * @param friendMarketId ID of the friend market
     */
    function resolveFromPolymarket(uint256 friendMarketId) external nonReentrant {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        if (address(polymarketAdapter) == address(0)) revert PolymarketAdapterNotSet();

        FriendMarket storage market = friendMarkets[friendMarketId];
        if (!market.active) revert NotActive();
        if (market.polymarketConditionId == bytes32(0)) revert InvalidConditionId();
        if (market.resolutionType != ResolutionType.PolymarketOracle) revert InvalidResolutionType();

        // Fetch resolution from Polymarket via adapter
        (
            uint256 passNumerator,
            uint256 failNumerator,
            uint256 denominator,
            bool resolved
        ) = polymarketAdapter.getResolutionForMarket(friendMarketId);

        if (!resolved) revert PolymarketNotResolved();

        // Determine outcome
        bool outcome;
        if (passNumerator == failNumerator) {
            // Tie - default to fail (conservative approach)
            outcome = false;
        } else {
            outcome = passNumerator > failNumerator;
        }

        // Resolve the market
        market.active = false;
        market.status = FriendMarketStatus.Resolved;

        emit PolymarketMarketResolved(
            friendMarketId,
            market.polymarketConditionId,
            passNumerator,
            failNumerator,
            outcome
        );
        emit MarketResolved(friendMarketId, msg.sender, outcome);
    }

    /**
     * @notice Batch resolve all friend markets pegged to a Polymarket condition
     * @param conditionId The Polymarket condition ID
     */
    function batchResolveFromPolymarket(bytes32 conditionId) external nonReentrant {
        if (address(polymarketAdapter) == address(0)) revert PolymarketAdapterNotSet();
        if (conditionId == bytes32(0)) revert InvalidConditionId();

        // Check if condition is resolved
        if (!polymarketAdapter.isConditionResolved(conditionId)) revert PolymarketNotResolved();

        // Fetch resolution data
        (uint256 passNumerator, uint256 failNumerator, ) = polymarketAdapter.fetchResolution(conditionId);

        // Determine outcome
        bool outcome = passNumerator > failNumerator;

        uint256[] storage peggedMarkets = polymarketConditionToFriendMarkets[conditionId];

        for (uint256 i = 0; i < peggedMarkets.length; i++) {
            uint256 friendMarketId = peggedMarkets[i];
            FriendMarket storage market = friendMarkets[friendMarketId];

            if (market.active && market.resolutionType == ResolutionType.PolymarketOracle) {
                market.active = false;
                market.status = FriendMarketStatus.Resolved;

                emit PolymarketMarketResolved(
                    friendMarketId,
                    conditionId,
                    passNumerator,
                    failNumerator,
                    outcome
                );
                emit MarketResolved(friendMarketId, msg.sender, outcome);
            }
        }
    }

    /**
     * @notice Get all friend markets linked to a Polymarket condition
     * @param conditionId The Polymarket condition ID
     * @return Array of friend market IDs
     */
    function getFriendMarketsForPolymarketCondition(bytes32 conditionId) external view returns (uint256[] memory) {
        return polymarketConditionToFriendMarkets[conditionId];
    }

    /**
     * @notice Check if a friend market is pegged to Polymarket
     * @param friendMarketId ID of the friend market
     */
    function isPeggedToPolymarket(uint256 friendMarketId) external view returns (bool) {
        if (friendMarketId >= friendMarketCount) return false;
        return friendMarkets[friendMarketId].polymarketConditionId != bytes32(0);
    }

    /**
     * @notice Get Polymarket condition ID for a friend market
     * @param friendMarketId ID of the friend market
     */
    function getPolymarketConditionId(uint256 friendMarketId) external view returns (bytes32) {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        return friendMarkets[friendMarketId].polymarketConditionId;
    }
    
    /**
     * @notice Resolve a friend market based on resolution type
     * @param friendMarketId ID of the friend market
     * @param outcome True for positive outcome, false for negative
     * @dev NOTE: This simplified implementation emits events only.
     * In production, this would integrate with OracleResolver to properly
     * resolve the underlying ConditionalMarketFactory market and enable
     * token redemption based on the outcome.
     */
    function resolveFriendMarket(uint256 friendMarketId, bool outcome) external {
        if (friendMarketId >= friendMarketCount) revert InvalidMarketId();
        FriendMarket storage market = friendMarkets[friendMarketId];
        if (!market.active) revert NotActive();
        if (market.autoPegged) revert AlreadyPegged();

        bool canResolve = false;

        // Determine resolution authority based on resolutionType
        if (market.resolutionType == ResolutionType.Either) {
            // Either creator or opponent can resolve (default behavior)
            // Also allows arbitrator if set
            canResolve = msg.sender == market.creator ||
                         (market.members.length > 1 && msg.sender == market.members[1]) ||
                         (market.arbitrator != address(0) && msg.sender == market.arbitrator);
        } else if (market.resolutionType == ResolutionType.Initiator) {
            // Only creator can resolve
            canResolve = msg.sender == market.creator;
        } else if (market.resolutionType == ResolutionType.Receiver) {
            // Only opponent (second member) can resolve
            canResolve = market.members.length > 1 && msg.sender == market.members[1];
        } else if (market.resolutionType == ResolutionType.ThirdParty) {
            // Only designated arbitrator can resolve
            canResolve = market.arbitrator != address(0) && msg.sender == market.arbitrator;
        } else if (market.resolutionType == ResolutionType.AutoPegged) {
            // Auto-pegged markets should use autoResolvePeggedMarket instead
            revert NotAuthorized();
        } else if (market.resolutionType == ResolutionType.PolymarketOracle) {
            // Polymarket-pegged markets should use resolveFromPolymarket instead
            revert NotAuthorized();
        }

        if (!canResolve) revert NotAuthorized();

        market.active = false;
        market.status = FriendMarketStatus.Resolved;

        // Resolve underlying market
        // NOTE: In production, this would call marketFactory.resolveMarket()
        // or OracleResolver to properly resolve the underlying market and
        // enable participants to redeem their tokens based on the outcome.
        // Current implementation emits events for tracking purposes only.
        emit MarketResolved(friendMarketId, msg.sender, outcome);
    }
    
    /**
     * @notice Withdraw accumulated fees (owner only)
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert InsufficientPayment();

        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    function updateMarketFactory(address _marketFactory) external onlyOwner {
        if (_marketFactory == address(0)) revert InvalidAddress();
        marketFactory = ConditionalMarketFactory(_marketFactory);
    }

    function updateRagequitModule(address payable _ragequitModule) external onlyOwner {
        if (_ragequitModule == address(0)) revert InvalidAddress();
        ragequitModule = RagequitModule(_ragequitModule);
    }

    function getPeggedFriendMarkets(uint256 publicMarketId) external view returns (uint256[] memory) {
        if (publicMarketId >= marketFactory.marketCount()) revert InvalidMarketId();
        return publicMarketToPeggedFriendMarkets[publicMarketId];
    }

    /**
     * @notice Get list of accepted payment tokens (returns full list, check acceptedPaymentTokens for status)
     */
    function getAcceptedTokens() external view returns (address[] memory) {
        return acceptedTokenList;
    }
    
    receive() external payable {}
}
