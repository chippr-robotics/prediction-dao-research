// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWagerRegistryTypes} from "./IWagerRegistryTypes.sol";
import {ERC3009Auth} from "./IERC3009.sol";

/// @title IWagerRegistryIntents
/// @notice The signer-attributed (gasless) surface of the wager registry (spec 035). These
///         functions are called at the SAME proxy address as {IWagerRegistry} — the main
///         implementation forwards unknown selectors to the {WagerRegistryIntents} extension
///         facet via delegatecall, so state, events, and the EIP-712 domain are the proxy's own.
interface IWagerRegistryIntents is IWagerRegistryTypes {
    /// @notice Parameters for a relayed wager creation. Mirrors `createWagerWithTerms`'s argument
    ///         list plus `paymentNonce` — the EIP-3009 nonce of the stake authorization the creator
    ///         stapled to this intent (asserted against `stakeAuth.nonce` on-chain, FR-007).
    struct CreateArgs {
        address opponent;
        address arbitrator;
        address token;
        uint128 creatorStake;
        uint128 opponentStake;
        uint64 acceptDeadline;
        uint64 resolveDeadline;
        ResolutionType resolutionType;
        bytes32 conditionId;
        bool creatorIsYes;
        bytes32 metadataHash;
        string metadataUri;
        bytes32 termsVersionHash;
        bytes32 paymentNonce;
    }

    event FeeNettingUpdated(bool enabled, address indexed gasFeeRecipient, uint256 maxGasFee);

    // ---- Money-in twins (EIP-3009 stake pull from the signer, atomic with the action) ----
    function createWagerWithAuthorization(
        CreateArgs calldata args,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata stakeAuth,
        ERC3009Auth calldata feeAuth
    ) external returns (uint256 wagerId);

    function acceptWagerWithAuthorization(
        uint256 wagerId,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata stakeAuth,
        ERC3009Auth calldata feeAuth
    ) external;

    function acceptOpenWagerWithAuthorization(
        uint256 wagerId,
        address signer,
        bytes calldata claimCodeSig,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata stakeAuth,
        ERC3009Auth calldata feeAuth
    ) external;

    // ---- No-stake twins (…WithSig) ----
    function claimPayoutWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function claimRefundWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function declareDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function revokeDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function cancelOpenWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function declineWagerWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function declareWinnerWithSig(uint256 wagerId, address winner, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;

    // NOTE: the intent-nonce management surface — invalidateNonce(bytes32),
    // invalidateNonceWithSig(address,bytes32,uint256,bytes), authorizationState(address,bytes32),
    // DOMAIN_SEPARATOR() — is inherited from {SignerIntentBase} by the implementing facet and is
    // part of the on-chain ABI at the proxy address. It is not re-declared here to avoid duplicate
    // base declarations in the implementing contract.

    // ---- Relocated cold paths (previously on IWagerRegistry; same proxy address, unchanged behavior) ----
    function batchExpireOpen(uint256[] calldata wagerIds) external;
    function autoResolveFromPolymarket(uint256 wagerId) external;
    function autoResolveFromOracle(uint256 wagerId) external;

    // ---- Fee-netting admin ----
    function setFeeNetting(bool enabled, address recipient, uint256 cap) external;
}
