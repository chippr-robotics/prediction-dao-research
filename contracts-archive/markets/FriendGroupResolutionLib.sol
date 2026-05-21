// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./FriendGroupMarketTypes.sol";

/**
 * @title FriendGroupResolutionLib
 * @notice External library for market resolution logic (deployed separately via DELEGATECALL)
 * @dev Uses storage references to avoid struct encoding overhead
 */
library FriendGroupResolutionLib {
    error NotActive();
    error AlreadyPegged();
    error NotAuthorized();
    error NotPegged();
    error NotPendingResolution();
    error ChallengePeriodNotExpired();
    error AlreadyChallenged();
    error InsufficientChallengeBond();
    error NotChallenged();
    error NotInChallengePeriod();
    error InvalidResolutionType();
    error PolymarketNotResolved();
    error InvalidConditionId();
    error AlreadyPeggedToPolymarket();
    error AlreadyPeggedToOracle();
    error OracleConditionNotResolved();
    error PolymarketAdapterNotSet();
    error OracleRegistryNotSet();

    // Events (emitted via DELEGATECALL, appear as main contract events)
    event ResolutionProposed(uint256 indexed friendMarketId, address indexed proposer, bool proposedOutcome, uint256 challengeDeadline);
    event ResolutionChallenged(uint256 indexed friendMarketId, address indexed challenger, uint256 bondAmount);
    event ResolutionFinalized(uint256 indexed friendMarketId, bool outcome);
    event DisputeResolved(uint256 indexed friendMarketId, address indexed resolver, bool outcome, address bondRecipient, uint256 bondAmount);
    event MarketResolved(uint256 indexed friendMarketId, address indexed resolver, bool outcome);
    event PeggedMarketAutoResolved(uint256 indexed friendMarketId, uint256 indexed publicMarketId, uint256 passValue, uint256 failValue);
    event PolymarketMarketResolved(uint256 indexed friendMarketId, bytes32 indexed conditionId, uint256 passNumerator, uint256 failNumerator, bool outcome);
    event MarketPeggedToPublic(uint256 indexed friendMarketId, uint256 indexed publicMarketId);
    event MarketPeggedToPolymarket(uint256 indexed friendMarketId, bytes32 indexed conditionId);
    event MarketPeggedToOracle(uint256 indexed friendMarketId, bytes32 indexed oracleId, bytes32 indexed conditionId);
    event OracleMarketResolved(uint256 indexed friendMarketId, bytes32 indexed oracleId, bytes32 conditionId, bool outcome);

    function _determineWinner(bool outcome, FriendMarket storage market) private view returns (address) {
        if (outcome) return market.creator;
        if (market.members.length > 1) return market.members[1];
        return address(0);
    }

    // ========== Manual Resolution (Challenge System) ==========

    function computeManualResolution(
        FriendMarket storage market,
        PendingResolutionData storage pending,
        uint256 friendMarketId,
        bool outcome,
        address caller,
        uint256 challengePeriodSec
    ) public {
        if (!market.active) revert NotActive();
        if (market.autoPegged) revert AlreadyPegged();

        bool canResolve = false;
        ResolutionType rt = market.resolutionType;

        if (rt == ResolutionType.Either) {
            canResolve = caller == market.creator ||
                         (market.members.length > 1 && caller == market.members[1]) ||
                         (market.arbitrator != address(0) && caller == market.arbitrator);
        } else if (rt == ResolutionType.Initiator) {
            canResolve = caller == market.creator;
        } else if (rt == ResolutionType.Receiver) {
            canResolve = market.members.length > 1 && caller == market.members[1];
        } else if (rt == ResolutionType.ThirdParty) {
            canResolve = market.arbitrator != address(0) && caller == market.arbitrator;
        } else {
            revert NotAuthorized();
        }
        if (!canResolve) revert NotAuthorized();

        market.active = false;
        market.status = FriendMarketStatus.PendingResolution;

        uint256 deadline = block.timestamp + challengePeriodSec;
        pending.proposedOutcome = outcome;
        pending.proposer = caller;
        pending.proposedAt = block.timestamp;
        pending.challengeDeadline = deadline;
        pending.challenger = address(0);
        pending.challengeBondPaid = 0;

        emit ResolutionProposed(friendMarketId, caller, outcome, deadline);
    }

    function computeChallenge(
        FriendMarket storage market,
        PendingResolutionData storage pending,
        uint256 friendMarketId,
        address caller,
        uint256 msgValue,
        uint256 challengeBondAmt
    ) public {
        if (market.status != FriendMarketStatus.PendingResolution) revert NotPendingResolution();
        if (block.timestamp >= pending.challengeDeadline) revert ChallengePeriodNotExpired();
        if (pending.challenger != address(0)) revert AlreadyChallenged();

        bool isParticipant = caller == market.creator ||
                             (market.members.length > 1 && caller == market.members[1]);
        if (!isParticipant) revert NotAuthorized();
        if (caller == pending.proposer) revert NotAuthorized();
        if (msgValue < challengeBondAmt) revert InsufficientChallengeBond();

        pending.challenger = caller;
        pending.challengeBondPaid = msgValue;
        market.status = FriendMarketStatus.Challenged;

        emit ResolutionChallenged(friendMarketId, caller, msgValue);
    }

    function computeFinalization(
        FriendMarket storage market,
        PendingResolutionData storage pending,
        uint256 friendMarketId
    ) public returns (bool outcome, address winner) {
        if (market.status != FriendMarketStatus.PendingResolution) revert NotPendingResolution();
        if (block.timestamp < pending.challengeDeadline) revert NotInChallengePeriod();

        outcome = pending.proposedOutcome;
        winner = _determineWinner(outcome, market);
        market.status = FriendMarketStatus.Resolved;

        emit ResolutionFinalized(friendMarketId, outcome);
        emit MarketResolved(friendMarketId, pending.proposer, outcome);
    }

    function computeDisputeResolution(
        FriendMarket storage market,
        PendingResolutionData storage pending,
        uint256 friendMarketId,
        bool outcome,
        address caller,
        address contractOwner
    ) public returns (bool, address winner, address bondRecipient, uint256 bondAmount) {
        if (market.status != FriendMarketStatus.Challenged) revert NotChallenged();

        bool canResolveDispute = (market.arbitrator != address(0) && caller == market.arbitrator) ||
                                  (market.arbitrator == address(0) && caller == contractOwner);
        if (!canResolveDispute) revert NotAuthorized();

        bondAmount = pending.challengeBondPaid;
        bondRecipient = (outcome == pending.proposedOutcome) ? pending.proposer : pending.challenger;

        winner = _determineWinner(outcome, market);
        market.status = FriendMarketStatus.Resolved;

        emit DisputeResolved(friendMarketId, caller, outcome, bondRecipient, bondAmount);
        emit MarketResolved(friendMarketId, caller, outcome);

        return (outcome, winner, bondRecipient, bondAmount);
    }

    // ========== Public Market Pegging ==========

    function validatePegToPublicMarket(
        FriendMarket storage market,
        address caller
    ) public view {
        if (!market.active) revert NotActive();
        if (caller != market.creator) revert NotAuthorized();
        if (market.autoPegged) revert AlreadyPegged();
    }

    function computeAutoResolution(
        FriendMarket storage market,
        uint256 friendMarketId,
        uint256 passValue,
        uint256 failValue,
        uint256 publicMarketId,
        address resolver
    ) public returns (bool outcome, address winner) {
        if (!market.active) revert NotActive();
        if (!market.autoPegged) revert NotPegged();

        outcome = passValue > failValue;
        winner = _determineWinner(outcome, market);

        market.active = false;
        market.status = FriendMarketStatus.Resolved;

        emit PeggedMarketAutoResolved(friendMarketId, publicMarketId, passValue, failValue);
        emit MarketResolved(friendMarketId, resolver, outcome);
    }

    // ========== Polymarket Oracle ==========

    function validatePegToPolymarket(
        FriendMarket storage market,
        bytes32 conditionId,
        address caller,
        address adapterAddr
    ) public view {
        if (adapterAddr == address(0)) revert PolymarketAdapterNotSet();
        if (conditionId == bytes32(0)) revert InvalidConditionId();
        if (!market.active) revert NotActive();
        if (caller != market.creator) revert NotAuthorized();
        if (market.polymarketConditionId != bytes32(0)) revert AlreadyPeggedToPolymarket();
        if (market.autoPegged) revert AlreadyPegged();
    }

    function computePolymarketResolution(
        FriendMarket storage market,
        uint256 friendMarketId,
        uint256 passNumerator,
        uint256 failNumerator,
        bool resolved,
        address resolver
    ) public returns (bool outcome, address winner) {
        if (!market.active) revert NotActive();
        if (market.polymarketConditionId == bytes32(0)) revert InvalidConditionId();
        if (market.resolutionType != ResolutionType.PolymarketOracle) revert InvalidResolutionType();
        if (!resolved) revert PolymarketNotResolved();

        outcome = passNumerator > failNumerator;
        winner = _determineWinner(outcome, market);

        market.active = false;
        market.status = FriendMarketStatus.Resolved;

        emit PolymarketMarketResolved(friendMarketId, market.polymarketConditionId, passNumerator, failNumerator, outcome);
        emit MarketResolved(friendMarketId, resolver, outcome);
    }

    // ========== Oracle Registry ==========

    function validatePegToOracle(
        FriendMarket storage market,
        bytes32 existingConditionId,
        address caller,
        address registryAddr
    ) public view {
        if (registryAddr == address(0)) revert OracleRegistryNotSet();
        if (!market.active) revert NotActive();
        if (caller != market.creator) revert NotAuthorized();
        if (existingConditionId != bytes32(0)) revert AlreadyPeggedToOracle();
        if (market.polymarketConditionId != bytes32(0)) revert AlreadyPeggedToPolymarket();
        if (market.autoPegged) revert AlreadyPegged();
    }

    function computeOracleResolution(
        FriendMarket storage market,
        uint256 friendMarketId,
        bytes32 oracleId,
        bytes32 conditionId,
        bool outcome,
        uint256 confidence,
        address resolver
    ) public returns (address winner) {
        if (!market.active) revert NotActive();
        if (conditionId == bytes32(0)) revert InvalidConditionId();
        if (confidence == 0) revert OracleConditionNotResolved();

        winner = _determineWinner(outcome, market);

        market.active = false;
        market.status = FriendMarketStatus.Resolved;

        emit OracleMarketResolved(friendMarketId, oracleId, conditionId, outcome);
        emit MarketResolved(friendMarketId, resolver, outcome);
    }
}
