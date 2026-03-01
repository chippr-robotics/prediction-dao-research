// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./FriendGroupMarketTypes.sol";

/**
 * @title FriendGroupClaimsLib
 * @notice External library for claims, timeout, and refund logic (deployed separately via DELEGATECALL)
 * @dev Uses storage references to avoid struct encoding overhead
 */
library FriendGroupClaimsLib {
    error WagerNotResolved();
    error NotWinner();
    error AlreadyClaimed();
    error TreasuryNotSet();
    error ClaimTimeoutNotExpired();
    error NotOraclePegged();
    error NotActive();
    error NotTimedOut();
    error NotAuthorized();
    error OracleTimeoutNotExpired();
    error RefundAlreadyAccepted();
    error InvalidTimestamp();

    // Events
    event WinningsClaimed(uint256 indexed friendMarketId, address indexed winner, uint256 amount, address token);
    event UnclaimedFundsSwept(uint256 indexed friendMarketId, uint256 amount, address token, address treasury);
    event OracleTimeoutTriggered(uint256 indexed friendMarketId, uint256 expectedTime, uint256 actualTime);
    event RefundAccepted(uint256 indexed friendMarketId, address indexed participant);
    event MutualRefundCompleted(uint256 indexed friendMarketId, uint256 totalRefunded);
    event MarketResolved(uint256 indexed friendMarketId, address indexed resolver, bool outcome);

    // ========== Claim Functions ==========

    function computeClaim(
        FriendMarket storage market,
        uint256 friendMarketId,
        address winner,
        bool alreadyClaimed,
        uint256 totalStaked,
        address caller
    ) public returns (uint256 amount, address token) {
        if (market.status != FriendMarketStatus.Resolved) revert WagerNotResolved();
        if (caller != winner) revert NotWinner();
        if (alreadyClaimed) revert AlreadyClaimed();

        amount = totalStaked;
        token = market.stakeToken;

        emit WinningsClaimed(friendMarketId, winner, amount, token);
    }

    function computeSweep(
        FriendMarket storage market,
        uint256 friendMarketId,
        bool alreadyClaimed,
        uint256 resolvedTime,
        uint256 totalStaked,
        uint256 claimTimeoutSec,
        address treasuryAddr
    ) public returns (uint256 amount, address token) {
        if (treasuryAddr == address(0)) revert TreasuryNotSet();
        if (market.status != FriendMarketStatus.Resolved) revert WagerNotResolved();
        if (alreadyClaimed) revert AlreadyClaimed();
        if (block.timestamp < resolvedTime + claimTimeoutSec) revert ClaimTimeoutNotExpired();

        amount = totalStaked;
        token = market.stakeToken;

        emit UnclaimedFundsSwept(friendMarketId, amount, token, treasuryAddr);
    }

    // ========== Oracle Timeout Functions ==========

    function validateSetExpectedResolutionTime(
        FriendMarket storage market,
        uint256 timestamp,
        address caller
    ) public view {
        if (caller != market.creator) revert NotAuthorized();
        if (market.resolutionType != ResolutionType.AutoPegged &&
            market.resolutionType != ResolutionType.PolymarketOracle) {
            revert NotOraclePegged();
        }
        if (market.status != FriendMarketStatus.Active) revert NotActive();
        if (timestamp <= block.timestamp) revert InvalidTimestamp();
    }

    function computeOracleTimeout(
        FriendMarket storage market,
        uint256 friendMarketId,
        uint256 expectedTime,
        uint256 oracleTimeoutSec
    ) public {
        if (market.resolutionType != ResolutionType.AutoPegged &&
            market.resolutionType != ResolutionType.PolymarketOracle) {
            revert NotOraclePegged();
        }
        if (market.status != FriendMarketStatus.Active) revert NotActive();
        if (expectedTime == 0) revert InvalidTimestamp();
        if (block.timestamp < expectedTime + oracleTimeoutSec) revert OracleTimeoutNotExpired();

        market.active = false;
        market.status = FriendMarketStatus.OracleTimedOut;

        emit OracleTimeoutTriggered(friendMarketId, expectedTime, block.timestamp);
    }

    function computeRefundAcceptance(
        FriendMarket storage market,
        uint256 friendMarketId,
        address caller,
        bool alreadyAccepted,
        uint256 currentCount
    ) public returns (bool allAccepted) {
        if (market.status != FriendMarketStatus.OracleTimedOut) revert NotTimedOut();

        bool isParticipant = caller == market.creator ||
                             (market.members.length > 1 && caller == market.members[1]);
        if (!isParticipant) revert NotAuthorized();
        if (alreadyAccepted) revert RefundAlreadyAccepted();

        emit RefundAccepted(friendMarketId, caller);

        uint256 requiredAcceptances = market.members.length > 1 ? 2 : 1;
        allAccepted = (currentCount + 1) >= requiredAcceptances;
    }

    function computeForceResolution(
        FriendMarket storage market,
        uint256 friendMarketId,
        bool outcome,
        address caller,
        address contractOwner
    ) public returns (address winner) {
        if (market.status != FriendMarketStatus.OracleTimedOut) revert NotTimedOut();

        bool canForce = (market.arbitrator != address(0) && caller == market.arbitrator) ||
                        (market.arbitrator == address(0) && caller == contractOwner);
        if (!canForce) revert NotAuthorized();

        if (outcome) {
            winner = market.creator;
        } else if (market.members.length > 1) {
            winner = market.members[1];
        }

        market.status = FriendMarketStatus.Resolved;

        emit MarketResolved(friendMarketId, caller, outcome);
    }

    function computeRefund(
        FriendMarket storage market,
        uint256 friendMarketId
    ) public returns (uint256 totalRefunded) {
        uint256 stakePerPerson = market.stakePerParticipant;
        totalRefunded = stakePerPerson;
        if (market.members.length > 1) {
            totalRefunded += stakePerPerson;
        }

        emit MutualRefundCompleted(friendMarketId, totalRefunded);
    }
}
