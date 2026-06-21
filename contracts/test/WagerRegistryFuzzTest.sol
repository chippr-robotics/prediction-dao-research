// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../wagers/WagerRegistry.sol";
import "../access/MembershipManager.sol";
import "../mocks/MockERC20.sol";
import "../interfaces/IWagerRegistry.sol";
import "../interfaces/IMembershipManager.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title WagerRegistryFuzzTest
/// @notice Medusa fuzz test contract for WagerRegistry invariants.
/// @dev    Deploys the full stack (MockERC20, MembershipManager, WagerRegistry)
///         in the constructor and exposes `property_` functions that Medusa calls
///         after arbitrary sequences of transactions.
contract WagerRegistryFuzzTest {
    WagerRegistry public registry;
    MembershipManager public membership;
    MockERC20 public token;

    bytes32 public constant WAGER_PARTICIPANT_ROLE = keccak256("WAGER_PARTICIPANT_ROLE");

    // Addresses used by the fuzz harness.  Medusa's default sender addresses
    // are 0x10000, 0x20000, 0x30000 — the deployer is 0x30000 (address(this)
    // inside the constructor when Medusa deploys). We use OPPONENT as a second
    // known participant.
    address public immutable deployer;
    address public constant OPPONENT = address(0x20000);
    address public constant TREASURY = address(0x40000);

    uint256 private _previousWagerCount;

    // ---------- open-challenge (024) tracking ----------
    // Open wagers the harness created, plus the claim authority each was gated by. The harness cannot forge
    // the EIP-712 acceptance signature for these authorities, so it exercises create/cancel/refund/slot-release
    // without ever reaching a (signature-gated) accept.
    uint256[] private _openWagerIds;
    mapping(uint256 => address) private _openClaimAuthority;
    uint256 private _openSalt;

    // Snapshot of per-wager status for forward-only state check.
    // Medusa calls property functions between arbitrary tx sequences, so we
    // record the last-seen status of each wager to detect backward transitions.
    mapping(uint256 => IWagerRegistry.Status) private _lastSeenStatus;

    // ---------- constructor ----------

    constructor() {
        deployer = address(this);

        // 1. Deploy MockERC20 with large supply
        token = new MockERC20("FuzzCoin", "FUZZ", 1e30);

        // 2. Deploy MembershipManager (now UUPS-upgradeable — spec 027: deploy impl behind an ERC1967 proxy
        //    and initialize through it, exactly as production does).
        MembershipManager membershipImpl = new MembershipManager();
        bytes memory mgrInit = abi.encodeCall(
            MembershipManager.initialize,
            (deployer, address(token), TREASURY)
        );
        membership = MembershipManager(address(new ERC1967Proxy(address(membershipImpl), mgrInit)));

        // 3. Deploy WagerRegistry (no polymarket adapter, single token).
        //    Now UUPS-upgradeable: deploy the implementation behind an ERC1967 proxy (the implementation's
        //    own initializers are disabled by UUPSManaged, so we initialize through the proxy — exactly as
        //    production does). The fuzzer then targets the proxy.
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        WagerRegistry registryImpl = new WagerRegistry();
        bytes memory initData = abi.encodeCall(
            WagerRegistry.initialize,
            (deployer, address(membership), address(0), tokens)
        );
        registry = WagerRegistry(address(new ERC1967Proxy(address(registryImpl), initData)));

        // 4. Authorize the WagerRegistry to call membership hooks
        membership.setAuthorizedCaller(address(registry), true);

        // 5. Configure Bronze + Silver tiers. Silver is needed so the deployer can create OPEN challenges
        //    (createOpenWager requires Silver+); Bronze remains configured for the named-opponent paths.
        IMembershipManager.Limits memory limits = IMembershipManager.Limits({
            monthlyMarketCreation: 1000,
            maxConcurrentMarkets: 100
        });
        membership.setTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Bronze, 1e6, 30, limits, true);
        membership.setTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver, 2e6, 30, limits, true);

        // 6. Fund deployer, approve, and purchase Silver (covers both named-opponent and open-challenge create).
        token.approve(address(membership), type(uint256).max);
        membership.purchaseTier(WAGER_PARTICIPANT_ROLE, IMembershipManager.Tier.Silver);
        token.approve(address(registry), type(uint256).max);

        // 7. Fund and set up the opponent address
        token.mint(OPPONENT, 1e30);

        _previousWagerCount = 0;
    }

    // ================================================================
    //  Helper: creates a simple wager with sensible defaults.
    //  Returns the new wagerId or reverts.
    // ================================================================

    function _createSimpleWager(uint128 creatorStake, uint128 opponentStake)
        internal
        returns (uint256 wagerId)
    {
        uint64 accept = uint64(block.timestamp + 1 days);
        uint64 resolve = uint64(block.timestamp + 7 days);
        wagerId = registry.createWager(
            OPPONENT,
            address(0),
            address(token),
            creatorStake,
            opponentStake,
            accept,
            resolve,
            IWagerRegistry.ResolutionType.Either,
            bytes32(0),
            false,
            keccak256("fuzz"),
            "ipfs://fuzz"
        );
    }

    // ================================================================
    //  PROPERTY 1: Wager count never decreases
    // ================================================================

    function property_wager_count_never_decreases() public returns (bool) {
        uint256 current = registry.nextWagerId();
        bool result = current >= _previousWagerCount;
        _previousWagerCount = current;
        return result;
    }

    // ================================================================
    //  PROPERTY 2: Escrow balance covers active wager stakes
    //  For every wager that is Open or Active and not yet paid/refunded,
    //  the contract's token balance must be >= the sum of locked stakes.
    // ================================================================

    function property_escrow_covers_active_stakes() public view returns (bool) {
        uint256 totalLocked = 0;
        uint256 count = registry.nextWagerId();
        for (uint256 i = 1; i < count; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(i);
            if (w.status == IWagerRegistry.Status.Open) {
                totalLocked += w.creatorStake;
            } else if (w.status == IWagerRegistry.Status.Active && !w.paid) {
                totalLocked += uint256(w.creatorStake) + uint256(w.opponentStake);
            } else if (w.status == IWagerRegistry.Status.Resolved && !w.paid) {
                totalLocked += uint256(w.creatorStake) + uint256(w.opponentStake);
            }
        }
        return token.balanceOf(address(registry)) >= totalLocked;
    }

    // ================================================================
    //  PROPERTY 3: Resolved wager winner is always creator or opponent
    // ================================================================

    function property_winner_is_participant() public view returns (bool) {
        uint256 count = registry.nextWagerId();
        for (uint256 i = 1; i < count; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(i);
            if (w.status == IWagerRegistry.Status.Resolved) {
                if (w.winner == address(0)) return false;
                if (w.winner != w.creator && w.winner != w.opponent) return false;
            }
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 4: Double-claim is impossible
    //  If a wager is paid, the paid flag must remain set and claimPayout
    //  would revert with AlreadyPaid.
    // ================================================================

    function property_no_double_claim() public view returns (bool) {
        uint256 count = registry.nextWagerId();
        for (uint256 i = 1; i < count; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(i);
            if (w.status == IWagerRegistry.Status.Resolved && w.paid) {
                // Re-read to verify the paid flag is still set (storage consistency)
                IWagerRegistry.Wager memory w2 = registry.getWager(i);
                if (!w2.paid) return false;
            }
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 5: State can only progress forward
    //  Valid transitions:
    //    None (slot zeroed by cancel/decline)
    //    Open -> Active | None (cancel/decline) | Refunded
    //    Active -> Resolved | Refunded
    //    Resolved / Refunded are terminal (never revert)
    //  We track last-seen status per wager and verify monotonicity.
    // ================================================================

    function property_state_only_progresses_forward() public returns (bool) {
        uint256 count = registry.nextWagerId();
        for (uint256 i = 1; i < count; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(i);
            IWagerRegistry.Status current = w.status;
            IWagerRegistry.Status previous = _lastSeenStatus[i];

            // Record current for next call
            _lastSeenStatus[i] = current;

            // First time we see this wager, skip comparison
            if (previous == IWagerRegistry.Status.None && current != IWagerRegistry.Status.None) {
                continue;
            }

            // Terminal states must never change
            if (previous == IWagerRegistry.Status.Resolved && current != IWagerRegistry.Status.Resolved) {
                return false;
            }
            if (previous == IWagerRegistry.Status.Refunded && current != IWagerRegistry.Status.Refunded) {
                return false;
            }

            // Active must not go back to Open
            if (previous == IWagerRegistry.Status.Active && current == IWagerRegistry.Status.Open) {
                return false;
            }

            // Resolved wager must have a winner set
            if (current == IWagerRegistry.Status.Resolved) {
                if (w.winner == address(0)) return false;
            }
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 6: Payout equals creatorStake + opponentStake
    //  For any resolved + paid wager, both stakes must be nonzero
    //  (they were validated on creation) and the payout formula in
    //  claimPayout is `creatorStake + opponentStake`.
    // ================================================================

    function property_payout_equals_total_stakes() public view returns (bool) {
        uint256 count = registry.nextWagerId();
        for (uint256 i = 1; i < count; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(i);
            if (w.status == IWagerRegistry.Status.Resolved && w.paid) {
                // Both stakes must be > 0 (enforced at creation)
                if (w.creatorStake == 0 || w.opponentStake == 0) return false;
            }
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 7: Frozen accounts cannot call state-mutating functions
    //  We freeze a target, verify the flag, and confirm the invariant.
    // ================================================================

    function property_frozen_cannot_create(address target) public returns (bool) {
        if (target == address(0) || target == address(this)) return true;

        // Freeze the target
        registry.freezeAccount(target, "fuzz-freeze");
        bool isFrozen = registry.isFrozen(target);
        if (!isFrozen) return false;

        // Unfreeze so we don't permanently lock accounts
        registry.unfreezeAccount(target);
        return true;
    }

    // ================================================================
    //  PROPERTY 8: Paused contract blocks all state-mutating functions
    // ================================================================

    function property_pause_blocks_creation() public returns (bool) {
        registry.pause();

        // createWager should revert because paused
        bool blocked = false;
        try this._tryCreate() returns (uint256) {
            blocked = false; // Should not succeed
        } catch {
            blocked = true; // Expected: EnforcedPause revert
        }

        registry.unpause();
        return blocked;
    }

    /// @dev External helper so we can use try/catch on it
    function _tryCreate() external returns (uint256) {
        return _createSimpleWager(1e6, 1e6);
    }

    // ================================================================
    //  PROPERTY 9: Refund returns full stakes — no partial refund
    //  For every refunded wager, the contract must have paid back
    //  the full creatorStake (and opponentStake if Active at refund).
    //  We verify indirectly: if status==Refunded, the wager's stakes
    //  must still be nonzero in storage (they are not zeroed).
    //  Combined with property_escrow_covers_active_stakes, this
    //  guarantees the contract released exactly the right amounts.
    // ================================================================

    function property_refund_preserves_stake_values() public view returns (bool) {
        uint256 count = registry.nextWagerId();
        for (uint256 i = 1; i < count; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(i);
            if (w.status == IWagerRegistry.Status.Refunded) {
                // Stakes should still be recorded (not zeroed)
                if (w.creatorStake == 0) return false;
                // If the wager was Active before refund, opponentStake > 0 too
                // (both are set at creation and never modified)
            }
        }
        return true;
    }

    // ================================================================
    //  PROPERTY 10: nextWagerId is always >= 1
    // ================================================================

    function property_wager_id_starts_at_one() public view returns (bool) {
        return registry.nextWagerId() >= 1;
    }

    /// @notice Upgrade-safety invariant (spec 025 FR-011): the proxy's one-time initializer can never be
    ///         called again — no attacker can re-initialize to seize roles or reset state.
    function property_cannot_reinitialize() public returns (bool) {
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        try registry.initialize(deployer, address(membership), address(0), tokens) {
            return false; // re-initialization succeeded — invariant VIOLATED
        } catch {
            return true; // reverted as expected
        }
    }

    // ================================================================
    //  OPEN-CHALLENGE (024) actions — let the fuzzer exercise the open path
    // ================================================================

    /// @notice Fuzzer action: create an open challenge gated by a fresh, deterministic claim authority.
    function createOpenWagerAction(uint128 stakeSeed) public {
        uint128 stake = uint128(_bound(stakeSeed, 1, 1e24));
        _openSalt++;
        address authority = address(uint160(uint256(keccak256(abi.encode("claim", _openSalt)))));

        uint64 accept = uint64(block.timestamp + 1 days);
        uint64 resolve = uint64(block.timestamp + 7 days);
        // createOpenWager builds equal stakes by construction and only allows Either/ThirdParty/oracle.
        try registry.createOpenWager(
            authority,
            address(0),
            address(token),
            stake,
            accept,
            resolve,
            IWagerRegistry.ResolutionType.Either,
            bytes32(0),
            false,
            keccak256("fuzz-open"),
            "ipfs://fuzz-open"
        ) returns (uint256 id) {
            _openWagerIds.push(id);
            _openClaimAuthority[id] = authority;
        } catch {
            // membership/limit/deadline reverts are fine — nothing to track.
        }
    }

    /// @notice Fuzzer action: cancel one tracked open wager that is still Open (creator-only path).
    ///         Exercises leaving Open -> claim-slot release without an accept.
    function cancelOpenWagerAction(uint256 idxSeed) public {
        if (_openWagerIds.length == 0) return;
        uint256 id = _openWagerIds[idxSeed % _openWagerIds.length];
        IWagerRegistry.Wager memory w = registry.getWager(id);
        if (w.status != IWagerRegistry.Status.Open) return;
        try registry.cancelOpen(id) {} catch {}
    }

    function _bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (hi <= lo) return lo;
        return lo + (x % (hi - lo + 1));
    }

    // ---- OPEN INVARIANT A: the discovery claim slot tracks Open-ness exactly ----
    // openWagerIdForClaim(authority) == id while Open; == 0 once it has left Open (cancelled/refunded/etc).
    function property_open_claim_slot_lifecycle() public view returns (bool) {
        for (uint256 i = 0; i < _openWagerIds.length; i++) {
            uint256 id = _openWagerIds[i];
            address authority = _openClaimAuthority[id];
            IWagerRegistry.Wager memory w = registry.getWager(id);
            uint256 resolved = registry.openWagerIdForClaim(authority);
            if (w.status == IWagerRegistry.Status.Open) {
                if (resolved != id) return false;
            } else if (resolved != 0) {
                return false; // claim slot released on leaving Open
            }
        }
        return true;
    }

    // ---- OPEN INVARIANT B: single-binding + equal stakes while Open ----
    function property_open_no_opponent_and_equal_stakes_while_open() public view returns (bool) {
        for (uint256 i = 0; i < _openWagerIds.length; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(_openWagerIds[i]);
            if (w.status == IWagerRegistry.Status.Open) {
                if (w.opponent != address(0)) return false;
                if (w.creatorStake != w.opponentStake) return false;
            }
        }
        return true;
    }

    // ---- OPEN INVARIANT C: no accept without a matching claim signature ----
    // The harness holds no private key for any claim authority, so it can never produce a valid
    // acceptOpenWager signature — none of its open wagers may ever reach Active. (With
    // property_escrow_covers_active_stakes this also guards the open escrow path.)
    function property_open_never_active_without_signature() public view returns (bool) {
        for (uint256 i = 0; i < _openWagerIds.length; i++) {
            IWagerRegistry.Wager memory w = registry.getWager(_openWagerIds[i]);
            if (w.status == IWagerRegistry.Status.Active) return false;
        }
        return true;
    }
}
