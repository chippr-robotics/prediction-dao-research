// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {ISanctionsGuard} from "../interfaces/ISanctionsGuard.sol";
import {ITokenFactory} from "../tokens/interfaces/ITokenFactory.sol";

/// @title TokenFactoryBadLayoutMock
/// @notice Test-only INCOMPATIBLE upgrade of {TokenFactory}: inserts a state variable at the FRONT, shifting
///         every subsequent slot. The OpenZeppelin storage-layout validator MUST reject upgrading the real
///         factory to this layout (proving `check:storage-layout` / the upgrade gate blocks state corruption).
///         NOT for production.
contract TokenFactoryBadLayoutMock is UUPSManaged, ReentrancyGuardUpgradeable {
    // ⚠️ INSERTED before all real state — deliberately breaks the append-only layout.
    uint256 public insertedFirst;

    ISanctionsGuard public sanctionsGuard;
    address public openERC20Impl;
    address public openERC721Impl;
    address public restrictedERC20Impl;
    uint256 public tokenCount;
    mapping(uint256 => ITokenFactory.TokenRecord) private _tokens;
    mapping(address => uint256[]) private _issuerTokens;
    mapping(address => uint256) public tokenAddressToId;
    uint256[50] private __gap;

    function initialize(address admin) external initializer {
        __UUPSManaged_init(admin);
        __ReentrancyGuard_init();
    }
}
