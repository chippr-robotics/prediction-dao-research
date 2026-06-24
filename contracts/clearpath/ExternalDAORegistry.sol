// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {IExternalDAORegistry} from "./interfaces/IExternalDAORegistry.sol";
import {IMembershipManager} from "../interfaces/IMembershipManager.sol";

/// @title ExternalDAORegistry (ClearPath spec 030, pillar B)
/// @notice Network-scoped on-chain registry of DAOs deployed by other platforms (Olympia + any OpenZeppelin
///         Governor DAO). A member registers an existing governance contract by address; the registry validates
///         it is a recognized governance contract (ERC-165 `IGovernor` probe + defensive `IGovernor` view
///         calls), records it for shared discovery / subgraph indexing, and emits `ExternalDAORegistered`.
///         Registration is gated by a MembershipManager tier (>= Silver). The registry holds NO authority over
///         the registered DAO — ClearPath only reads it and constructs user-signed actions against the DAO's own
///         contract (invariant INV-4). Imports only the `IGovernor` interface (no OZ Governor implementation),
///         so it is paris-safe and deployable on ETC/Mordor.
/// @dev    UUPS (UUPSManaged); append-only storage with a trailing `__gap`; registered in
///         `npm run check:storage-layout`.
contract ExternalDAORegistry is IExternalDAORegistry, UUPSManaged {
    bytes32 public constant DAO_MEMBER_ROLE = keccak256("DAO_MEMBER_ROLE");

    struct Entry {
        address dao;
        Framework framework;
        address registrant;
        uint64 registeredAt;
        string label;
    }

    // ---- Append-only storage (never insert/reorder/remove above __gap) ----
    IMembershipManager public membershipManager;
    uint256 public externalCount;
    mapping(uint256 => Entry) private _entries;
    mapping(address => uint256) private _idByDao; // 0 = not registered (ids start at 1)
    mapping(address => uint256[]) private _byRegistrant;

    uint256[45] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // UUPSManaged constructor already calls _disableInitializers().
    }

    function initialize(address admin, address membershipManager_) external initializer {
        if (admin == address(0) || membershipManager_ == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        membershipManager = IMembershipManager(membershipManager_);
    }

    /// @notice Admin may rotate the membership integration (append-only, UUPS-gated).
    function setMembershipManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (manager == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(manager);
    }

    /// @inheritdoc IExternalDAORegistry
    function registerExternalDAO(address dao, Framework framework, string calldata label)
        external
        returns (uint256 id)
    {
        if (dao == address(0)) revert ZeroAddress();
        if (_idByDao[dao] != 0) revert AlreadyRegistered();
        // Tier gate (>= Silver). Registration is read-only metadata: it does NOT consume a creation quota and is
        // not a value-moving action, so no sanctions screen and no recordCreate (INV: registry confers no power).
        if (
            uint8(membershipManager.getActiveTier(msg.sender, DAO_MEMBER_ROLE)) <
            uint8(IMembershipManager.Tier.Silver)
        ) revert InsufficientMembershipTier();
        if (!_isGovernor(dao)) revert NotAGovernor(dao);

        id = ++externalCount;
        _entries[id] = Entry({
            dao: dao,
            framework: framework,
            registrant: msg.sender,
            registeredAt: uint64(block.timestamp),
            label: label
        });
        _idByDao[dao] = id;
        _byRegistrant[msg.sender].push(id);
        emit ExternalDAORegistered(id, dao, framework, msg.sender, label);
    }

    function getExternalDAO(uint256 id)
        external
        view
        returns (address dao, Framework framework, string memory label, address registrant, uint64 registeredAt)
    {
        Entry storage e = _entries[id];
        return (e.dao, e.framework, e.label, e.registrant, e.registeredAt);
    }

    function isRegistered(address dao) external view returns (bool) {
        return _idByDao[dao] != 0;
    }

    function getExternalDAOsByRegistrant(address who) external view returns (uint256[] memory) {
        return _byRegistrant[who];
    }

    /// @dev Validate that `dao` is a recognized governance contract. Primary: ERC-165 `supportsInterface` for the
    ///      `IGovernor` interfaceId. Fallback (some governors don't implement ERC-165 cleanly): probe two
    ///      `IGovernor` views. Returns false for EOAs and non-governance contracts.
    function _isGovernor(address dao) internal view returns (bool) {
        if (dao.code.length == 0) return false; // EOA
        try IERC165(dao).supportsInterface(type(IGovernor).interfaceId) returns (bool ok) {
            if (ok) return true;
        } catch {}
        // Defensive fallback: a real Governor answers these views; a random contract reverts.
        try IGovernor(dao).COUNTING_MODE() returns (string memory mode) {
            if (bytes(mode).length == 0) return false;
            try IGovernor(dao).votingPeriod() returns (uint256) {
                return true;
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }
}
