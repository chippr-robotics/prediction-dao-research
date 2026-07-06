// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC3009, ERC3009Auth} from "../interfaces/IERC3009.sol";

/// @title SignerIntentBase
/// @notice Shared EIP-712 intent layer for signer-attributed (gasless) entrypoints (spec 035).
///         Generalizes the one-off open-challenge verifier into a reusable mixin: a per-signer
///         2-D replay-nonce map (EIP-3009 style — random client nonces, out-of-order use, cheap
///         targeted cancel), `_verifyIntent` for the `…WithSig`/`…WithAuthorization` twins, and
///         nonce invalidation (FR-006). Inherited by the live UUPS proxies (WagerRegistry,
///         MembershipManager) and any future intent-capable contract.
/// @dev    Storage is ERC-7201 namespaced, so — like {EIP712Upgradeable} — adding this base to an
///         already-deployed proxy shifts NO sequential slots and costs no `__gap`. The per-contract
///         EIP-712 domain (name/version set by the inheritor's `__EIP712_init`) plus chainId +
///         verifyingContract give network and contract isolation (FR-005/FR-021): a nonce used on
///         one contract can never be replayed on another.
abstract contract SignerIntentBase is Initializable, EIP712Upgradeable {
    using SafeERC20 for IERC20;

    bytes32 private constant INVALIDATE_NONCE_TYPEHASH =
        keccak256("InvalidateNonce(address signer,bytes32 nonce,uint256 validBefore)");

    /// @custom:storage-location erc7201:fairwins.storage.SignerIntentBase
    struct SignerIntentStorage {
        /// @dev signer => nonce => used/cancelled. Single-use; never cleared.
        mapping(address => mapping(bytes32 => bool)) used;
    }

    // keccak256(abi.encode(uint256(keccak256("fairwins.storage.SignerIntentBase")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant _SIGNER_INTENT_STORAGE_SLOT =
        0x4640730a3d190cb8be6100c3dca080ee8efbe182cb87254584c9faca7e6b2400;

    function _getSignerIntentStorage() private pure returns (SignerIntentStorage storage $) {
        assembly {
            $.slot := _SIGNER_INTENT_STORAGE_SLOT
        }
    }

    /// @notice A signer's intent nonce was consumed by a relayed execution.
    event IntentNonceUsed(address indexed signer, bytes32 indexed nonce);
    /// @notice A signer proactively invalidated an unused nonce (FR-006) — the intent can never execute.
    event NonceInvalidated(address indexed signer, bytes32 indexed nonce);

    error IntentNotYetValid();
    error IntentExpired();
    error IntentReplayed(address signer, bytes32 nonce);
    error InvalidIntentSignature();
    error IntentSignerZero();
    error PaymentAuthMismatch();
    error FeeExceedsCap();
    error FeeRecipientUnset();

    // ---------- Views ----------

    /// @notice True if `nonce` has been used or cancelled for `signer` (EIP-3009-style semantics).
    function authorizationState(address signer, bytes32 nonce) external view returns (bool) {
        return _getSignerIntentStorage().used[signer][nonce];
    }

    /// @notice This contract's EIP-712 domain separator (client convenience / pre-sign check).
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------- Invalidation (FR-006) ----------

    /// @notice Invalidate an unused nonce for the caller so the corresponding signed-but-unsubmitted
    ///         intent can never execute. Reverts {IntentReplayed} if already used/cancelled.
    function invalidateNonce(bytes32 nonce) external {
        _useNonce(msg.sender, nonce);
        emit NonceInvalidated(msg.sender, nonce);
    }

    /// @notice Gasless variant of {invalidateNonce}: anyone may submit the signer's own signed
    ///         cancellation (a zero-native-balance wallet cancels through the relayer too).
    function invalidateNonceWithSig(address signer, bytes32 nonce, uint256 validBefore, bytes calldata sig) external {
        if (signer == address(0)) revert IntentSignerZero();
        if (block.timestamp > validBefore) revert IntentExpired();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(INVALIDATE_NONCE_TYPEHASH, signer, nonce, validBefore)));
        if (!_isValidSignerSignature(signer, digest, sig)) revert InvalidIntentSignature();
        _useNonce(signer, nonce);
        emit NonceInvalidated(signer, nonce);
    }

    // ---------- Internal intent machinery ----------

    /// @dev Signer-signature check: ECDSA first, then ERC-1271 `isValidSignature` fallback for
    ///      signers with code — lets contract accounts (spec 041 passkey smart wallets) be intent
    ///      signers. Byte-for-byte the semantics of OpenZeppelin `SignatureChecker
    ///      .isValidSignatureNow` (pre-ERC-7913); inlined because OZ 5.4's SignatureChecker
    ///      imports `utils/Bytes.sol`, which requires the Cancun `mcopy` opcode and cannot
    ///      compile under this repo's pre-Cancun EVM targets (Mordor-compatible bytecode).
    function _isValidSignerSignature(address signer, bytes32 digest, bytes calldata sig)
        private
        view
        returns (bool)
    {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err == ECDSA.RecoverError.NoError && recovered == signer) return true;
        (bool success, bytes memory result) =
            signer.staticcall(abi.encodeCall(IERC1271.isValidSignature, (digest, sig)));
        return success && result.length >= 32
            && abi.decode(result, (bytes32)) == bytes32(IERC1271.isValidSignature.selector);
    }

    /// @dev Mark `nonce` used for `signer`; revert {IntentReplayed} if already used (single-use).
    function _useNonce(address signer, bytes32 nonce) internal {
        SignerIntentStorage storage $ = _getSignerIntentStorage();
        if ($.used[signer][nonce]) revert IntentReplayed(signer, nonce);
        $.used[signer][nonce] = true;
    }

    /// @dev Verify a signer-attributed intent: validity window, EIP-712 signature over `structHash`
    ///      recovering exactly `signer`, then consume the single-use nonce (checks → effects; the
    ///      nonce is burned before the caller performs any external interaction). Reverts on any
    ///      failure — a failed intent never consumes the nonce.
    function _verifyIntent(
        bytes32 structHash,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata sig
    ) internal {
        if (signer == address(0)) revert IntentSignerZero();
        if (block.timestamp < validAfter) revert IntentNotYetValid();
        if (block.timestamp > validBefore) revert IntentExpired();
        // The read-only ERC-1271 fallback is a staticcall into the signer's own
        // account and happens BEFORE the nonce burn — checks → effects preserved.
        if (!_isValidSignerSignature(signer, _hashTypedDataV4(structHash), sig)) {
            revert InvalidIntentSignature();
        }
        _useNonce(signer, nonce);
        emit IntentNonceUsed(signer, nonce);
    }

    /// @dev Pull the money leg for a `…WithAuthorization` twin. Asserts the relayer-supplied
    ///      authorization is the one the signer stapled to this exact action — `value` must equal the
    ///      on-chain expected amount and `nonce` must equal the intent's `paymentNonce` (FR-007/FR-013);
    ///      a relayer cannot substitute a different authorization. The token itself enforces
    ///      `to == address(this)` (receiveWithAuthorization requires the payee to be the caller).
    function _pullWithAuthorization(
        address token,
        address from,
        uint256 expectedValue,
        bytes32 expectedPaymentNonce,
        ERC3009Auth memory auth
    ) internal {
        if (auth.value != expectedValue || auth.nonce != expectedPaymentNonce) revert PaymentAuthMismatch();
        IERC3009(token).receiveWithAuthorization(
            from, address(this), auth.value, auth.validAfter, auth.validBefore, auth.nonce, auth.v, auth.r, auth.s
        );
    }

    /// @dev Fee-netting settlement (FR-015/FR-016): consume the signer's second, bounded fee
    ///      authorization and forward it to the segregated `recipient` — never the relayer hot key
    ///      (spec 036 SC-015). No-op when netting is disabled or no fee authorization was supplied
    ///      (sponsored mode sends `feeAuth.value == 0`). Atomic with the action: a revert here
    ///      unwinds the whole transaction, so the fee can never be taken without the action.
    function _settleGasFee(
        address token,
        address from,
        ERC3009Auth memory feeAuth,
        bool enabled,
        address recipient,
        uint256 cap
    ) internal {
        if (!enabled || feeAuth.value == 0) return;
        if (feeAuth.value > cap) revert FeeExceedsCap();
        if (recipient == address(0)) revert FeeRecipientUnset();
        IERC3009(token).receiveWithAuthorization(
            from, address(this), feeAuth.value, feeAuth.validAfter, feeAuth.validBefore, feeAuth.nonce, feeAuth.v, feeAuth.r, feeAuth.s
        );
        IERC20(token).safeTransfer(recipient, feeAuth.value);
    }
}
