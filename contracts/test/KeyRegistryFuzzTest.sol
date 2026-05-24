// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../privacy/KeyRegistry.sol";

/// @title KeyRegistryFuzzTest
/// @notice Medusa fuzz test contract for KeyRegistry invariants.
contract KeyRegistryFuzzTest {
    KeyRegistry public keyRegistry;

    // Mirror the constants from KeyRegistry (they are private)
    uint256 public constant MIN_KEY_LENGTH = 32;
    uint256 public constant MAX_KEY_LENGTH = 2048;

    address public constant USER_A = address(0x10000);
    address public constant USER_B = address(0x20000);

    address public immutable deployer;

    constructor() {
        deployer = address(this);
        keyRegistry = new KeyRegistry();
    }

    // ================================================================
    //  PROPERTY 1: Registered key length is within bounds
    //  Any key stored in the registry must satisfy
    //  MIN_KEY_LENGTH <= length <= MAX_KEY_LENGTH.
    //  Keys that are empty (unregistered) are allowed (length == 0).
    // ================================================================

    function property_registered_key_length_bounded() public view returns (bool) {
        address[3] memory users = [deployer, USER_A, USER_B];
        for (uint8 i = 0; i < 3; i++) {
            bytes memory key = keyRegistry.getPublicKey(users[i]);
            uint256 len = key.length;
            if (len == 0) continue; // unregistered, acceptable
            if (len < MIN_KEY_LENGTH || len > MAX_KEY_LENGTH) return false;
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 2: A registered key can be overwritten
    //  After registering a key, registering a different key for the
    //  same address must succeed and the new key must be stored.
    // ================================================================

    function property_key_can_be_overwritten() public returns (bool) {
        // Register a 32-byte key
        bytes memory key1 = new bytes(32);
        key1[0] = 0x01;
        keyRegistry.registerKey(key1);

        bytes memory stored1 = keyRegistry.getPublicKey(deployer);
        if (keccak256(stored1) != keccak256(key1)) return false;

        // Overwrite with a different 32-byte key
        bytes memory key2 = new bytes(32);
        key2[0] = 0x02;
        keyRegistry.registerKey(key2);

        bytes memory stored2 = keyRegistry.getPublicKey(deployer);
        if (keccak256(stored2) != keccak256(key2)) return false;

        return true;
    }

    // ================================================================
    //  PROPERTY 3: getPublicKey returns empty bytes for unregistered
    //  addresses.
    // ================================================================

    function property_unregistered_returns_empty() public view returns (bool) {
        // address(0xDEAD) should never have registered a key in this harness
        bytes memory key = keyRegistry.getPublicKey(address(0xDEAD));
        return key.length == 0;
    }

    // ================================================================
    //  PROPERTY 4: hasKey returns false for unregistered addresses
    // ================================================================

    function property_hasKey_false_for_unregistered() public view returns (bool) {
        return !keyRegistry.hasKey(address(0xDEAD));
    }

    // ================================================================
    //  PROPERTY 5: hasKey and getPublicKey are consistent
    //  If hasKey returns true, getPublicKey must return non-empty bytes
    //  and vice versa.
    // ================================================================

    function property_hasKey_consistent_with_getPublicKey() public view returns (bool) {
        address[3] memory users = [deployer, USER_A, USER_B];
        for (uint8 i = 0; i < 3; i++) {
            bool has = keyRegistry.hasKey(users[i]);
            bytes memory key = keyRegistry.getPublicKey(users[i]);
            if (has && key.length == 0) return false;
            if (!has && key.length != 0) return false;
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 6: registerKey with too-short key reverts
    // ================================================================

    function property_short_key_reverts() public returns (bool) {
        bytes memory shortKey = new bytes(31); // one byte below minimum
        try keyRegistry.registerKey(shortKey) {
            return false; // Should have reverted with KeyTooShort
        } catch {
            return true;
        }
    }

    // ================================================================
    //  PROPERTY 7: registerKey with too-long key reverts
    // ================================================================

    function property_long_key_reverts() public returns (bool) {
        bytes memory longKey = new bytes(2049); // one byte above maximum
        try keyRegistry.registerKey(longKey) {
            return false; // Should have reverted with KeyTooLong
        } catch {
            return true;
        }
    }
}
