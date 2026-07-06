// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Test-only ERC-1271 signer with configurable misbehavior, used to prove
///      SignerIntentBase's contract-signer fallback rejects every malformed
///      responder (spec 041 T012). NOT a real account: mocks/ is test-only.
contract MockERC1271 {
    enum Mode {
        AcceptAll, // returns the ERC-1271 magic value for any input
        RejectAll, // returns a wrong magic value
        Revert, // reverts on every call
        ShortReturn // returns fewer than 32 bytes
    }

    Mode public mode;

    function setMode(Mode m) external {
        mode = m;
    }

    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        if (mode == Mode.AcceptAll) return 0x1626ba7e;
        if (mode == Mode.RejectAll) return 0xdeadbeef;
        if (mode == Mode.Revert) revert("MockERC1271: revert");
        assembly {
            return(0, 4) // ShortReturn: 4 zero bytes instead of a 32-byte word
        }
    }
}
