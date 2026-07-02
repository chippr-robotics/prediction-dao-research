// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Compliance hooks the pool calls back into its factory (single configured guard +
///         membership manager, screening the real wallet — FR-021). Shared with {ZKWagerPool}.
interface IPoolFactoryHooks {
    function screen(address account) external view;
    function requireMembership(address account) external view;
}

/// @notice EIP-3009 receive authorization used by the gasless join path.
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

/// @notice Pool lifecycle — same states as {ZKWagerPool} so the frontend/subgraph state mapping is shared.
enum PoolState {
    JoiningOpen,
    JoiningClosed,
    Resolved,
    Cancelled
}

/// @notice One row of the payout matrix. A winner is identified by their **wallet address** (public),
///         so the creator builds the payout straight from the roster and every party derives the same
///         "claim code" — the address itself — with no off-chain code exchange. The matrix preimage
///         hashes to the locked outcome.
struct PayoutEntry {
    address winner;
    uint256 amount;
}

/// @title PublicWagerPool
/// @notice A non-anonymous, address-based group-wager pool (spec 034 resolution redesign). A drop-in
///         replacement template for {ZKWagerPool}: it is deployed as an ERC-1167 clone by the same
///         {ZKWagerPoolFactory} and keeps the IDENTICAL `initialize(...)` signature, so the factory can
///         adopt it with `setTemplate(newImpl)` and no factory upgrade. Unlike {ZKWagerPool} it uses no
///         Semaphore: members join / approve / claim with their real wallet, and the payout matrix keys
///         on the winner's address. Anonymity of membership is intentionally dropped (product decision);
///         in exchange the confusing per-member "claim code" (a private Semaphore nullifier) is gone.
///
/// @dev    The `semaphore_`/`groupId_` init args are accepted but UNUSED — they exist only so the call
///         selector matches the factory's `ZKWagerPool(pool).initialize(...)`. The factory still creates
///         a per-pool Semaphore group that this template never touches; trimming that is a safe factory
///         follow-up (the group is inert). Security posture matches {ZKWagerPool}: checks-effects-
///         interactions + a reentrancy guard on every value-moving path; the ONLY escrow exits are
///         {claim} (Resolved) and {refund}/{cancel}; the creator cannot force a payout (members approve
///         to a fraction-of-joined threshold); the `resolutionWindow` refund path guarantees funds are
///         never stuck. The master calls `_disableInitializers()`; clones initialize exactly once.
///
///         SECURITY REVIEW REQUIRED before this template is set live on any value-bearing network
///         (`.github/agents/smart-contract-security`); see specs/034-zk-wager-pools/implementation-notes.md.
contract PublicWagerPool is Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    // ---- Refs (seeded at init; immutable for the pool's life) ----
    address public factory;
    IERC20 private _token;

    // ---- Config (seeded at init) ----
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
    mapping(address => bool) public claimed;
    /// @notice proposalId => approval count.
    mapping(bytes32 => uint32) public proposalApprovals;
    /// @notice proposalId => member => whether they already approved it (one vote per member per proposal).
    mapping(bytes32 => mapping(address => bool)) public approvedBy;

    error NotCreator();
    error NotMember();
    error WrongState();
    error JoinClosed();
    error PoolFull();
    error AlreadyJoined();
    error DeadlineNotPassed();
    error NoProposal();
    error AlreadyApproved();
    error ResolutionWindowClosed();
    error OutcomeMismatch();
    error IndexOOB();
    error NotWinner();
    error AlreadyClaimed();
    error MatrixSumMismatch();
    error BadValue();
    error NothingToRefund();

    event Joined(address indexed member);
    event JoiningClosedEvent(uint32 frozenDenominator);
    event OutcomeProposed(bytes32 indexed proposalId);
    event Approved(bytes32 indexed proposalId, address indexed member);
    event OutcomeLocked(bytes32 indexed proposalId);
    event Claimed(address indexed winner, address recipient, uint256 amount);
    event Refunded(address indexed member, uint256 amount);
    event PoolCancelled();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice One-time initialization by the factory (the clone deployer). `semaphore_` and `groupId_`
    ///         are accepted for call-selector compatibility with the factory and are intentionally unused.
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
        semaphore_; // unused (factory-compat)
        groupId_; // unused (factory-compat)
        factory = msg.sender;
        _token = IERC20(token_);
        creator = creator_;
        buyIn = buyIn_;
        maxMembers = maxMembers_;
        thresholdBips = thresholdBips_;
        joinDeadline = joinDeadline_;
        resolutionWindow = resolutionWindow_;
        state = PoolState.JoiningOpen;
    }

    /// @notice The buy-in token.
    function token() external view returns (address) {
        return address(_token);
    }

    // ---------------------------------------------------------------------
    // Join
    // ---------------------------------------------------------------------

    /// @notice Join the pool by paying the buy-in (requires a prior ERC-20 approve).
    function join() external nonReentrant {
        _preJoin(msg.sender);
        _recordMember(msg.sender);
        _token.safeTransferFrom(msg.sender, address(this), buyIn);
        _maybeAutoClose();
    }

    /// @notice Gasless join via EIP-3009 (a relayer submits; the member signs the authorization).
    function joinWithAuthorization(
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
        _recordMember(from);
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
        // Compliance on the real wallet (FR-021).
        IPoolFactoryHooks(factory).screen(member);
        IPoolFactoryHooks(factory).requireMembership(member);
    }

    function _recordMember(address member) internal {
        hasJoined[member] = true;
        memberCount += 1;
        emit Joined(member);
    }

    function _maybeAutoClose() internal {
        if (memberCount >= maxMembers) _close();
    }

    // ---------------------------------------------------------------------
    // Close joining (freeze the denominator)
    // ---------------------------------------------------------------------

    function closeJoining() external {
        if (msg.sender != creator) revert NotCreator();
        if (state != PoolState.JoiningOpen) revert WrongState();
        _close();
    }

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
    // Resolution — creator proposes, members approve
    // ---------------------------------------------------------------------

    /// @notice Creator proposes (or revises) the payout outcome. `proposalId` = keccak256(abi.encode(
    ///         PayoutEntry[])). Revising with a new id restarts approvals (they are keyed by id).
    function proposeOutcome(bytes32 proposalId) external {
        if (msg.sender != creator) revert NotCreator();
        _requireResolving();
        if (proposalId == bytes32(0)) revert OutcomeMismatch();
        currentProposalId = proposalId;
        emit OutcomeProposed(proposalId);
    }

    /// @notice A joined member approves the current proposal (one approval per member per proposal). The
    ///         pool resolves once approvals reach the fraction-of-joined threshold.
    function approve() external {
        _requireResolving();
        if (!hasJoined[msg.sender]) revert NotMember();
        bytes32 pid = currentProposalId;
        if (pid == bytes32(0)) revert NoProposal();
        if (approvedBy[pid][msg.sender]) revert AlreadyApproved();
        approvedBy[pid][msg.sender] = true;
        uint32 count = proposalApprovals[pid] + 1;
        proposalApprovals[pid] = count;
        emit Approved(pid, msg.sender);
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

    /// @dev Resolution actions are valid only while closed AND within the resolution window; after the
    ///      window elapses the pool is refund-only.
    function _requireResolving() internal view {
        if (state != PoolState.JoiningClosed) revert WrongState();
        if (block.timestamp >= closedAt + resolutionWindow) revert ResolutionWindowClosed();
    }

    // ---------------------------------------------------------------------
    // Payout / refund / cancel — the ONLY escrow exits
    // ---------------------------------------------------------------------

    /// @notice Claim a winning share. `msg.sender` must be `entries[index].winner`; funds go to
    ///         `recipient` (any address the winner chooses). The matrix preimage must hash to the locked
    ///         outcome and allocate the full escrow, so nothing is ever stuck.
    function claim(PayoutEntry[] calldata entries, uint256 index, address recipient) external nonReentrant {
        if (state != PoolState.Resolved) revert WrongState();
        if (keccak256(abi.encode(entries)) != lockedOutcome) revert OutcomeMismatch();
        if (index >= entries.length) revert IndexOOB();
        if (entries[index].winner != msg.sender) revert NotWinner();
        if (claimed[msg.sender]) revert AlreadyClaimed();
        if (_sum(entries) != escrowTotal) revert MatrixSumMismatch();

        claimed[msg.sender] = true;
        uint256 amount = entries[index].amount;
        emit Claimed(msg.sender, recipient, amount);
        _token.safeTransfer(recipient, amount);
    }

    /// @notice Recover the buy-in after cancellation or an elapsed resolution window with no outcome.
    function refund() external nonReentrant {
        bool windowElapsed = state == PoolState.JoiningClosed && block.timestamp >= closedAt + resolutionWindow;
        if (state != PoolState.Cancelled && !windowElapsed) revert WrongState();
        if (!hasJoined[msg.sender] || refunded[msg.sender]) revert NothingToRefund();
        refunded[msg.sender] = true;
        emit Refunded(msg.sender, buyIn);
        _token.safeTransfer(msg.sender, buyIn);
    }

    /// @notice Creator cancels a pool before joining closes (members can then refund).
    function cancel() external {
        if (msg.sender != creator) revert NotCreator();
        if (state != PoolState.JoiningOpen) revert WrongState();
        state = PoolState.Cancelled;
        emit PoolCancelled();
    }

    function _sum(PayoutEntry[] calldata entries) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < entries.length; i++) {
            total += entries[i].amount;
        }
    }
}
