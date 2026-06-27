// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IZKWagerPool, PoolState, PayoutEntry} from "./interfaces/IZKWagerPool.sol";
import {ISemaphore} from "./interfaces/ISemaphore.sol";

/// @notice Compliance hooks the pool calls back into its factory (single configured guard +
///         membership manager, screening the real wallet — FR-021).
interface IPoolFactoryHooks {
    function screen(address account) external view;
    function requireMembership(address account) external view;
}

/// @notice EIP-3009 receive authorization used by the gasless join path (P2).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title ZKWagerPool
/// @notice An isolated, immutable group-wager pool (spec 034). Deployed as an ERC-1167 clone by the
///         {ZKWagerPoolFactory}. Members buy in with USDC and join a per-pool Semaphore group; the
///         creator proposes a payout outcome that members anonymously approve to a fraction-of-joined
///         threshold; winners then claim their share to any address.
/// @dev    EthTrust-SL >= L2 target: checks-effects-interactions + reentrancy guards on all
///         value-moving paths; the ONLY escrow exits are {claim} (Resolved) and {refund}/{cancel}
///         (FR-022); the creator cannot force a payout (FR-020b); the `resolutionWindow` refund path
///         guarantees funds are never stuck (FR-019/SC-007). Nicknames are client-side only and never
///         emitted on-chain (FR-009). The master calls `_disableInitializers()`; clones are
///         initialized exactly once by the factory.
contract ZKWagerPool is Initializable, ReentrancyGuardUpgradeable, IZKWagerPool {
    using SafeERC20 for IERC20;

    // ---- Refs (seeded at init; immutable for the pool's life) ----
    address public factory;
    IERC20 private _token;
    ISemaphore private _semaphore;

    // ---- Config (seeded at init) ----
    uint256 public groupId;
    address public creator;
    uint256 public buyIn;
    uint32 public maxMembers;
    uint16 public thresholdBips;
    uint64 public joinDeadline;
    uint64 public resolutionWindow;

    // ---- Bounded mutable state ----
    PoolState public state;
    uint32 public memberCount;
    uint32 public frozenDenominator;
    uint64 public closedAt;
    uint256 public escrowTotal;
    bytes32 public currentProposalId;
    bytes32 public lockedOutcome;

    mapping(address => bool) public hasJoined;
    mapping(address => bool) public refunded;
    mapping(bytes32 => uint32) public proposalApprovals;

    error NotCreator();
    error WrongState();
    error JoinClosed();
    error PoolFull();
    error AlreadyJoined();
    error DeadlineNotPassed();
    error NoProposal();
    error ResolutionWindowClosed();
    error ResolutionWindowOpen();
    error WrongScope();
    error RecipientNotBound();
    error NullifierMismatch();
    error OutcomeMismatch();
    error IndexOOB();
    error MatrixSumMismatch();
    error BadValue();
    error NothingToRefund();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time initialization by the factory (the clone deployer).
    function initialize(
        address token_,
        address semaphore_,
        uint256 groupId_,
        address creator_,
        uint256 buyIn_,
        uint32 maxMembers_,
        uint16 thresholdBips_,
        uint64 joinDeadline_,
        uint64 resolutionWindow_
    ) external initializer {
        __ReentrancyGuard_init();
        factory = msg.sender;
        _token = IERC20(token_);
        _semaphore = ISemaphore(semaphore_);
        groupId = groupId_;
        creator = creator_;
        buyIn = buyIn_;
        maxMembers = maxMembers_;
        thresholdBips = thresholdBips_;
        joinDeadline = joinDeadline_;
        resolutionWindow = resolutionWindow_;
        state = PoolState.JoiningOpen;
    }

    // ---- Interface views backed by private refs ----
    function token() external view returns (address) {
        return address(_token);
    }

    function semaphore() external view returns (address) {
        return address(_semaphore);
    }

    // ---------------------------------------------------------------------
    // Join
    // ---------------------------------------------------------------------

    /// @inheritdoc IZKWagerPool
    function join(uint256 identityCommitment) external nonReentrant {
        _preJoin(msg.sender);
        // Effects before the external token pull (CEI); reentrancy-guarded regardless.
        _recordMember(msg.sender, identityCommitment);
        _token.safeTransferFrom(msg.sender, address(this), buyIn);
        _maybeAutoClose();
    }

    /// @inheritdoc IZKWagerPool
    function joinWithAuthorization(
        uint256 identityCommitment,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (value != buyIn) revert BadValue();
        _preJoin(from);
        _recordMember(from, identityCommitment);
        // EIP-3009 pull: authorization is bound to (from, this, value, nonce); replay-protected by the token.
        IERC3009(address(_token)).receiveWithAuthorization(
            from, address(this), value, validAfter, validBefore, nonce, v, r, s
        );
        _maybeAutoClose();
    }

    function _preJoin(address member) internal view {
        if (state != PoolState.JoiningOpen) revert JoinClosed();
        if (block.timestamp >= joinDeadline) revert JoinClosed();
        if (memberCount >= maxMembers) revert PoolFull();
        if (hasJoined[member]) revert AlreadyJoined();
        // Compliance on the REAL wallet, before any anonymization (FR-021d).
        IPoolFactoryHooks(factory).screen(member);
        IPoolFactoryHooks(factory).requireMembership(member);
    }

    function _recordMember(address member, uint256 identityCommitment) internal {
        hasJoined[member] = true;
        memberCount += 1;
        _semaphore.addMember(groupId, identityCommitment);
        emit Joined(identityCommitment);
    }

    function _maybeAutoClose() internal {
        if (memberCount >= maxMembers) _close();
    }

    // ---------------------------------------------------------------------
    // Close joining (freeze the denominator) — FR-007a
    // ---------------------------------------------------------------------

    /// @inheritdoc IZKWagerPool
    function closeJoining() external {
        if (msg.sender != creator) revert NotCreator();
        if (state != PoolState.JoiningOpen) revert WrongState();
        _close();
    }

    /// @inheritdoc IZKWagerPool
    function pokeDeadline() external {
        if (state != PoolState.JoiningOpen) revert WrongState();
        if (block.timestamp < joinDeadline) revert DeadlineNotPassed();
        _close();
    }

    function _close() internal {
        state = PoolState.JoiningClosed;
        frozenDenominator = memberCount;
        closedAt = uint64(block.timestamp);
        escrowTotal = uint256(memberCount) * buyIn;
        emit JoiningClosedEvent(frozenDenominator);
    }

    // ---------------------------------------------------------------------
    // Resolution — creator proposes, members anonymously approve (FR-020/FR-013/FR-016)
    // ---------------------------------------------------------------------

    /// @inheritdoc IZKWagerPool
    function proposeOutcome(bytes32 proposalId) external {
        if (msg.sender != creator) revert NotCreator();
        _requireResolving();
        if (proposalId == bytes32(0)) revert OutcomeMismatch();
        // Revising resets nothing in storage: approvals are keyed by proposalId, so a new id starts at 0.
        currentProposalId = proposalId;
        emit OutcomeProposed(proposalId);
    }

    /// @inheritdoc IZKWagerPool
    function approve(ISemaphore.SemaphoreProof calldata proof) external {
        _requireResolving();
        bytes32 pid = currentProposalId;
        if (pid == bytes32(0)) revert NoProposal();
        if (proof.scope != uint256(pid)) revert WrongScope();
        // Validates membership + consumes the nullifier (one approval per member per proposal, FR-014).
        _semaphore.validateProof(groupId, proof);
        uint32 count = proposalApprovals[pid] + 1;
        proposalApprovals[pid] = count;
        emit Approved(pid, proof.nullifier, proof.message);
        if (count >= _requiredApprovals()) {
            state = PoolState.Resolved;
            lockedOutcome = pid;
            emit OutcomeLocked(pid);
        }
    }

    /// @dev Approvals required = ceil(frozenDenominator * thresholdBips / 10000), minimum 1.
    function _requiredApprovals() internal view returns (uint32) {
        uint256 num = uint256(frozenDenominator) * thresholdBips;
        uint256 req = (num + 9999) / 10000;
        if (req == 0) req = 1;
        return uint32(req);
    }

    /// @dev Resolution actions are valid only while closed AND within the resolution window;
    ///      once the window elapses the pool is refund-only (FR-019).
    function _requireResolving() internal view {
        if (state != PoolState.JoiningClosed) revert WrongState();
        if (block.timestamp >= closedAt + resolutionWindow) revert ResolutionWindowClosed();
    }

    // ---------------------------------------------------------------------
    // Payout / refund / cancel — the ONLY escrow exits (FR-022)
    // ---------------------------------------------------------------------

    /// @inheritdoc IZKWagerPool
    function claim(
        PayoutEntry[] calldata entries,
        uint256 index,
        ISemaphore.SemaphoreProof calldata proof,
        address recipient
    ) external nonReentrant {
        if (state != PoolState.Resolved) revert WrongState();
        if (keccak256(abi.encode(entries)) != lockedOutcome) revert OutcomeMismatch();
        if (index >= entries.length) revert IndexOOB();
        if (proof.scope != _claimScope()) revert WrongScope();
        if (proof.message != uint256(uint160(recipient))) revert RecipientNotBound();
        if (proof.nullifier != entries[index].claimNullifier) revert NullifierMismatch();
        // Every wei must be allocated so nothing is ever stuck (FR-019/SC-007); cheap for v1 sizes.
        if (_sum(entries) != escrowTotal) revert MatrixSumMismatch();

        // Proves identity ownership AND consumes the claim nullifier (no double-claim, FR-017).
        _semaphore.validateProof(groupId, proof);

        uint256 amount = entries[index].amount;
        emit Claimed(bytes32(proof.nullifier), recipient, amount);
        _token.safeTransfer(recipient, amount);
    }

    /// @inheritdoc IZKWagerPool
    function refund() external nonReentrant {
        bool windowElapsed = state == PoolState.JoiningClosed && block.timestamp >= closedAt + resolutionWindow;
        if (state != PoolState.Cancelled && !windowElapsed) revert WrongState();
        if (!hasJoined[msg.sender] || refunded[msg.sender]) revert NothingToRefund();
        refunded[msg.sender] = true;
        emit Refunded(msg.sender, buyIn);
        _token.safeTransfer(msg.sender, buyIn);
    }

    /// @inheritdoc IZKWagerPool
    function cancel() external {
        if (msg.sender != creator) revert NotCreator();
        if (state != PoolState.JoiningOpen) revert WrongState();
        state = PoolState.Cancelled;
        emit PoolCancelled();
    }

    // ---- helpers ----
    function _claimScope() internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(address(this), "ZKPOOL_CLAIM")));
    }

    function _sum(PayoutEntry[] calldata entries) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < entries.length; i++) {
            total += entries[i].amount;
        }
    }
}
