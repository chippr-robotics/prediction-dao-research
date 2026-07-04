// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {WagerRegistryCore} from "./WagerRegistryCore.sol";
import {SignerIntentBase} from "../upgradeable/SignerIntentBase.sol";
import {IWagerRegistryIntents} from "../interfaces/IWagerRegistryIntents.sol";
import {ERC3009Auth} from "../interfaces/IERC3009.sol";
import {IOracleAdapter} from "../oracles/IOracleAdapter.sol";

/// @title WagerRegistryIntents
/// @notice The signer-attributed (gasless) extension facet of the wager registry (spec 035).
///         Deployed as a SEPARATE implementation and reached through {WagerRegistry}'s fallback
///         via delegatecall — it executes in the proxy's storage context, so all state, events,
///         and the "FairWins WagerRegistry" EIP-712 domain (bound to the proxy address) are the
///         registry's own. Exists because the main implementation sits against the 24 KB
///         code-size limit; both facets inherit {WagerRegistryCore} so the storage layout and
///         action bodies cannot drift.
/// @dev    Every twin: (1) verifies the intent (window, signature recovering exactly `signer`,
///         single-use nonce — {SignerIntentBase}), (2) runs the SAME checks as the self-submit
///         path against the recovered `signer` (sanctions, membership, ownership, freeze —
///         fail-closed, FR-003/FR-013), (3) for money-in, pulls the stake from the signer via
///         their stapled EIP-3009 authorization atomically with the action (FR-007), and
///         (4) settles the optional bounded fee leg to the segregated recipient (FR-015/FR-016).
///         Never callable meaningfully at its own address: state there is empty/uninitialized and
///         initializers are disabled by {UUPSManaged}'s constructor.
///
///         `missing-initializer` is allowed BY DESIGN: this facet is never initialized — the proxy is
///         initialized exactly once through the main {WagerRegistry} facet, and this contract only ever
///         executes via delegatecall against that already-initialized storage.
/// @custom:oz-upgrades-unsafe-allow missing-initializer
contract WagerRegistryIntents is WagerRegistryCore, SignerIntentBase, IWagerRegistryIntents {
    // ---- Intent typehashes. Every struct binds the acting address, a single-use replay nonce, and
    //      a validity window; money-in structs also bind the EIP-3009 payment nonce so the money leg
    //      is stapled to this exact action (FR-007/FR-013). ----
    bytes32 private constant CREATE_WAGER_INTENT_TYPEHASH = keccak256(
        "CreateWagerIntent(address creator,address opponent,address arbitrator,address token,uint128 creatorStake,uint128 opponentStake,uint64 acceptDeadline,uint64 resolveDeadline,uint8 resolutionType,bytes32 conditionId,bool creatorIsYes,bytes32 metadataHash,string metadataUri,bytes32 termsVersionHash,bytes32 paymentNonce,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant ACCEPT_WAGER_INTENT_TYPEHASH = keccak256(
        "AcceptWagerIntent(uint256 wagerId,address taker,bytes32 paymentNonce,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant CLAIM_PAYOUT_INTENT_TYPEHASH = keccak256(
        "ClaimPayoutIntent(uint256 wagerId,address claimant,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant CLAIM_REFUND_INTENT_TYPEHASH = keccak256(
        "ClaimRefundIntent(uint256 wagerId,address actor,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant DECLARE_DRAW_INTENT_TYPEHASH = keccak256(
        "DeclareDrawIntent(uint256 wagerId,address actor,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant REVOKE_DRAW_INTENT_TYPEHASH = keccak256(
        "RevokeDrawIntent(uint256 wagerId,address actor,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant CANCEL_OPEN_INTENT_TYPEHASH = keccak256(
        "CancelOpenIntent(uint256 wagerId,address actor,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant DECLINE_INTENT_TYPEHASH = keccak256(
        "DeclineIntent(uint256 wagerId,address actor,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant DECLARE_WINNER_INTENT_TYPEHASH = keccak256(
        "DeclareWinnerIntent(uint256 wagerId,address winner,address actor,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );

    /// @dev EIP-3009 stake pull for the money-in twins: assert the authorization is the one the
    ///      signer stapled to the intent, then pull via receiveWithAuthorization. Self-submit calls
    ///      still take the allowance path (viaAuth=false).
    function _pullStake(
        address token,
        address from,
        uint128 amount,
        bytes32 paymentNonce,
        ERC3009Auth memory auth,
        bool viaAuth
    ) internal override {
        if (viaAuth) {
            _pullWithAuthorization(token, from, amount, paymentNonce, auth);
        } else {
            super._pullStake(token, from, amount, paymentNonce, auth, viaAuth);
        }
    }

    // ---------- Money-in twins (…WithAuthorization) ----------

    /// @notice Relayed {WagerRegistry.createWagerWithTerms}: one signature creates the wager and
    ///         escrows the creator's stake from their EIP-3009 authorization. `signer` becomes the
    ///         on-chain creator.
    function createWagerWithAuthorization(
        CreateArgs calldata args,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata stakeAuth,
        ERC3009Auth calldata feeAuth
    ) external nonReentrant whenNotPaused notFrozen(signer) returns (uint256 wagerId) {
        _verifyIntent(_hashCreateIntent(args, signer, nonce, validAfter, validBefore), signer, nonce, validAfter, validBefore, intentSig);
        wagerId = _createWager(signer, args, true, stakeAuth);
        _settleGasFee(args.token, signer, feeAuth, _feeNettingEnabled, _gasFeeRecipient, _maxGasFee);
    }

    /// @notice Relayed {WagerRegistry.acceptWager}. The stake authorization's EIP-3009 nonce is bound
    ///         into the signed intent as `paymentNonce`, so a relayer cannot pair the intent with a
    ///         different authorization.
    function acceptWagerWithAuthorization(
        uint256 wagerId,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata stakeAuth,
        ERC3009Auth calldata feeAuth
    ) external nonReentrant whenNotPaused notFrozen(signer) {
        _verifyIntent(
            keccak256(abi.encode(ACCEPT_WAGER_INTENT_TYPEHASH, wagerId, signer, stakeAuth.nonce, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, intentSig
        );
        _acceptWager(signer, wagerId, true, stakeAuth);
        _settleGasFee(_wagers[wagerId].token, signer, feeAuth, _feeNettingEnabled, _gasFeeRecipient, _maxGasFee);
    }

    /// @notice Relayed {WagerRegistry.acceptOpenWager}: two signatures — the claim-code proof rebound
    ///         to `taker = signer` (front-running defense preserved under a relayer, FR-011) plus the
    ///         taker's own accept intent carrying the stake authorization.
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
    ) external nonReentrant whenNotPaused notFrozen(signer) {
        _verifyIntent(
            keccak256(abi.encode(ACCEPT_WAGER_INTENT_TYPEHASH, wagerId, signer, stakeAuth.nonce, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, intentSig
        );
        _acceptOpenWager(signer, wagerId, claimCodeSig, true, stakeAuth);
        _settleGasFee(_wagers[wagerId].token, signer, feeAuth, _feeNettingEnabled, _gasFeeRecipient, _maxGasFee);
    }

    // ---------- No-stake twins (…WithSig) ----------

    /// @notice Relayed {WagerRegistry.claimPayout}: the payout lands in the winning signer's wallet,
    ///         zero native gas.
    function claimPayoutWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)
        external nonReentrant notFrozen(signer)
    {
        _verifyIntent(
            keccak256(abi.encode(CLAIM_PAYOUT_INTENT_TYPEHASH, wagerId, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _claimPayout(signer, wagerId);
    }

    /// @notice Relayed {WagerRegistry.claimRefund}.
    function claimRefundWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)
        external nonReentrant notFrozen(signer)
    {
        _verifyIntent(
            keccak256(abi.encode(CLAIM_REFUND_INTENT_TYPEHASH, wagerId, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _claimRefund(wagerId);
    }

    /// @notice Relayed {WagerRegistry.declareDraw}.
    function declareDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)
        external nonReentrant notFrozen(signer)
    {
        _verifyIntent(
            keccak256(abi.encode(DECLARE_DRAW_INTENT_TYPEHASH, wagerId, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _declareDraw(signer, wagerId);
    }

    /// @notice Relayed {WagerRegistry.revokeDraw}.
    function revokeDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)
        external nonReentrant notFrozen(signer)
    {
        _verifyIntent(
            keccak256(abi.encode(REVOKE_DRAW_INTENT_TYPEHASH, wagerId, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _revokeDraw(signer, wagerId);
    }

    /// @notice Relayed {WagerRegistry.cancelOpen}.
    function cancelOpenWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)
        external nonReentrant notFrozen(signer)
    {
        _verifyIntent(
            keccak256(abi.encode(CANCEL_OPEN_INTENT_TYPEHASH, wagerId, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _cancelOpen(signer, wagerId);
    }

    /// @notice Relayed {WagerRegistry.declineWager}.
    function declineWagerWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)
        external nonReentrant notFrozen(signer)
    {
        _verifyIntent(
            keccak256(abi.encode(DECLINE_INTENT_TYPEHASH, wagerId, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _declineWager(signer, wagerId);
    }

    /// @notice Relayed {WagerRegistry.declareWinner}.
    function declareWinnerWithSig(uint256 wagerId, address winner, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)
        external nonReentrant notFrozen(signer)
    {
        _verifyIntent(
            keccak256(abi.encode(DECLARE_WINNER_INTENT_TYPEHASH, wagerId, winner, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _declareWinner(signer, wagerId, winner);
    }

    // ---------- Relocated cold paths (behavior unchanged; served via the fallback) ----------

    function autoResolveFromPolymarket(uint256 wagerId) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (w.resolutionType != ResolutionType.Polymarket) revert NotAuthorized();
        if (address(polymarketAdapter) == address(0)) revert AdapterNotSet();

        (bool outcome, , uint256 resolvedAt) = polymarketAdapter.getOutcome(w.polymarketConditionId);
        if (resolvedAt == 0) {
            // getOutcome returns resolvedAt==0 for BOTH "not resolved" and a
            // "resolved tie" (equal payout numerators). Disambiguate: a resolved
            // tie settles a DRAW immediately (both stakes back); a genuinely
            // unresolved market reverts (unchanged behavior).
            if (polymarketAdapter.isConditionResolved(w.polymarketConditionId)) {
                _settleDraw(wagerId, w, msg.sender);
                return;
            }
            revert ConditionNotResolved();
        }
        _settleOracleWin(wagerId, w, outcome);
    }

    /// @notice Generic resolve path for ChainlinkDataFeed / ChainlinkFunctions / UMA wagers.
    ///         Reads the cached outcome from the wager's configured adapter and sets the winner.
    function autoResolveFromOracle(uint256 wagerId) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (!_isExtensibleOracleType(w.resolutionType)) revert NotAuthorized();

        IOracleAdapter adapter = oracleAdapters[w.resolutionType];
        if (address(adapter) == address(0)) revert OracleAdapterNotSet();

        (bool outcome, , uint256 resolvedAt) = adapter.getOutcome(w.polymarketConditionId);
        if (resolvedAt == 0) revert ConditionNotResolved();
        _settleOracleWin(wagerId, w, outcome);
    }

    /// @notice Expire Open wagers whose accept deadline has passed, refund the
    ///         creator's stake, and release the concurrent-limit slot on
    ///         MembershipManager. Any address may call this (the refund always
    ///         goes to the original creator). Silently skips wager IDs that are
    ///         not eligible (wrong status, deadline not yet reached, etc.).
    function batchExpireOpen(uint256[] calldata wagerIds) external nonReentrant whenNotPaused {
        _batchExpireOpen(wagerIds);
    }

    // ---------- Fee-netting views (state lives in Core; getters here for main-facet headroom) ----------

    function feeNettingEnabled() external view returns (bool) { return _feeNettingEnabled; }
    function gasFeeRecipient() external view returns (address) { return _gasFeeRecipient; }
    function maxGasFee() external view returns (uint256) { return _maxGasFee; }

    // ---------- Fee-netting admin ----------

    /// @notice Configure atomic fee netting for the `…WithAuthorization` twins (FR-015/FR-016).
    ///         `recipient` is the segregated stablecoin fee sink — never the relayer hot key
    ///         (spec 036 SC-015). Signed by the floppy-keystore admin like every other admin call.
    function setFeeNetting(bool enabled, address recipient, uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled && recipient == address(0)) revert ZeroAddress();
        _feeNettingEnabled = enabled;
        _gasFeeRecipient = recipient;
        _maxGasFee = cap;
        emit FeeNettingUpdated(enabled, recipient, cap);
    }

    // ---------- Hash helpers ----------

    /// @dev EIP-712 struct hash for {createWagerWithAuthorization}. `metadataUri` is hashed per
    ///      EIP-712 dynamic-type rules.
    function _hashCreateIntent(
        CreateArgs calldata a,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore
    ) internal pure returns (bytes32) {
        // Two abi.encode chunks concatenated — every field is a static 32-byte word, so this equals
        // the single flat abi.encode the EIP-712 spec requires (avoids stack-too-deep on 19 words).
        return keccak256(
            bytes.concat(
                abi.encode(
                    CREATE_WAGER_INTENT_TYPEHASH,
                    signer,
                    a.opponent,
                    a.arbitrator,
                    a.token,
                    a.creatorStake,
                    a.opponentStake,
                    a.acceptDeadline,
                    a.resolveDeadline
                ),
                abi.encode(
                    uint8(a.resolutionType),
                    a.conditionId,
                    a.creatorIsYes,
                    a.metadataHash,
                    keccak256(bytes(a.metadataUri)),
                    a.termsVersionHash,
                    a.paymentNonce,
                    nonce,
                    validAfter,
                    validBefore
                )
            )
        );
    }
}
