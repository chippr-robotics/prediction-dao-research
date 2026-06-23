// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {ISanctionsGuard} from "../interfaces/ISanctionsGuard.sol";
import {ITokenFactory} from "./interfaces/ITokenFactory.sol";
import {OpenERC20} from "./templates/OpenERC20.sol";
import {OpenERC721} from "./templates/OpenERC721.sol";
import {RestrictedERC20} from "./templates/RestrictedERC20.sol";

/// @title TokenFactory — platform token-issuance authority & registry (spec 028)
/// @notice The single upgradeable, state-bearing platform contract for token issuance. It gates creation behind
///         {TOKEN_ISSUER_ROLE}, screens the issuer through the platform {ISanctionsGuard} (fail-closed), deploys
///         per-issuer tokens as minimal-proxy clones of immutable implementation templates, and records every
///         token in a network-scoped registry (FR-001..007, FR-018..026).
/// @dev    Inherits {UUPSManaged} (UUPS + AccessControl + non-brickable upgrade gate + impl-init lockout) and
///         {ReentrancyGuardUpgradeable}. Storage is append-only with a trailing `__gap`; registered in
///         `npm run check:storage-layout`. Issued tokens are IMMUTABLE clones — only this factory is upgradeable.
///         EthTrust-SL >= L2: CEI on issuance (registry written only after a successful clone+init), reentrancy-
///         guarded create paths, fail-closed sanctions screening, least-privilege roles.
///         The permissioned ERC-3643 / T-REX class (User Story 4) is DEFERRED — see the ITokenFactory notes.
contract TokenFactory is ITokenFactory, UUPSManaged, ReentrancyGuardUpgradeable {
    /// @notice Required to call any `create*` entrypoint. Granted by the platform admin (R4), like other roles.
    bytes32 public constant TOKEN_ISSUER_ROLE = keccak256("TOKEN_ISSUER_ROLE");

    // ---- Append-only storage (never insert/reorder/remove above __gap) ----

    /// @notice Sanctions screen for issuers + injected into issued tokens. address(0) disables (mirrors
    ///         MembershipManager).
    ISanctionsGuard public sanctionsGuard;

    /// @notice Immutable clone implementation templates (set at init; replaceable by admin via {setTemplate}).
    address public openERC20Impl;
    address public openERC721Impl;
    address public restrictedERC20Impl;

    /// @notice Monotonic id allocator. Ids start at 1 so `tokenAddressToId == 0` means "unknown".
    uint256 public tokenCount;

    mapping(uint256 => TokenRecord) private _tokens;
    mapping(address => uint256[]) private _issuerTokens;

    /// @notice Reverse lookup: deployed token address -> registry id (0 == unknown).
    mapping(address => uint256) public tokenAddressToId;

    /// @dev Trailing reserve for append-only upgrades. The deferred ERC-3643 class will append its gateway +
    ///      compliance-module addresses here (consuming gap slots) — never insert/reorder existing state above.
    uint256[50] private __gap;

    /// @notice One-time initializer (UUPS proxy). Grants DEFAULT_ADMIN_ROLE + UPGRADER_ROLE to `admin` (via the
    ///         base) and TOKEN_ISSUER_ROLE is granted out-of-band by the admin afterwards.
    function initialize(
        address admin,
        address sanctionsGuard_,
        address openERC20Impl_,
        address openERC721Impl_,
        address restrictedERC20Impl_
    ) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        __ReentrancyGuard_init();
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_);
        openERC20Impl = openERC20Impl_;
        openERC721Impl = openERC721Impl_;
        restrictedERC20Impl = restrictedERC20Impl_;
    }

    // ---- Admin / config (onlyRole(DEFAULT_ADMIN_ROLE)) ----

    /// @notice Set the sanctions guard. address(0) disables screening (deliberate per-network config).
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sanctionsGuard = ISanctionsGuard(guard);
        emit SanctionsGuardUpdated(guard);
    }

    /// @notice Replace a clone implementation template for one of the open/restricted standards.
    function setTemplate(TokenStandard standard, address impl) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (impl == address(0)) revert ZeroAddress();
        if (standard == TokenStandard.OPEN_ERC20) {
            openERC20Impl = impl;
        } else if (standard == TokenStandard.OPEN_ERC721) {
            openERC721Impl = impl;
        } else if (standard == TokenStandard.RESTRICTED_ERC1404) {
            restrictedERC20Impl = impl;
        } else {
            revert TemplateNotSet(standard); // PERMISSIONED_ERC3643 has no clone template (deferred)
        }
        emit TemplateUpdated(standard, impl);
    }

    // ---- Issuance (onlyRole(TOKEN_ISSUER_ROLE), issuer sanctions-screened) ----

    /// @inheritdoc ITokenFactory
    function createOpenERC20(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 initialSupply,
        string calldata metadataURI,
        bool burnable,
        bool pausable
    ) external override onlyRole(TOKEN_ISSUER_ROLE) nonReentrant returns (uint256 id, address token) {
        _beforeCreate(name, symbol, openERC20Impl, TokenStandard.OPEN_ERC20);
        token = Clones.clone(openERC20Impl);
        OpenERC20(token).initialize(
            name,
            symbol,
            decimals,
            initialSupply,
            msg.sender,
            address(sanctionsGuard),
            burnable,
            pausable
        );
        id = _recordToken(TokenStandard.OPEN_ERC20, token, name, symbol, metadataURI, burnable, pausable);
    }

    /// @inheritdoc ITokenFactory
    function createOpenERC721(
        string calldata name,
        string calldata symbol,
        string calldata baseURI,
        bool burnable
    ) external override onlyRole(TOKEN_ISSUER_ROLE) nonReentrant returns (uint256 id, address token) {
        _beforeCreate(name, symbol, openERC721Impl, TokenStandard.OPEN_ERC721);
        token = Clones.clone(openERC721Impl);
        OpenERC721(token).initialize(name, symbol, baseURI, msg.sender, address(sanctionsGuard), burnable);
        id = _recordToken(TokenStandard.OPEN_ERC721, token, name, symbol, baseURI, burnable, false);
    }

    /// @inheritdoc ITokenFactory
    function createRestrictedERC20(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 initialSupply,
        string calldata metadataURI,
        address[] calldata initialEligible
    ) external override onlyRole(TOKEN_ISSUER_ROLE) nonReentrant returns (uint256 id, address token) {
        _beforeCreate(name, symbol, restrictedERC20Impl, TokenStandard.RESTRICTED_ERC1404);
        token = Clones.clone(restrictedERC20Impl);
        RestrictedERC20(token).initialize(
            name,
            symbol,
            decimals,
            initialSupply,
            msg.sender,
            address(sanctionsGuard),
            initialEligible
        );
        id = _recordToken(TokenStandard.RESTRICTED_ERC1404, token, name, symbol, metadataURI, false, false);
    }

    // ---- Views ----

    /// @inheritdoc ITokenFactory
    function getToken(uint256 id) external view override returns (TokenRecord memory) {
        return _tokens[id];
    }

    /// @inheritdoc ITokenFactory
    function getTokensByIssuer(address issuer) external view override returns (uint256[] memory) {
        return _issuerTokens[issuer];
    }

    /// @inheritdoc ITokenFactory
    function getTokenIdByAddress(address token) external view override returns (uint256) {
        return tokenAddressToId[token];
    }

    // ---- Internals ----

    /// @dev Shared Checks for every create path: non-empty metadata, template configured, issuer not sanctioned.
    function _beforeCreate(
        string calldata name,
        string calldata symbol,
        address impl,
        TokenStandard standard
    ) internal view {
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert EmptyMetadata();
        if (impl == address(0)) revert TemplateNotSet(standard);
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0) && !guard.isAllowed(msg.sender)) revert SanctionedAddress(msg.sender);
    }

    /// @dev Effects: append the registry row AFTER a successful clone+init (CEI — no write on revert).
    function _recordToken(
        TokenStandard standard,
        address token,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        bool isBurnable,
        bool isPausable
    ) internal returns (uint256 id) {
        id = ++tokenCount;
        _tokens[id] = TokenRecord({
            id: id,
            standard: standard,
            tokenAddress: token,
            issuer: msg.sender,
            name: name,
            symbol: symbol,
            metadataURI: metadataURI,
            isBurnable: isBurnable,
            isPausable: isPausable,
            suite: TrexSuiteRef(address(0), address(0), address(0), address(0)),
            createdAt: uint64(block.timestamp)
        });
        _issuerTokens[msg.sender].push(id);
        tokenAddressToId[token] = id;
        emit TokenCreated(id, standard, token, msg.sender, name, symbol);
    }
}
