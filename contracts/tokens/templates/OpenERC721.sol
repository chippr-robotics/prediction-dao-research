// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ERC721BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ISanctionsGuard} from "../../interfaces/ISanctionsGuard.sol";

/// @title OpenERC721 — open non-fungible collection clone template (spec 028, User Stories 1 & 2)
/// @notice Minimal-proxy clone template for issuer-owned ERC-721 collections with per-token URIs, optional
///         holder burn, and a non-bypassable {ISanctionsGuard} screen on every transfer. Deployed once; cloned
///         per collection by the {TokenFactory}. Token ids auto-increment from 0.
/// @dev    Issued tokens are IMMUTABLE. The base implementation is initialization-locked by the constructor.
///         Spec: specs/028-token-mint/contracts/open-tokens.md.
contract OpenERC721 is
    Initializable,
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    ERC721BurnableUpgradeable,
    OwnableUpgradeable
{
    /// @notice Whether holders may burn (FR-003).
    bool public burnable;
    /// @notice Collection-level metadata reference (e.g. contract-level URI). Per-token URIs are set on mint.
    string public baseTokenURI;
    /// @notice Non-bypassable sanctions screen. address(0) disables (deliberate per-network config).
    ISanctionsGuard public sanctionsGuard;

    uint256 private _nextTokenId;

    error BurnableDisabled();
    error SanctionedAddress(address account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time clone initializer.
    function initialize(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        address owner_,
        address sanctionsGuard_,
        bool burnable_
    ) external initializer {
        __ERC721_init(name_, symbol_);
        __ERC721URIStorage_init();
        __ERC721Burnable_init();
        __Ownable_init(owner_);
        baseTokenURI = baseURI_;
        burnable = burnable_;
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_);
    }

    /// @notice Owner mints a new token with metadata `uri` to `to`. Recipient is sanctions-screened in {_update}.
    function mint(address to, string memory uri) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    function burn(uint256 tokenId) public override {
        if (!burnable) revert BurnableDisabled();
        super.burn(tokenId);
    }

    /// @dev Transfer hook: fail-closed sanctions screen on the resolved sender + recipient (FR-021).
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) {
            address from = _ownerOf(tokenId);
            if (from != address(0) && !guard.isAllowed(from)) revert SanctionedAddress(from);
            if (to != address(0) && !guard.isAllowed(to)) revert SanctionedAddress(to);
        }
        return super._update(to, tokenId, auth);
    }

    // --- Required multiple-inheritance overrides (ERC721 + URIStorage) ---

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
