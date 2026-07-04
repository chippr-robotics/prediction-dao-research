// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {ERC3009Auth} from "../interfaces/IERC3009.sol";
import {IWagerRegistryTypes} from "../interfaces/IWagerRegistryTypes.sol";
import {IWagerRegistryIntents} from "../interfaces/IWagerRegistryIntents.sol";
import "../interfaces/IMembershipManager.sol";
import "../interfaces/ISanctionsGuard.sol";
import "../oracles/IOracleAdapter.sol";

/// @title WagerRegistryCore
/// @notice Shared storage + internal logic for the two wager-registry facets (spec 035):
///         the main {WagerRegistry} implementation and the {WagerRegistryIntents} extension that
///         the main facet reaches via a delegatecall fallback. BOTH facets execute against the
///         SAME proxy storage, so both MUST inherit this exact contract — the storage layout is
///         defined once, here, and can never drift between facets.
/// @dev    Every internal action body takes the acting identity (`actor`/`creator`/`taker`) as a
///         parameter instead of reading msg.sender (spec 035 twin invariant): the self-submit
///         externals pass msg.sender, the intent twins pass the recovered signer. All checks —
///         sanctions screen, membership gate, ownership, freeze — evaluate that parameter.
///         Storage rules are unchanged: append-only above the trailing `__gap`.
abstract contract WagerRegistryCore is
    IWagerRegistryTypes,
    UUPSManaged,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    using ECDSA for bytes32;

    bytes32 public constant WAGER_PARTICIPANT_ROLE = keccak256("WAGER_PARTICIPANT_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant ACCOUNT_MODERATOR_ROLE = keccak256("ACCOUNT_MODERATOR_ROLE");

    uint64 public constant MAX_ACCEPT_WINDOW = 30 days;
    uint64 public constant MAX_RESOLVE_WINDOW = 180 days;

    /// @notice EIP-712 typehash for an open-challenge acceptance. Binding `taker` to the signature is the
    ///         front-running defense (FR-011): a copied signature is useless to anyone else. Under a relayer
    ///         the taker is the recovered intent signer, not msg.sender (spec 035 open-accept rebinding).
    bytes32 internal constant OPEN_ACCEPT_TYPEHASH = keccak256("OpenAccept(uint256 wagerId,address taker)");

    // ================================================================================================
    // STORAGE — shared by both facets. Append-only; never insert, reorder, or remove. The trailing
    // __gap MUST shrink by exactly the number of slots appended. Validated by check:storage-layout.
    // ================================================================================================

    IMembershipManager public membershipManager;
    IOracleAdapter public polymarketAdapter;

    /// @notice Non-bypassable on-chain sanctions guard (Spec 007, FR-054). When unset
    ///         (address(0)) screening is skipped — the production deploy wires it in.
    ISanctionsGuard public sanctionsGuard;

    /// @notice Generic registry for non-Polymarket oracle adapters keyed by ResolutionType.
    ///         Polymarket retains its dedicated `polymarketAdapter` slot for ABI compatibility.
    mapping(ResolutionType => IOracleAdapter) public oracleAdapters;

    mapping(address => bool) internal _allowedTokens;
    mapping(uint256 => Wager) internal _wagers;
    mapping(address => bool) internal _frozen;

    /// @notice Governing T&C version hash bound to a wager at creation (Spec 007, FR-056/
    ///         FR-057). 0 ⇒ legacy/unbound (governed by the launch version). Set only via
    ///         createWagerWithTerms; never re-bound (prospective-only).
    mapping(uint256 => bytes32) public wagerTermsVersionHash;
    /// @dev Initialized to 1 in {WagerRegistry.initialize} (NOT inline — inline initializers run in
    ///      constructor context and are ignored behind a proxy, which would start wager ids at 0).
    uint256 internal _nextWagerId;

    /// @notice Per-wager draw-consent bitmask for participant resolution types
    ///         (Either/Creator/Opponent). bit0 = creator agreed, bit1 = opponent
    ///         agreed. A draw settles only once both bits are set; cleared on
    ///         settle or revoke. Kept out of the Wager struct so getWager's ABI
    ///         is unchanged. Not used for ThirdParty (arbitrator settles solo)
    ///         or oracle types (a draw arises only from the oracle tie).
    mapping(uint256 => uint8) internal _drawConsent;
    uint8 internal constant _CONSENT_CREATOR = 1;
    uint8 internal constant _CONSENT_OPPONENT = 2;
    uint8 internal constant _CONSENT_BOTH = 3;

    /// @notice Append-only per-user index of every wager a participant has been part of.
    ///         Populated in `createWager` for both creator and opponent; never removed.
    ///         Enables O(N_user) lookup without log scans (avoids `eth_getLogs` block-range limits).
    mapping(address => EnumerableSet.UintSet) internal _userWagerIds;

    // ---- Open challenges (feature 024), appended after all prior state (consumes 2 __gap slots) ----
    /// @notice Code-derived address committed to an open challenge. 0 ⇒ not an open challenge. Set in
    ///         createOpenWager; cleared when the wager leaves Open (accept / cancel / expire / refund).
    mapping(uint256 => address) public claimAuthority;
    /// @notice Reverse index: the single Open open-challenge for a claim authority (0 ⇒ none). Powers code
    ///         discovery (FR-007) and active-uniqueness (FR-006a).
    mapping(address => uint256) public openWagerIdByClaim;

    // ---- Gasless intents (spec 035), appended after all prior state (consumes 3 __gap slots; the
    //      intent replay-nonce map lives in SignerIntentBase's ERC-7201 namespaced storage — zero
    //      gap cost) ----
    /// @notice When true, the `…WithAuthorization` twins consume the signer's second (bounded) EIP-3009
    ///         fee authorization and forward it to {_gasFeeRecipient} atomically (FR-015/FR-016).
    ///         External getters live in the {WagerRegistryIntents} facet (main-facet code-size headroom).
    bool internal _feeNettingEnabled;
    /// @notice Segregated stablecoin fee recipient — MUST NOT be the relayer hot key (spec 036 SC-015).
    ///         Packs with {_feeNettingEnabled} into one slot.
    address internal _gasFeeRecipient;
    /// @notice Hard per-transaction ceiling on the fee authorization a twin will consume.
    uint256 internal _maxGasFee;
    /// @notice The {WagerRegistryIntents} extension facet the main facet delegatecalls for unknown
    ///         selectors (the intent twins + relocated cold paths). Zero ⇒ intents disabled. Set only
    ///         via {WagerRegistry.setIntentExtension} (UPGRADER_ROLE — same authority as an upgrade,
    ///         because the extension executes with full access to this proxy's storage).
    address public intentExtension;

    /// @dev Trailing storage reserve for append-only upgrades. Reduced 50 → 48 when the two
    ///      open-challenge mappings were appended (feature 024), then 48 → 45 for spec 035
    ///      (`feeNettingEnabled`+`gasFeeRecipient` pack into one slot, `maxGasFee`, `intentExtension`).
    ///      Never insert or reorder existing state above this gap.
    uint256[45] private __gap;

    // ================================================================================================
    // Errors + modifiers (shared by both facets)
    // ================================================================================================

    error ZeroAddress();
    error SelfWager();
    error NotAllowedToken();
    error ZeroStake();
    error BadDeadlines();
    error ArbitratorRequired();
    error ArbitratorDisallowed();
    error PolymarketRequired();
    error PolymarketDisallowed();
    error AdapterNotSet();
    error OracleAdapterNotSet();
    error OracleConditionRequired();
    error UnsupportedOracleResolutionType();
    error ConditionNotResolved();
    error ConditionAlreadyResolved();
    error MembershipDenied();
    error NotOpponent();
    error NotOpen();
    error NotActive();
    error AcceptExpired();
    error ResolveExpired();
    error NotAuthorized();
    error EitherRequiresEqualStakes();
    error WinnerNotParticipant();
    error NotWinner();
    error NotResolved();
    error AlreadyPaid();
    error NotRefundable();
    error NotCreator();
    error NotParticipant();
    error DrawNotApplicable();
    error NoDrawProposal();
    error AccountFrozenError(address user);
    // Open challenges (feature 024)
    error ZeroClaimAuthority();
    error ClaimAuthorityInUse();
    error OpenResolutionTypeNotAllowed();
    error NotOpenChallenge();
    error BadClaimSignature();
    error ArbitratorCannotTake();
    error InsufficientMembershipTier();
    error DeclineNotAllowedForOpenChallenge();
    // Spec 035
    error AuthorizationNotSupported();

    modifier notFrozen(address user) {
        if (_frozen[user]) revert AccountFrozenError(user);
        _;
    }

    // ================================================================================================
    // Shared internal logic
    // ================================================================================================

    /// @dev Sanctions screen (Spec 007, FR-054). No-op when the guard is unset; otherwise
    ///      reverts ISanctionsGuard.SanctionedAddress(account) for a listed/sanctioned
    ///      address. Called read-only during the Checks phase (before effects/transfers).
    function _screen(address account) internal view {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) guard.checkBlocked(account);
    }

    function _isExtensibleOracleType(ResolutionType rt) internal pure returns (bool) {
        return rt == ResolutionType.ChainlinkDataFeed
            || rt == ResolutionType.ChainlinkFunctions
            || rt == ResolutionType.UMA;
    }

    function _isOracleResolvedType(ResolutionType rt) internal pure returns (bool) {
        return rt == ResolutionType.Polymarket || _isExtensibleOracleType(rt);
    }

    /// @dev Shared deadline checks for both create paths (named-opponent and open challenge).
    function _checkDeadlines(uint64 acceptDeadline, uint64 resolveDeadline) internal view {
        if (acceptDeadline <= block.timestamp) revert BadDeadlines();
        if (resolveDeadline <= acceptDeadline) revert BadDeadlines();
        if (acceptDeadline > block.timestamp + MAX_ACCEPT_WINDOW) revert BadDeadlines();
        if (resolveDeadline > block.timestamp + MAX_RESOLVE_WINDOW) revert BadDeadlines();
    }

    /// @dev Shared oracle-condition validation/linkage for both create paths. For oracle types the condition
    ///      must be set, the adapter configured, and the condition not already resolved (stale-condition
    ///      mitigation); non-oracle types must not carry a condition.
    function _checkOracleLinkage(ResolutionType resolutionType, bytes32 conditionId) internal view {
        if (resolutionType == ResolutionType.Polymarket) {
            if (conditionId == bytes32(0)) revert PolymarketRequired();
            if (address(polymarketAdapter) == address(0)) revert AdapterNotSet();
            if (polymarketAdapter.isConditionResolved(conditionId)) revert ConditionAlreadyResolved();
        } else if (_isExtensibleOracleType(resolutionType)) {
            if (conditionId == bytes32(0)) revert OracleConditionRequired();
            IOracleAdapter adapter = oracleAdapters[resolutionType];
            if (address(adapter) == address(0)) revert OracleAdapterNotSet();
            if (adapter.isConditionResolved(conditionId)) revert ConditionAlreadyResolved();
        } else {
            if (conditionId != bytes32(0)) revert PolymarketDisallowed();
        }
    }

    /// @dev Stake escrow pull. The base implementation supports only the allowance path
    ///      (self-submit); the {WagerRegistryIntents} facet overrides it to add the EIP-3009
    ///      authorization path for relayed intents. Keeping the 3009 code out of the main facet
    ///      preserves its code-size headroom.
    function _pullStake(
        address token,
        address from,
        uint128 amount,
        bytes32 paymentNonce,
        ERC3009Auth memory auth,
        bool viaAuth
    ) internal virtual {
        (paymentNonce, auth); // unused in the base (allowance) path
        if (viaAuth) revert AuthorizationNotSupported();
        IERC20(token).safeTransferFrom(from, address(this), amount);
    }

    /// @dev Zero-value authorization placeholder for the self-submit paths (never consumed).
    function _emptyAuth() internal pure returns (ERC3009Auth memory auth) {}

    /// @dev Shared accept-time gauntlet for both accept paths: sanctions-screen the taker (the acting
    ///      identity — msg.sender when self-submitted, the recovered signer when relayed) and the creator,
    ///      then enforce the membership gate on the taker. (Spec 007 FR-054 + membership; spec 035 FR-003.)
    function _runAcceptGuard(address taker, address creator) internal view {
        _screen(taker);
        _screen(creator);
        if (!membershipManager.checkCanCreate(taker, WAGER_PARTICIPANT_ROLE)) revert MembershipDenied();
    }

    /// @dev Shared accept tail for both accept paths: escrow the taker's stake, charge the membership
    ///      counter, and emit {WagerAccepted}. Status/opponent effects happen at the call site first
    ///      (checks-effects-interactions).
    function _settleAccept(
        address taker,
        uint256 wagerId,
        address token,
        uint128 opponentStake,
        bool viaAuth,
        ERC3009Auth memory stakeAuth
    ) internal {
        _pullStake(token, taker, opponentStake, stakeAuth.nonce, stakeAuth, viaAuth);
        membershipManager.recordCreate(taker, WAGER_PARTICIPANT_ROLE);
        emit WagerAccepted(wagerId, taker);
    }

    /// @dev Shared create body for both submission paths. `creator` is the acting identity —
    ///      msg.sender when self-submitted, the recovered intent signer when relayed (spec 035).
    ///      Every check (sanctions, membership, self-wager, arbitrator) evaluates `creator`; the
    ///      stake is pulled from `creator` by allowance or by their stapled EIP-3009 authorization.
    function _createWager(
        address creator,
        IWagerRegistryIntents.CreateArgs memory a,
        bool viaAuth,
        ERC3009Auth memory stakeAuth
    ) internal returns (uint256 wagerId) {
        // Sanctions screen (Spec 007, FR-054) — first Check, before any effects/transfers.
        _screen(creator);
        if (a.opponent == address(0)) revert ZeroAddress();
        if (a.opponent == creator) revert SelfWager();
        if (!_allowedTokens[a.token]) revert NotAllowedToken();
        if (a.creatorStake == 0 || a.opponentStake == 0) revert ZeroStake();
        _checkDeadlines(a.acceptDeadline, a.resolveDeadline);

        // "Either side submits the outcome" (ResolutionType.Either) is a mutual-trust
        // resolution path — no oracle, no arbitrator, and whoever calls declareWinner
        // first decides the result. That is only sound on a level peer-to-peer wager
        // where both sides stake the same amount. On an asymmetric "Offer" (leveraged)
        // wager the side risking less could self-declare and seize the larger
        // counterparty stake, so restrict Either to equal-stakes (non-leveraged) bets.
        if (a.resolutionType == ResolutionType.Either && a.creatorStake != a.opponentStake) {
            revert EitherRequiresEqualStakes();
        }

        if (a.resolutionType == ResolutionType.ThirdParty) {
            if (a.arbitrator == address(0)) revert ArbitratorRequired();
            if (a.arbitrator == creator || a.arbitrator == a.opponent) revert ArbitratorDisallowed();
        } else {
            if (a.arbitrator != address(0)) revert ArbitratorDisallowed();
        }

        _checkOracleLinkage(a.resolutionType, a.conditionId);

        // Membership gate
        if (!membershipManager.checkCanCreate(creator, WAGER_PARTICIPANT_ROLE)) revert MembershipDenied();

        // Effects
        wagerId = _nextWagerId++;
        Wager storage w = _wagers[wagerId];
        w.creator = creator;
        w.opponent = a.opponent;
        w.arbitrator = a.arbitrator;
        w.token = a.token;
        w.creatorStake = a.creatorStake;
        w.opponentStake = a.opponentStake;
        w.acceptDeadline = a.acceptDeadline;
        w.resolveDeadline = a.resolveDeadline;
        w.resolutionType = a.resolutionType;
        w.status = Status.Open;
        w.creatorIsYes = a.creatorIsYes;
        w.metadataHash = a.metadataHash;
        w.polymarketConditionId = a.conditionId;
        w.metadataUri = a.metadataUri;

        _userWagerIds[creator].add(wagerId);
        _userWagerIds[a.opponent].add(wagerId);
        // Spec Kit 005: index the arbitrator too (ThirdParty wagers set a non-zero
        // arbitrator) so they can discover the wagers they oversee via
        // getUserWagers(arbitrator) — enabling third-party resolution end-to-end.
        if (a.arbitrator != address(0)) {
            _userWagerIds[a.arbitrator].add(wagerId);
        }
        // Spec 007 (FR-056/FR-057): bind the governing T&C version (Effect, before
        // interactions). 0 ⇒ legacy/unbound. Prospective-only — never re-bound elsewhere.
        if (a.termsVersionHash != bytes32(0)) {
            wagerTermsVersionHash[wagerId] = a.termsVersionHash;
        }

        // Interactions — allowance pull when self-submitted; the creator's stapled EIP-3009
        // authorization when relayed (bound to stake amount + paymentNonce, spec 035 FR-007).
        _pullStake(a.token, creator, a.creatorStake, a.paymentNonce, stakeAuth, viaAuth);
        membershipManager.recordCreate(creator, WAGER_PARTICIPANT_ROLE);

        emit WagerCreated(wagerId, creator, a.opponent, a.token, a.creatorStake, a.opponentStake, a.resolutionType, a.metadataHash, a.metadataUri);
        if (a.resolutionType == ResolutionType.Polymarket) {
            emit PolymarketLinked(wagerId, a.conditionId, a.creatorIsYes);
        } else if (_isExtensibleOracleType(a.resolutionType)) {
            emit OracleConditionLinked(wagerId, a.resolutionType, a.conditionId, a.creatorIsYes);
        }
        if (a.termsVersionHash != bytes32(0)) {
            emit WagerTermsBound(wagerId, a.termsVersionHash);
        }
    }

    /// @dev Shared open-challenge accept body. `taker` is the acting identity (msg.sender when
    ///      self-submitted, the recovered intent signer when relayed) — the claim-code proof is
    ///      verified against `taker`, preserving front-running resistance under a relayer.
    function _acceptOpenWager(
        address taker,
        uint256 wagerId,
        bytes calldata signature,
        bool viaAuth,
        ERC3009Auth memory stakeAuth
    ) internal {
        Wager storage w = _wagers[wagerId];
        address authority = claimAuthority[wagerId];
        if (w.status != Status.Open || authority == address(0)) revert NotOpenChallenge();
        if (block.timestamp > w.acceptDeadline) revert AcceptExpired();

        // Front-running resistant: the signature is only valid for this exact taker. ECDSA
        // .recover rejects malleable/invalid signatures (never returns address(0) to collide with an unset slot).
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(OPEN_ACCEPT_TYPEHASH, wagerId, taker)));
        if (digest.recover(signature) != authority) revert BadClaimSignature();

        if (taker == w.creator) revert SelfWager();
        if (w.resolutionType == ResolutionType.ThirdParty && taker == w.arbitrator) revert ArbitratorCannotTake();

        _runAcceptGuard(taker, w.creator); // no tier floor — any active member may take (FR-013)

        // Effects
        w.opponent = taker;
        w.status = Status.Active;
        _clearClaim(wagerId); // free the code for reuse (FR-006a) before interactions
        _userWagerIds[taker].add(wagerId);
        _settleAccept(taker, wagerId, w.token, w.opponentStake, viaAuth, stakeAuth);
    }

    /// @dev Shared named-opponent accept body; `taker` is the acting identity (spec 035 twin invariant).
    function _acceptWager(address taker, uint256 wagerId, bool viaAuth, ERC3009Auth memory stakeAuth) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (taker != w.opponent) revert NotOpponent();
        if (block.timestamp > w.acceptDeadline) revert AcceptExpired();
        // Sanctions screen both parties (Spec 007, FR-054) + membership gate on the accepting opponent.
        _runAcceptGuard(taker, w.creator);

        w.status = Status.Active;
        _settleAccept(taker, wagerId, w.token, w.opponentStake, viaAuth, stakeAuth);
    }

    /// @dev Clear the claim-authority mappings when an open challenge leaves the Open state, freeing the code
    ///      for reuse. Called from acceptOpenWager, cancelOpen, the Open branch of claimRefund, and
    ///      batchExpireOpen. No-op for non-open-challenge wagers.
    function _clearClaim(uint256 wagerId) internal {
        address a = claimAuthority[wagerId];
        if (a != address(0)) {
            delete openWagerIdByClaim[a];
            delete claimAuthority[wagerId];
        }
    }

    function _cancelOpen(address actor, uint256 wagerId) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (actor != w.creator) revert NotCreator();

        IERC20 token = IERC20(w.token);
        uint128 refund = w.creatorStake;
        address creator = w.creator;

        membershipManager.recordClose(creator, WAGER_PARTICIPANT_ROLE);
        _clearClaim(wagerId); // free the code if this was an open challenge (no-op otherwise)
        delete _wagers[wagerId];

        token.safeTransfer(creator, refund);
        emit WagerCancelled(wagerId);
    }

    function _declineWager(address actor, uint256 wagerId) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        // Decline is a named-opponent action; an open challenge has no bound opponent. Reject it outright so
        // no party other than the creator (via cancelOpen) can release an unaccepted open challenge (FR-023).
        if (claimAuthority[wagerId] != address(0)) revert DeclineNotAllowedForOpenChallenge();
        if (actor != w.opponent) revert NotOpponent();

        IERC20 token = IERC20(w.token);
        uint128 refund = w.creatorStake;
        address creator = w.creator;

        membershipManager.recordClose(creator, WAGER_PARTICIPANT_ROLE);
        delete _wagers[wagerId];

        token.safeTransfer(creator, refund);
        emit WagerDeclined(wagerId, actor);
    }

    function _declareWinner(address actor, uint256 wagerId, address winner) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (block.timestamp > w.resolveDeadline) revert ResolveExpired();
        if (winner != w.creator && winner != w.opponent) revert WinnerNotParticipant();
        if (_isOracleResolvedType(w.resolutionType)) revert NotAuthorized();

        bool authorized;
        if (w.resolutionType == ResolutionType.Either) {
            authorized = (actor == w.creator || actor == w.opponent);
        } else if (w.resolutionType == ResolutionType.Creator) {
            authorized = (actor == w.creator);
        } else if (w.resolutionType == ResolutionType.Opponent) {
            authorized = (actor == w.opponent);
        } else if (w.resolutionType == ResolutionType.ThirdParty) {
            authorized = (actor == w.arbitrator);
        }
        if (!authorized) revert NotAuthorized();

        w.status = Status.Resolved;
        w.winner = winner;
        membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
        membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);

        emit WagerResolved(wagerId, winner, actor);
    }

    function _declareDraw(address actor, uint256 wagerId) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (block.timestamp > w.resolveDeadline) revert ResolveExpired();
        if (_isOracleResolvedType(w.resolutionType)) revert DrawNotApplicable();

        if (w.resolutionType == ResolutionType.ThirdParty) {
            if (actor != w.arbitrator) revert NotAuthorized();
            _settleDraw(wagerId, w, actor);
            return;
        }

        // Participant types: accumulate mutual consent; settle only when both agree.
        uint8 bit;
        if (actor == w.creator) {
            bit = _CONSENT_CREATOR;
        } else if (actor == w.opponent) {
            bit = _CONSENT_OPPONENT;
        } else {
            revert NotParticipant();
        }

        uint8 consent = _drawConsent[wagerId];
        if ((consent & bit) == 0) {
            consent |= bit;
            _drawConsent[wagerId] = consent;
            emit DrawProposed(wagerId, actor);
        }
        if (consent == _CONSENT_BOTH) {
            _settleDraw(wagerId, w, actor);
        }
    }

    function _revokeDraw(address actor, uint256 wagerId) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();

        uint8 bit;
        if (actor == w.creator) {
            bit = _CONSENT_CREATOR;
        } else if (actor == w.opponent) {
            bit = _CONSENT_OPPONENT;
        } else {
            revert NotParticipant();
        }

        uint8 consent = _drawConsent[wagerId];
        if ((consent & bit) == 0) revert NoDrawProposal();
        _drawConsent[wagerId] = consent & ~bit;
        emit DrawRevoked(wagerId, actor);
    }

    /// @dev Shared draw settlement: each party gets their own stake back, no
    ///      winner. Checks-effects-interactions — status and consent are cleared
    ///      before any token transfer (parity with claimRefund). `by` is the
    ///      acting identity that completed the draw (msg.sender or intent signer).
    function _settleDraw(uint256 wagerId, Wager storage w, address by) internal {
        w.status = Status.Draw;
        delete _drawConsent[wagerId];
        membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
        membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);

        IERC20 token = IERC20(w.token);
        token.safeTransfer(w.creator, w.creatorStake);
        token.safeTransfer(w.opponent, w.opponentStake);

        emit WagerDrawn(wagerId, w.creator, w.opponent, by);
    }

    /// @dev Shared body for oracle-driven settlement. creatorIsYes maps outcome to winner:
    ///      creatorIsYes=true,  outcome=true  -> creator wins
    ///      creatorIsYes=true,  outcome=false -> opponent wins
    ///      creatorIsYes=false, outcome=true  -> opponent wins
    ///      creatorIsYes=false, outcome=false -> creator wins
    function _settleOracleWin(uint256 wagerId, Wager storage w, bool outcome) internal {
        address winner = (outcome == w.creatorIsYes) ? w.creator : w.opponent;
        w.status = Status.Resolved;
        w.winner = winner;
        membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
        membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);

        emit WagerResolved(wagerId, winner, msg.sender);
    }

    function _claimPayout(address actor, uint256 wagerId) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Resolved) revert NotResolved();
        if (actor != w.winner) revert NotWinner();
        if (w.paid) revert AlreadyPaid();

        w.paid = true;
        // Compute as uint256 to avoid uint128 overflow on sum
        uint256 payout = uint256(w.creatorStake) + uint256(w.opponentStake);
        IERC20(w.token).safeTransfer(w.winner, payout);

        emit PayoutClaimed(wagerId, w.winner, payout);
    }

    /// @dev Refunds always pay the original participants, so no actor threading is needed — the
    ///      caller/signer only has to pass the freeze gate (either counterparty or a neutral third
    ///      party can drive settlement, unchanged behavior).
    function _claimRefund(uint256 wagerId) internal {
        Wager storage w = _wagers[wagerId];
        if (w.status == Status.Open) {
            if (block.timestamp <= w.acceptDeadline) revert NotRefundable();
            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
            _clearClaim(wagerId); // free the code if this was an open challenge (no-op otherwise)
            IERC20(w.token).safeTransfer(w.creator, w.creatorStake);
            emit WagerRefunded(wagerId, w.creator, address(0));
        } else if (w.status == Status.Active) {
            if (block.timestamp <= w.resolveDeadline) revert NotRefundable();
            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
            membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);
            IERC20 token = IERC20(w.token);
            token.safeTransfer(w.creator, w.creatorStake);
            token.safeTransfer(w.opponent, w.opponentStake);
            emit WagerRefunded(wagerId, w.creator, w.opponent);
        } else {
            revert NotRefundable();
        }
    }

    /// @dev Body of batchExpireOpen (served by the {WagerRegistryIntents} facet since spec 035 —
    ///      the main facet forwards the selector through its fallback; behavior is unchanged).
    function _batchExpireOpen(uint256[] calldata wagerIds) internal {
        for (uint256 i = 0; i < wagerIds.length; i++) {
            Wager storage w = _wagers[wagerIds[i]];
            if (w.status != Status.Open) continue;
            if (block.timestamp <= w.acceptDeadline) continue;

            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
            _clearClaim(wagerIds[i]); // free the code if this was an open challenge (no-op otherwise)
            IERC20(w.token).safeTransfer(w.creator, w.creatorStake);
            emit WagerRefunded(wagerIds[i], w.creator, address(0));
        }
    }
}
