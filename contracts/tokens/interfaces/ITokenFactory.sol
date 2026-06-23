// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITokenFactory
/// @notice External surface for the platform's token-issuance authority/registry (spec 028).
///         One upgradeable contract gates issuance behind {TOKEN_ISSUER_ROLE}, screens issuers through the
///         platform {ISanctionsGuard}, clones per-issuer token templates, and records every created token in a
///         network-scoped registry (the source of truth for discovery and the issuer's admin list).
/// @dev    Spec: specs/028-token-mint/contracts/token-factory.md (FR-001..007, FR-018..026).
///         NOTE: The permissioned ERC-3643 / T-REX class (User Story 4) is DEFERRED: the canonical T-REX suite
///         only supports OpenZeppelin 4.x + Solidity 0.8.17, which is incompatible with this repo's OZ pin. The
///         {TokenStandard.PERMISSIONED_ERC3643} value and {TokenRecord.suite} field are reserved so the registry
///         shape stays stable when that class lands; `createPermissionedERC3643` is intentionally not yet
///         declared here.
interface ITokenFactory {
    /// @notice Token classes the factory can issue. PERMISSIONED_ERC3643 is reserved (deferred — see notes above).
    enum TokenStandard {
        OPEN_ERC20,
        OPEN_ERC721,
        RESTRICTED_ERC1404,
        PERMISSIONED_ERC3643
    }

    /// @notice Per-token T-REX suite addresses (ERC-3643 only). Zero-valued for every other standard.
    ///         Reserved for User Story 4; kept in {TokenRecord} so the registry layout is forward-stable.
    struct TrexSuiteRef {
        address identityRegistry;
        address compliance;
        address claimTopicsRegistry;
        address trustedIssuersRegistry;
    }

    /// @notice One registry row per token created through the factory. Network-scoped (lives on each chain's
    ///         factory; the frontend/subgraph never cross networks — FR-023).
    struct TokenRecord {
        uint256 id;
        TokenStandard standard;
        address tokenAddress;
        address issuer;
        string name;
        string symbol;
        string metadataURI;
        bool isBurnable;
        bool isPausable;
        TrexSuiteRef suite;
        uint64 createdAt;
    }

    // --- Events ---

    event TokenCreated(
        uint256 indexed id,
        TokenStandard indexed standard,
        address indexed token,
        address issuer,
        string name,
        string symbol
    );
    event TemplateUpdated(TokenStandard indexed standard, address impl);
    event SanctionsGuardUpdated(address indexed guard);

    // --- Errors ---

    error ZeroAddress();
    error EmptyMetadata();
    error TemplateNotSet(TokenStandard standard);
    error SanctionedAddress(address account);

    // --- Issuance (onlyRole(TOKEN_ISSUER_ROLE), issuer screened by SanctionsGuard) ---

    function createOpenERC20(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 initialSupply,
        string calldata metadataURI,
        bool burnable,
        bool pausable
    ) external returns (uint256 id, address token);

    function createOpenERC721(
        string calldata name,
        string calldata symbol,
        string calldata baseURI,
        bool burnable
    ) external returns (uint256 id, address token);

    function createRestrictedERC20(
        string calldata name,
        string calldata symbol,
        uint8 decimals,
        uint256 initialSupply,
        string calldata metadataURI,
        address[] calldata initialEligible
    ) external returns (uint256 id, address token);

    // --- Views ---

    function getToken(uint256 id) external view returns (TokenRecord memory);

    function getTokensByIssuer(address issuer) external view returns (uint256[] memory);

    function getTokenIdByAddress(address token) external view returns (uint256);

    function tokenCount() external view returns (uint256);
}
