// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SignerIntentBase} from "../upgradeable/SignerIntentBase.sol";

/// @title MockSignerIntent
/// @notice TEST-ONLY minimal concrete {SignerIntentBase} harness for direct unit tests of the reusable
///         EIP-712 signed-intent verifier. It is a PLAIN mock (not upgradeable-managed): deploy it and
///         call {initialize} once, then exercise {doThing} to consume a signed intent. NEVER deploy in a
///         production path (constitution III).
/// @dev    Not registered in `scripts/deploy/check-storage-layout.js` — it is not a UUPS-managed
///         production contract, so it is intentionally out of the storage-layout gate.
contract MockSignerIntent is SignerIntentBase {
    /// @dev Fixed typehash for the single test action. Field order MUST match the EIP-712 struct the
    ///      tests sign: DoThing(uint256 x,address signer,bytes32 nonce,uint256 validAfter,uint256 validBefore).
    bytes32 private constant DOTHING_TYPEHASH =
        keccak256("DoThing(uint256 x,address signer,bytes32 nonce,uint256 validAfter,uint256 validBefore)");

    /// @notice Last `x` recorded by a successful {doThing} (proves the effect ran after verification).
    uint256 public lastValue;
    /// @notice Count of successful {doThing} calls.
    uint256 public callCount;

    /// @notice One-time init; sets the EIP-712 domain the tests sign against.
    function initialize() external initializer {
        __SignerIntent_init("Mock", "1");
    }

    /// @notice A single nonce-consuming action: builds the intent struct hash, verifies + burns the
    ///         nonce, then records `x`. Reverts (before any effect) with the base's intent errors
    ///         (IntentNotYetValid / IntentExpired / IntentReplayed / BadIntentSigner) on a bad intent.
    function doThing(
        uint256 x,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata sig
    ) external {
        bytes32 structHash = keccak256(abi.encode(DOTHING_TYPEHASH, x, signer, nonce, validAfter, validBefore));
        _verifyIntent(structHash, signer, nonce, validAfter, validBefore, sig);
        lastValue = x;
        callCount += 1;
    }

    /// @notice Expose the EIP-712 domain separator so tests can assert per-contract binding.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
