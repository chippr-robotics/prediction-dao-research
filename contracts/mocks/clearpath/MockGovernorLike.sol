// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";

/// @dev TEST-ONLY. A minimal stand-in for an OZ Governor used to exercise `ExternalDAORegistry._isGovernor`
///      WITHOUT importing the real OZ Governor implementation (which pulls in the Cancun `mcopy` opcode and is
///      not paris-compilable). Toggles ERC-165 support to exercise both validation paths (primary ERC-165 probe
///      and the defensive IGovernor-view fallback).
contract MockGovernorLike is IERC165 {
    bool public immutable supports165;

    constructor(bool supports165_) {
        supports165 = supports165_;
    }

    function supportsInterface(bytes4 interfaceId) external view returns (bool) {
        if (!supports165) return false;
        return interfaceId == type(IGovernor).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function COUNTING_MODE() external pure returns (string memory) {
        return "support=bravo&quorum=for,abstain";
    }

    function votingPeriod() external pure returns (uint256) {
        return 50400;
    }
}

/// @dev TEST-ONLY. A contract with code that is NOT a governor (no IERC165/IGovernor surface) — must be rejected.
contract MockNonGovernor {
    uint256 public value;

    function setValue(uint256 v) external {
        value = v;
    }
}
