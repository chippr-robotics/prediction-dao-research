// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockPoolSanctions
/// @notice TEST-ONLY minimal sanctions guard matching the `checkBlocked` selector the
///         {ZKWagerPoolFactory} consults. NEVER deploy in a production path (constitution III).
contract MockPoolSanctions {
    mapping(address => bool) public denied;

    error SanctionedAddress(address account);

    function setDenied(address account, bool d) external {
        denied[account] = d;
    }

    function checkBlocked(address account) external view {
        if (denied[account]) revert SanctionedAddress(account);
    }

    function isAllowed(address account) external view returns (bool) {
        return !denied[account];
    }
}

/// @title MockPoolMembership
/// @notice TEST-ONLY minimal membership gate matching the `checkCanCreate` selector the
///         {ZKWagerPoolFactory} consults. NEVER deploy in a production path (constitution III).
contract MockPoolMembership {
    bool public allowed = true;

    function setAllowed(bool a) external {
        allowed = a;
    }

    function checkCanCreate(address, bytes32) external view returns (bool) {
        return allowed;
    }
}
