// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

// Shared enums, structs for FriendGroupMarketFactory and its external libraries.
// Defined at file level so both the main contract and libraries can reference
// the same types without circular imports.

enum MarketType {
    OneVsOne,
    SmallGroup,
    EventTracking,
    PropBet,
    Bookmaker
}

enum FriendMarketStatus {
    PendingAcceptance,
    Active,
    PendingResolution,
    Challenged,
    Resolved,
    Cancelled,
    Refunded,
    OracleTimedOut
}

enum ResolutionType {
    Either,
    Initiator,
    Receiver,
    ThirdParty,
    AutoPegged,
    PolymarketOracle
}

struct AcceptanceRecord {
    address participant;
    uint256 stakedAmount;
    uint256 acceptedAt;
    bool hasAccepted;
    bool isArbitrator;
}

struct FriendMarket {
    uint256 marketId;
    MarketType marketType;
    address creator;
    address[] members;
    address arbitrator;
    uint256 memberLimit;
    uint256 creationFee;
    uint256 createdAt;
    bool active;
    string description;
    uint256 peggedPublicMarketId;
    bool autoPegged;
    address paymentToken;
    uint256 liquidityAmount;
    FriendMarketStatus status;
    uint256 acceptanceDeadline;
    uint256 minAcceptanceThreshold;
    uint256 stakePerParticipant;
    address stakeToken;
    uint256 tradingPeriodSeconds;
    uint16 opponentOddsMultiplier;
    ResolutionType resolutionType;
    bytes32 polymarketConditionId;
}

struct PendingResolutionData {
    bool proposedOutcome;
    address proposer;
    uint256 proposedAt;
    uint256 challengeDeadline;
    address challenger;
    uint256 challengeBondPaid;
}

/**
 * @title IFriendGroupErrors
 * @notice All custom error declarations for FriendGroupMarketFactory and its external libraries.
 * The main contract inherits this interface so all error selectors appear in its ABI,
 * allowing off-chain tools and tests to decode reverts from library DELEGATECALL.
 * Costs zero runtime bytecode.
 */
interface IFriendGroupErrors {
    // Main contract errors
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
    error NotPegged();
    error NotResolved();
    error TransferFailed();
    error InsufficientPayment();
    error InvalidMember();
    error InvalidOdds();
    error MissingMarketMakerRole();
    error InvalidResolutionType();
    error PolymarketAdapterNotSet();
    error OracleRegistryNotSet();
    error OracleConditionNotResolved();
    error InvalidConditionId();
    error PolymarketNotResolved();
    error InvalidChallengePeriod();
    error InvalidChallengeBond();
    error InvalidClaimTimeout();
    error InvalidOracleTimeout();
    error AlreadyTimedOut();
    error RefundNotInitiated();
    error NotPending();

    // FriendGroupCreationLib errors
    error DeadlinePassed();
    error DeadlineNotPassed();
    error AlreadyAccepted();
    error NotInvited();
    error NotActive();
    error AlreadyMember();
    error NotMember();
    error MemberLimitReached();

    // FriendGroupResolutionLib errors
    error AlreadyPegged();
    error NotPendingResolution();
    error ChallengePeriodNotExpired();
    error AlreadyChallenged();
    error InsufficientChallengeBond();
    error NotChallenged();
    error NotInChallengePeriod();
    error AlreadyPeggedToPolymarket();
    error AlreadyPeggedToOracle();

    // FriendGroupClaimsLib errors
    error WagerNotResolved();
    error NotWinner();
    error AlreadyClaimed();
    error TreasuryNotSet();
    error ClaimTimeoutNotExpired();
    error NotOraclePegged();
    error NotTimedOut();
    error OracleTimeoutNotExpired();
    error RefundAlreadyAccepted();
    error InvalidTimestamp();
}
