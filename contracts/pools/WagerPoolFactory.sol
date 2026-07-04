// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {ISanctionsGuard} from "../interfaces/ISanctionsGuard.sol";
import {IMembershipManager} from "../interfaces/IMembershipManager.sol";
import {IWagerPoolFactory} from "./interfaces/IWagerPoolFactory.sol";
import {WagerPool} from "./WagerPool.sol";

/// @title WagerPoolFactory — authority & registry for group-wager pools (spec 034, address-based)
/// @notice The single upgradeable, state-bearing contract that clones isolated {WagerPool} instances. It
///         screens the creator (sanctions + `POOL_PARTICIPANT_ROLE` membership), assigns a unique
///         language-independent 4-word BIP-39 index tuple, deploys the pool as an immutable ERC-1167
///         clone, and records it in a network-scoped registry. No Semaphore / anonymity primitive is
///         involved — membership and voting are by public wallet address.
/// @dev    Inherits {UUPSManaged} (UUPS + AccessControl + non-brickable upgrade gate + impl-init
///         lockout) and {ReentrancyGuardUpgradeable}. Storage is append-only with a trailing `__gap`
///         (register in `npm run check:storage-layout`). Pools are IMMUTABLE clones — only this factory
///         is upgradeable. Compliance is enforced on the real wallet (FR-021); when `screeningRequired`
///         is set (value-bearing networks) a sanctions guard AND membership manager MUST be configured,
///         and create/join revert otherwise (FR-021a). It also serves the pools' compliance callbacks
///         via {screen}/{requireMembership}. Timing mirrors the 1v1/oracle {WagerRegistry}: two absolute
///         deadlines (`acceptDeadline`, `resolveDeadline`), bounded + ordered by {_checkDeadlines}.
contract WagerPoolFactory is IWagerPoolFactory, UUPSManaged, ReentrancyGuardUpgradeable {
    /// @notice Membership role gating pool participation, distinct from `WAGER_PARTICIPANT_ROLE`
    ///         (FR-021b).
    bytes32 public constant POOL_PARTICIPANT_ROLE = keccak256("POOL_PARTICIPANT_ROLE");

    /// @notice Hard cap on members per pool (FR-002a / SC-012).
    uint32 public constant MAX_MEMBERS_CAP = 1000;

    /// @notice Deadline bounds, mirroring {WagerRegistry} so pools and 1v1/oracle wagers behave
    ///         identically (30-day accept horizon, 180-day resolve horizon).
    uint64 public constant MAX_ACCEPT_WINDOW = 30 days;
    uint64 public constant MAX_RESOLVE_WINDOW = 180 days;

    // ---- Append-only storage (never insert/reorder/remove above __gap) ----

    /// @notice Immutable pool implementation cloned per pool (replaceable by admin via {setTemplate}).
    address public poolImpl;

    /// @notice Sanctions screen for creators + joiners. address(0) disables (only allowed when
    ///         `screeningRequired` is false — local/dev/test).
    ISanctionsGuard public sanctionsGuard;

    /// @notice Membership gate (`POOL_PARTICIPANT_ROLE`). address(0) disables under the same rule.
    IMembershipManager public membershipManager;

    /// @notice When true (value-bearing networks), both guards MUST be configured; create/join revert
    ///         if screening cannot be performed (FR-021a).
    bool public screeningRequired;

    /// @notice Monotonic id allocator. Ids start at 1 so `poolAddressToId == 0` means "unknown".
    uint256 public poolCount;

    mapping(uint256 => address) private _pools;

    /// @notice Reverse lookup: pool address -> registry id (0 == unknown).
    mapping(address => uint256) public poolAddressToId;

    /// @notice keccak256(wordIndices) -> pool, for gateway resolution + uniqueness (FR-003/FR-004).
    mapping(bytes32 => address) private _phraseToPool;
    mapping(address => uint32[4]) private _poolToPhrase;

    /// @notice Buy-in token allowlist (FR-024). Enforced only when `screeningRequired` (value-bearing
    ///         networks); on local/dev/test any token is accepted so fixtures can use a mock USDC.
    mapping(address => bool) public allowedToken;

    uint256[49] private __gap;

    error InvalidParams();
    error BadDeadlines();
    error TokenNotAllowed();
    error ScreeningNotConfigured();
    error MembershipNotConfigured();
    error MembershipDenied();
    error UnknownPhrase();

    /// @notice Initialize the factory proxy.
    function initialize(
        address admin,
        address poolImpl_,
        address sanctionsGuard_,
        address membershipManager_,
        bool screeningRequired_
    ) external initializer {
        __UUPSManaged_init(admin);
        __ReentrancyGuard_init();
        if (poolImpl_ == address(0)) revert InvalidParams();
        if (screeningRequired_ && (sanctionsGuard_ == address(0) || membershipManager_ == address(0))) {
            revert InvalidParams();
        }
        poolImpl = poolImpl_;
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_);
        membershipManager = IMembershipManager(membershipManager_);
        screeningRequired = screeningRequired_;
    }

    // ---------------------------------------------------------------------
    // Create
    // ---------------------------------------------------------------------

    /// @inheritdoc IWagerPoolFactory
    function createPool(CreatePoolParams calldata p)
        external
        nonReentrant
        returns (uint256 poolId, address pool)
    {
        // Screen the creator on the real wallet, before any pool exists (FR-021).
        screen(msg.sender);
        requireMembership(msg.sender);

        if (
            p.token == address(0) || p.buyIn == 0 || p.maxMembers < 2 || p.maxMembers > MAX_MEMBERS_CAP
                || p.thresholdBips == 0 || p.thresholdBips > 10000
        ) revert InvalidParams();
        // Buy-in must be an allowlisted token on value-bearing networks (FR-024). escrowTotal is derived
        // arithmetically (memberCount * buyIn), which only holds for a well-behaved (non fee-on-transfer,
        // non-rebasing) token — so the token set is curated by the admin, not creator-chosen.
        if (screeningRequired && !allowedToken[p.token]) revert TokenNotAllowed();
        _checkDeadlines(p.acceptDeadline, p.resolveDeadline);

        poolId = ++poolCount;
        pool = Clones.clone(poolImpl);

        WagerPool(pool).initialize(
            p.token, msg.sender, p.buyIn, p.maxMembers, p.thresholdBips, p.acceptDeadline, p.resolveDeadline
        );

        uint32[4] memory wordIndices = _assignPhrase(poolId, pool);

        _pools[poolId] = pool;
        poolAddressToId[pool] = poolId;

        emit PoolCreated(
            poolId,
            pool,
            msg.sender,
            wordIndices,
            p.token,
            p.buyIn,
            p.maxMembers,
            p.thresholdBips,
            p.acceptDeadline,
            p.resolveDeadline
        );
    }

    /// @dev Deadline bounds + ordering, mirroring {WagerRegistry._checkDeadlines}: acceptance in the
    ///      future and within 30 days; resolution strictly after acceptance and within 180 days.
    function _checkDeadlines(uint64 acceptDeadline, uint64 resolveDeadline) internal view {
        if (acceptDeadline <= block.timestamp) revert BadDeadlines();
        if (resolveDeadline <= acceptDeadline) revert BadDeadlines();
        if (acceptDeadline > block.timestamp + MAX_ACCEPT_WINDOW) revert BadDeadlines();
        if (resolveDeadline > block.timestamp + MAX_RESOLVE_WINDOW) revert BadDeadlines();
    }

    /// @dev Derive a unique 4-word BIP-39 index tuple (each 0..2047) for `poolId`, collision-checked
    ///      against active pools (FR-003). The tuple is the language-independent identity; the frontend
    ///      renders it through the active language's wordlist.
    function _assignPhrase(uint256 poolId, address pool) internal returns (uint32[4] memory idx) {
        uint256 nonce;
        bytes32 key;
        while (true) {
            uint256 h = uint256(keccak256(abi.encode(poolId, nonce)));
            idx[0] = uint32(h % 2048);
            idx[1] = uint32((h >> 11) % 2048);
            idx[2] = uint32((h >> 22) % 2048);
            idx[3] = uint32((h >> 33) % 2048);
            key = _phraseKey(idx);
            if (_phraseToPool[key] == address(0)) break;
            unchecked {
                nonce++;
            }
        }
        _phraseToPool[key] = pool;
        _poolToPhrase[pool] = idx;
    }

    function _phraseKey(uint32[4] memory idx) internal pure returns (bytes32) {
        return keccak256(abi.encode(idx[0], idx[1], idx[2], idx[3]));
    }

    // ---------------------------------------------------------------------
    // Gateway resolution + registry views
    // ---------------------------------------------------------------------

    /// @inheritdoc IWagerPoolFactory
    function poolByPhrase(uint32[4] calldata wordIndices) external view returns (address pool) {
        uint32[4] memory idx = wordIndices;
        return _phraseToPool[_phraseKey(idx)];
    }

    /// @inheritdoc IWagerPoolFactory
    function phraseOfPool(address pool) external view returns (uint32[4] memory wordIndices) {
        return _poolToPhrase[pool];
    }

    /// @inheritdoc IWagerPoolFactory
    function poolById(uint256 poolId) external view returns (address pool) {
        return _pools[poolId];
    }

    // ---------------------------------------------------------------------
    // Compliance callbacks (used by pools, on the real wallet) — FR-021
    // ---------------------------------------------------------------------

    /// @notice Reverts if `account` fails sanctions screening; reverts if screening is required but
    ///         unconfigured (FR-021a). No-op when disabled on local/dev/test.
    function screen(address account) public view {
        ISanctionsGuard g = sanctionsGuard;
        if (address(g) == address(0)) {
            if (screeningRequired) revert ScreeningNotConfigured();
            return;
        }
        g.checkBlocked(account);
    }

    /// @notice Reverts if `account` is not an allowed `POOL_PARTICIPANT_ROLE` member; reverts if
    ///         membership is required but unconfigured (FR-021b).
    function requireMembership(address account) public view {
        IMembershipManager m = membershipManager;
        if (address(m) == address(0)) {
            if (screeningRequired) revert MembershipNotConfigured();
            return;
        }
        if (!m.checkCanCreate(account, POOL_PARTICIPANT_ROLE)) revert MembershipDenied();
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @inheritdoc IWagerPoolFactory
    function setTemplate(address newPoolImpl) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newPoolImpl == address(0)) revert InvalidParams();
        poolImpl = newPoolImpl;
        emit TemplateUpdated(newPoolImpl);
    }

    /// @inheritdoc IWagerPoolFactory
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (screeningRequired && guard == address(0)) revert ScreeningNotConfigured();
        sanctionsGuard = ISanctionsGuard(guard);
        emit SanctionsGuardUpdated(guard);
    }

    /// @notice Set/replace the membership manager. When `screeningRequired`, address(0) is rejected.
    function setMembershipManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (screeningRequired && manager == address(0)) revert MembershipNotConfigured();
        membershipManager = IMembershipManager(manager);
    }

    /// @notice Allow/deny a buy-in token (FR-024). Curate the canonical USDC per network here; on
    ///         value-bearing networks {createPool} rejects any token not on this list.
    function setAllowedToken(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }
}
