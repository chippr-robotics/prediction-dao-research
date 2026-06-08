// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KeyRegistry
/// @notice On-chain registry mapping addresses to encryption public keys.
/// @dev Used by the off-chain envelope-encryption flow: wager creators look up an
///      opponent's registered key to encrypt private wager metadata without any
///      shared secret or prior interaction. Keys are arbitrary bytes (e.g. X25519
///      32-byte keys or X-Wing hybrid ~1.2kB keys). A user calling `registerKey`
///      a second time overwrites the previous key.
contract KeyRegistry {
    uint256 private constant MIN_KEY_LENGTH = 32;
    uint256 private constant MAX_KEY_LENGTH = 2048;

    mapping(address => bytes) private _keys;

    event KeyRegistered(address indexed user, bytes key, uint64 timestamp);
    /// @notice Spec 007 (FR-043): dates the deterministic eligibility signature via the
    ///         registration block timestamp, without putting a date in the signed payload.
    ///         `termsRef` is a caller-supplied reference (generic id or in-force version hash).
    event EligibilityAcknowledged(address indexed account, bytes32 termsRef, uint64 timestamp);

    error KeyTooShort();
    error KeyTooLong();

    function registerKey(bytes calldata publicKey) external {
        _registerKey(publicKey);
    }

    /// @notice Like {registerKey} but also emits {EligibilityAcknowledged}, providing the
    ///         dated on-chain record of the key-generation eligibility signature (Spec 007,
    ///         FR-043). The existing registerKey ABI is preserved.
    function registerKeyWithEligibility(bytes calldata publicKey, bytes32 termsRef) external {
        _registerKey(publicKey);
        emit EligibilityAcknowledged(msg.sender, termsRef, uint64(block.timestamp));
    }

    function _registerKey(bytes calldata publicKey) internal {
        if (publicKey.length < MIN_KEY_LENGTH) revert KeyTooShort();
        if (publicKey.length > MAX_KEY_LENGTH) revert KeyTooLong();
        _keys[msg.sender] = publicKey;
        emit KeyRegistered(msg.sender, publicKey, uint64(block.timestamp));
    }

    function getPublicKey(address user) external view returns (bytes memory) {
        return _keys[user];
    }

    function hasKey(address user) external view returns (bool) {
        return _keys[user].length != 0;
    }
}
