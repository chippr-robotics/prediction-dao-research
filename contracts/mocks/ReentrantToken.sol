// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ReentrantToken
/// @notice TEST-ONLY malicious ERC-20 whose transfer / transferFrom re-enter an armed target contract,
///         used to prove {WagerPool}'s `nonReentrant` guards hold on the value-moving paths
///         (join / claim / refund). If the re-entrant call reverts (as the guard forces), the revert is
///         bubbled up so the outer transfer — and therefore the pool action — reverts with the guard's
///         custom error. NEVER deploy in a production path (constitution III).
contract ReentrantToken is ERC20 {
    address public reenterTarget;
    bytes public reenterData;
    bool private _armed;

    constructor() ERC20("Reentrant USD", "rUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arm a single re-entrant call to `target` with `data`, fired on the next transfer /
    ///         transferFrom. One-shot (disarms itself) so it cannot loop forever.
    function arm(address target, bytes calldata data) external {
        reenterTarget = target;
        reenterData = data;
        _armed = true;
    }

    function _maybeReenter() internal {
        if (_armed) {
            _armed = false; // one-shot: disarm before the call
            (bool ok, bytes memory ret) = reenterTarget.call(reenterData);
            if (!ok) {
                // Bubble up the inner revert (e.g. ReentrancyGuardReentrantCall) unchanged.
                assembly {
                    revert(add(ret, 0x20), mload(ret))
                }
            }
        }
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool r = super.transfer(to, amount);
        _maybeReenter();
        return r;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool r = super.transferFrom(from, to, amount);
        _maybeReenter();
        return r;
    }
}
