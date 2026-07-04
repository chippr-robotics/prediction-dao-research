// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title SignerIntentBase
/// @notice Reusable EIP-712 "signed intent" verifier: recovers a `signer` from a typed-data signature,
///         enforces a validity window, and burns a single-use replay nonce. It is the on-chain half of
///         the intent-based / relayer architecture (spec 035): every state-changing action can be
///         authorized by an EOA signature that a *different* submitter (a relayer) sends on-chain, so the
///         action is attributed to the recovered `signer` rather than `msg.sender`. Self-submit
///         entrypoints remain the primary path (FR-014); the `…WithSig` twins are additive.
/// @dev    Storage is ERC-7201 namespaced (no `__gap` cost) so this base is safe to add to a live UUPS
///         proxy (like {EIP712Upgradeable}) as well as to fresh clones. Domain isolation:
///         `chainId + verifyingContract` scope every signature to one network and one contract, so a
///         nonce burned on one contract cannot be replayed on another. The nonce is a client-generated
///         256-bit value (EIP-3009 style), enabling out-of-order use and cheap targeted cancel.
abstract contract SignerIntentBase is Initializable, EIP712Upgradeable {
    // keccak256(abi.encode(uint256(keccak256("fairwins.storage.SignerIntent")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant SIGNER_INTENT_STORAGE =
        0xbda5d3fd416f3ed9f8bc0b09bde30dab6770c361524a40dc526db4ed57b8e000;

    /// @custom:storage-location erc7201:fairwins.storage.SignerIntent
    struct SignerIntentStorage {
        mapping(address signer => mapping(bytes32 nonce => bool used)) usedNonces;
    }

    function _signerIntentStorage() private pure returns (SignerIntentStorage storage $) {
        assembly {
            $.slot := SIGNER_INTENT_STORAGE
        }
    }

    error IntentNotYetValid();
    error IntentExpired();
    error IntentReplayed();
    error BadIntentSigner();

    event NonceInvalidated(address indexed signer, bytes32 indexed nonce);

    // solhint-disable-next-line func-name-mixedcase
    function __SignerIntent_init(string memory name, string memory version) internal onlyInitializing {
        __EIP712_init(name, version);
    }

    /// @notice Whether `nonce` has been used (or invalidated) for `signer`.
    function authorizationState(address signer, bytes32 nonce) external view returns (bool) {
        return _signerIntentStorage().usedNonces[signer][nonce];
    }

    /// @notice Pre-emptively burn one of your own nonces (cancel a signed-but-unsubmitted intent, FR-006).
    function invalidateNonce(bytes32 nonce) external {
        _signerIntentStorage().usedNonces[msg.sender][nonce] = true;
        emit NonceInvalidated(msg.sender, nonce);
    }

    /// @dev Verify a signed intent and burn its nonce. `structHash` MUST be
    ///      `keccak256(abi.encode(TYPEHASH, ...action fields..., signer, nonce, validAfter, validBefore))`
    ///      — the signature therefore binds `signer`, `nonce`, and the window, so the values passed here
    ///      cannot be tampered independently of the signature. Effects (nonce burn) happen before the
    ///      caller's external interactions (checks-effects-interactions).
    function _verifyIntent(
        bytes32 structHash,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata sig
    ) internal {
        if (block.timestamp < validAfter) revert IntentNotYetValid();
        if (block.timestamp > validBefore) revert IntentExpired();
        SignerIntentStorage storage $ = _signerIntentStorage();
        if ($.usedNonces[signer][nonce]) revert IntentReplayed();
        address recovered = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (recovered == address(0) || recovered != signer) revert BadIntentSigner();
        $.usedNonces[signer][nonce] = true;
    }
}
