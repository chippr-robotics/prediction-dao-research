// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../privacy/BackupPointerRegistry.sol";

/// @title BackupPointerRegistryFuzzTest
/// @notice Medusa fuzz test contract for BackupPointerRegistry invariants (spec 032).
contract BackupPointerRegistryFuzzTest {
    BackupPointerRegistry public registry;

    uint256 public constant MAX_CID_LENGTH = 256; // mirror the (private) constant

    address public constant USER_A = address(0x10000);
    address public constant USER_B = address(0x20000);

    address public immutable deployer;

    constructor() {
        deployer = address(this);
        registry = new BackupPointerRegistry();
    }

    // PROPERTY 1: any stored pointer length is within bounds (empty allowed = unset/cleared).
    function property_pointer_length_bounded() public view returns (bool) {
        address[3] memory users = [deployer, USER_A, USER_B];
        for (uint8 i = 0; i < 3; i++) {
            uint256 len = bytes(registry.getPointer(users[i])).length;
            if (len == 0) continue;
            if (len > MAX_CID_LENGTH) return false;
        }
        return true;
    }

    // PROPERTY 2: a pointer can be set then overwritten; the latest value is stored (only deployer's slot).
    function property_pointer_overwrite() public returns (bool) {
        registry.setPointer("cid-one");
        if (keccak256(bytes(registry.getPointer(deployer))) != keccak256(bytes("cid-one"))) return false;
        registry.setPointer("cid-two");
        if (keccak256(bytes(registry.getPointer(deployer))) != keccak256(bytes("cid-two"))) return false;
        return true;
    }

    // PROPERTY 3: writing empty string clears the pointer.
    function property_empty_clears() public returns (bool) {
        registry.setPointer("something");
        if (!registry.hasPointer(deployer)) return false;
        registry.setPointer("");
        return !registry.hasPointer(deployer);
    }

    // PROPERTY 4: an unset address reads empty / false.
    function property_unset_returns_empty() public view returns (bool) {
        return bytes(registry.getPointer(address(0xDEAD))).length == 0 && !registry.hasPointer(address(0xDEAD));
    }

    // PROPERTY 5: hasPointer is consistent with getPointer.
    function property_hasPointer_consistent() public view returns (bool) {
        address[3] memory users = [deployer, USER_A, USER_B];
        for (uint8 i = 0; i < 3; i++) {
            bool has = registry.hasPointer(users[i]);
            uint256 len = bytes(registry.getPointer(users[i])).length;
            if (has && len == 0) return false;
            if (!has && len != 0) return false;
        }
        return true;
    }

    // PROPERTY 6: a too-long CID reverts.
    function property_too_long_reverts() public returns (bool) {
        bytes memory big = new bytes(MAX_CID_LENGTH + 1);
        for (uint256 i = 0; i < big.length; i++) big[i] = 0x62; // 'b'
        try registry.setPointer(string(big)) {
            return false;
        } catch {
            return true;
        }
    }
}
