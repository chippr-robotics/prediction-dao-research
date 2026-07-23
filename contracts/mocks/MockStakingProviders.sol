// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Mock Lido/sPOL staking providers (spec 066 tests only)
 * @notice Minimal stand-ins for the real Lido stETH/wstETH + sPOL controller so the
 *         StakingRouter's LIQUID fee-and-forward path can be unit-tested without a fork.
 *         NOT for production (contracts/mocks scope — constitution III).
 */

/// @dev stETH: `submit` mints stETH 1:1 for the ETH sent.
contract MockLidoStETH is ERC20 {
    constructor() ERC20("Liquid staked Ether", "stETH") {}

    function submit(address) external payable returns (uint256) {
        _mint(msg.sender, msg.value);
        return msg.value;
    }
}

/// @dev wstETH: `wrap` pulls stETH from the caller and mints wstETH 1:1.
contract MockWstETH is ERC20 {
    ERC20 public immutable steth;

    constructor(address steth_) ERC20("Wrapped liquid staked Ether", "wstETH") {
        steth = ERC20(steth_);
    }

    function wrap(uint256 stETHAmount) external returns (uint256) {
        steth.transferFrom(msg.sender, address(this), stETHAmount);
        _mint(msg.sender, stETHAmount);
        return stETHAmount;
    }
}

/// @dev sPOL controller: `buySPOL` pulls POL from the caller and mints sPOL 1:1.
contract MockSpolController {
    ERC20 public immutable pol;
    MintableToken public immutable spol;

    constructor(address pol_, address spol_) {
        pol = ERC20(pol_);
        spol = MintableToken(spol_);
    }

    function buySPOL(uint256 amount) external returns (uint256) {
        pol.transferFrom(msg.sender, address(this), amount);
        spol.mint(msg.sender, amount);
        return amount;
    }
}

/// @dev Minimal mintable ERC20 (POL / sPOL in tests).
contract MintableToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
