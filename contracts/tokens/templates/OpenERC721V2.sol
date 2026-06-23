// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ERC721BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import {ERC721PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ISanctionsGuard} from "../../interfaces/ISanctionsGuard.sol";
import {ITokenAdminV2} from "../interfaces/ITokenAdminV2.sol";

/// @title OpenERC721V2 — role-based open ERC-721 collection clone template (spec 028 expansion, US6/US7/US9/US11)
/// @notice Role-based (DEFAULT_ADMIN owner + MINTER/PAUSER/BURNER) ERC-721 with per-token URIs, pause, an
///         enumerable freeze list, bounded batch mint, holder/burner burn, and a non-bypassable `SanctionsGuard`
///         screen. Immutable clone; implementation initialization-locked.
/// @dev    Spec: specs/028-token-mint/contracts/roles-controls-caps.md.
contract OpenERC721V2 is
    Initializable,
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    ERC721BurnableUpgradeable,
    ERC721PausableUpgradeable,
    AccessControlEnumerableUpgradeable,
    ITokenAdminV2
{
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint8 internal constant SENDER_FROZEN = 3;
    uint8 internal constant SANCTIONED = 4;
    uint8 internal constant RECIPIENT_FROZEN = 5;

    uint256 public constant MAX_BATCH = 200;

    string public baseTokenURI;
    ISanctionsGuard public sanctionsGuard;
    uint256 private _nextTokenId;
    EnumerableSet.AddressSet private _frozenSet;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        address owner_,
        address sanctionsGuard_
    ) external initializer {
        __ERC721_init(name_, symbol_);
        __ERC721URIStorage_init();
        __ERC721Burnable_init();
        __ERC721Pausable_init();
        __AccessControlEnumerable_init();

        baseTokenURI = baseURI_;
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_);
        _grantRole(DEFAULT_ADMIN_ROLE, owner_);
        _grantRole(MINTER_ROLE, owner_);
        _grantRole(PAUSER_ROLE, owner_);
        _grantRole(BURNER_ROLE, owner_);
    }

    // --- Mint / pause / freeze ---

    function mint(address to, string memory uri) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        // CEI: write the URI before the _safeMint receiver callback.
        _setTokenURI(tokenId, uri);
        _safeMint(to, tokenId);
    }

    function batchMint(address[] calldata recipients, string[] calldata uris) external onlyRole(MINTER_ROLE) {
        if (recipients.length != uris.length) revert LengthMismatch();
        if (recipients.length > MAX_BATCH) revert BatchTooLarge(recipients.length, MAX_BATCH);
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 tokenId = _nextTokenId++;
            // CEI: write the URI before the _safeMint receiver callback.
            _setTokenURI(tokenId, uris[i]);
            _safeMint(recipients[i], tokenId);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setFrozen(address account, bool isFrozen) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (isFrozen) {
            _frozenSet.add(account);
        } else {
            _frozenSet.remove(account);
        }
        emit Frozen(account, isFrozen);
    }

    function frozen(address account) public view returns (bool) {
        return _frozenSet.contains(account);
    }

    function frozenCount() external view returns (uint256) {
        return _frozenSet.length();
    }

    function frozenAt(uint256 index) external view returns (address) {
        return _frozenSet.at(index);
    }

    // --- Ownership (DEFAULT_ADMIN_ROLE) ---

    function transferOwnership(address newOwner) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newOwner == address(0)) revert ZeroAddress();
        if (newOwner == _msgSender()) revert SelfTransfer(); // guard against self-transfer admin lockout
        _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        _revokeRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /// @notice Permanently relinquish ownership (irreversible, FR-038); frontend gates it behind a confirmation.
    function renounceOwnership() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    // --- Transfer policy + required multiple-inheritance overrides ---

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721Upgradeable, ERC721PausableUpgradeable) returns (address) {
        ISanctionsGuard guard = sanctionsGuard;
        address from = _ownerOf(tokenId);
        if (address(guard) != address(0)) {
            if (from != address(0) && !guard.isAllowed(from)) revert TransferRestricted(SANCTIONED);
            if (to != address(0) && !guard.isAllowed(to)) revert TransferRestricted(SANCTIONED);
        }
        if (from != address(0) && frozen(from)) revert TransferRestricted(SENDER_FROZEN);
        if (to != address(0) && frozen(to)) revert TransferRestricted(RECIPIENT_FROZEN);
        return super._update(to, tokenId, auth);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable, AccessControlEnumerableUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
