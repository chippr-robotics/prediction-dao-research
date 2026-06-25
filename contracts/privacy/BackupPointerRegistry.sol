// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BackupPointerRegistry
/// @notice Per-wallet pointer to an off-chain encrypted backup (e.g. an IPFS CID) — the trustless locator
///         for spec 032 (encrypted data backup & restore). Value-free: holds no funds and no authority.
/// @dev Each wallet writes ONLY its own slot (keyed on `msg.sender`); re-writing overwrites the previous
///      pointer, and writing an empty string clears it (removal). Reads are free and public: the pointer is
///      intentionally public (the backup CONTENT is encrypted off-chain), and no personal data is on-chain.
///      No external calls, no roles, no arithmetic — CEI is trivial and reentrancy is impossible. Uses no
///      OpenZeppelin, so it compiles on pre-Cancun targets (e.g. ETC/Mordor) as well. Cloned in shape from
///      `KeyRegistry`.
contract BackupPointerRegistry {
    /// @dev CIDv1 base32 is ~60 chars; the bound is generous and caps per-write storage/event size.
    uint256 private constant MAX_CID_LENGTH = 256;

    mapping(address => string) private _pointer;

    event BackupPointerSet(address indexed owner, string cid, uint64 timestamp);

    error CidTooLong();

    /// @notice Set, overwrite, or clear (with "") the caller's backup pointer. Owner-only by construction.
    /// @param cid The off-chain backup reference (e.g. an IPFS CID), or "" to remove.
    function setPointer(string calldata cid) external {
        if (bytes(cid).length > MAX_CID_LENGTH) revert CidTooLong();
        _pointer[msg.sender] = cid; // effect
        emit BackupPointerSet(msg.sender, cid, uint64(block.timestamp)); // log
    }

    /// @notice Read any wallet's latest backup pointer ("" if never set or cleared). Free.
    function getPointer(address owner) external view returns (string memory) {
        return _pointer[owner];
    }

    /// @notice Whether a wallet currently has a non-empty backup pointer. Free.
    function hasPointer(address owner) external view returns (bool) {
        return bytes(_pointer[owner]).length != 0;
    }
}
