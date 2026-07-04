// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWagerRegistryTypes} from "./IWagerRegistryTypes.sol";

/// @title IWagerRegistry
/// @notice Public surface area for off-chain integrators (frontend, indexers). Types and events
///         live in {IWagerRegistryTypes} (shared with the intents extension facet, spec 035).
/// @dev    `batchExpireOpen` and the signer-attributed `…WithSig`/`…WithAuthorization` twins are
///         served at the SAME proxy address but declared on {IWagerRegistryIntents} — they execute
///         in the {WagerRegistryIntents} extension facet via the registry's fallback (spec 035;
///         the main implementation sits against the 24 KB code-size limit).
interface IWagerRegistry is IWagerRegistryTypes {
    function createWager(
        address opponent,
        address arbitrator,
        address token,
        uint128 creatorStake,
        uint128 opponentStake,
        uint64 acceptDeadline,
        uint64 resolveDeadline,
        ResolutionType resolutionType,
        bytes32 polymarketConditionId,
        bool creatorIsYes,
        bytes32 metadataHash,
        string calldata metadataUri
    ) external returns (uint256 wagerId);

    function acceptWager(uint256 wagerId) external;

    // ----- Open challenges (feature 024): no named opponent, gated by a code-derived claim authority -----
    function createOpenWager(
        address claimAuthority_,
        address arbitrator,
        address token,
        uint128 stake,
        uint64 acceptDeadline,
        uint64 resolveDeadline,
        ResolutionType resolutionType,
        bytes32 oracleConditionId,
        bool creatorIsYes,
        bytes32 metadataHash,
        string calldata metadataUri
    ) external returns (uint256 wagerId);

    function acceptOpenWager(uint256 wagerId, bytes calldata signature) external;
    function openWagerIdForClaim(address authority) external view returns (uint256);
    function isOpenChallenge(uint256 wagerId) external view returns (bool);

    function cancelOpen(uint256 wagerId) external;
    function declineWager(uint256 wagerId) external;
    function declareWinner(uint256 wagerId, address winner) external;
    function declareDraw(uint256 wagerId) external;
    function revokeDraw(uint256 wagerId) external;
    function claimPayout(uint256 wagerId) external;
    function claimRefund(uint256 wagerId) external;

    function freezeAccount(address user, string calldata reason) external;
    function unfreezeAccount(address user) external;
    function isFrozen(address user) external view returns (bool);

    function getWager(uint256 wagerId) external view returns (Wager memory);
    function drawConsent(uint256 wagerId) external view returns (bool creatorAgreed, bool opponentAgreed);
    function isAllowedToken(address token) external view returns (bool);
    function nextWagerId() external view returns (uint256);

    function getUserWagerCount(address user) external view returns (uint256);
    function getUserWagerIds(address user, uint256 offset, uint256 limit) external view returns (uint256[] memory);
    function getUserWagers(address user, uint256 offset, uint256 limit) external view returns (Wager[] memory);
}
